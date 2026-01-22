# Architecture

## Key Services

| Service              | Purpose                                                                                |
| -------------------- | -------------------------------------------------------------------------------------- |
| **AWS DynamoDB**     | The database. Contains info about albums, images, and videos                           |
| **AWS S3**           | Stores media files, both originals and derived: resizes, thumbnails, transcoded videos |
| **AWS Lambda**       | API fulfillment, EXIF extraction, image resizing                                       |
| **AWS MediaConvert** | Video transcoding                                                                      |
| **AWS API Gateway**  | REST API for the front end website                                                     |
| **AWS CloudFront**   | CDN delivery of media (image and video files)                                          |
| **Redis Labs**       | Search - _not_ an AWS service!                                                         |

## Domain Model

### Object Model

This is the conceptual model of the gallery. There are Typescript interfaces and classes that implement this model:

```text
Gallery Item
    Album
    Media
        Image
        Video
```

Key fields:

| Field       | Description                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `itemType`  | `'album'` or `'image'`, a legacy name that means 'media' (image or video). We'll replace `image` with `media` in a migration at some point. |
| `mediaType` | `'video'` or `'image'` / `undefined` for images. We'll replace `undefined` with `image` in a migration at some point.                       |
| `path`      | Gallery path (e.g., `/2024/06-15/photo.jpg`). Used in URLs, S3 keys, and database indices.                                                  |

### Gallery Path Structure

This path structure is used all over: URLs, S3 keys, database indices.

- Root album: `/`
- Year albums: `/YYYY/`
- Day albums: `/YYYY/MM-DD/`
- Media: `/YYYY/MM-DD/my_photo.jpg`

## Media Storage (AWS S3)

There are two S3 buckets:

| Bucket        | Contents                                                                           |
| ------------- | ---------------------------------------------------------------------------------- |
| **Originals** | Original photos and videos                                                         |
| **Derived**   | Generated assets: thumbnails, detail page images, transcoded videos, poster frames |

### S3 Originals Bucket

Stores original uploads as uploaded by users.

#### S3 Key Structure

The S3 key structure is `YYYY/MM-DD/filename.ext`, which is the gallery path with leading slash stripped. This creates a "folder" structure (S3 doesn't actually have folders) that mimics how the originals are stored on our personal computers and in Dropbox backup:

```text
2001/
    10-01/
    12-31/
2002/
    01-01/
        my_photo.jpg
        my_screenshot.png
        my_video.mov
```

#### Upload Processing

When a file in the Originals bucket is created or changed, it triggers a lambda that processes the media (such as extracting EXIF info) and creates/updates the media's record in DynamoDB.

This supports multiple workflows for uploading media:

- **Front end**: the Sveltekit UI uploads photos and videos by getting a presigned URL and uploading it to the Originals bucket.
- **Manually**: people with direct access to the S3 bucket can simply add an image or video to `YYYY/MM-DD/filename.ext` and it gets processed. This was vital for the initial migration to the system, and is still useful for testing in the dev and integration test environments.

#### Versioning

S3 versioning is enabled on the Originals bucket. Each upload generates a new `versionId` tracked in DynamoDB. Old versions auto-expire after 24 days.

### S3 Derived Bucket

Stores generated assets: thumbnails, detail page images, transcoded videos, and video poster frames.

#### S3 Key Structure

The S3 key structure is `i/<path>/<versionId>/asset`:

```text
i/2001/12-31/my_video.mov/<versionId>/
├── 200x200             ← Thumbnail
├── 1024                ← Detail page image
├── video-transcoded    ← Transcoded video
└── video-poster        ← JPG used as source for video thumbnail and detail page
```

#### No Extensions

Files are stored without extensions:

- This simplifies client access: the front end doesn't have to know what content type a derived asset is.
- This enables format changes (e.g., JPG → AVIF) without URL migrations.

This DOES mean, however, that the content type _must_ be stored as S3 metadata. S3 generally does that automatically (like the MediaConvert job does it), but it's something that must be accounted for and tested.

#### Versioning

S3 versioning is disabled on the Derived bucket. Instead, assets are stored by the S3 version of the **original** media item: `i/2001/12-31/my_video.mov/<versionId>/`. This allows stale clients to continue accessing the old versions, even after the asset has been renamed. It means we can cache each derived asset immutably.

**No deleting old versions**. The system doesn't delete old versions of derived assets. We want to keep them around for at least a while until there's no more stale clients. And a new version is only created when a new media item is dragged over an existing one, which is super rare. So storage isn't an issue. We just keep them.

## Database (AWS DynamoDB)

There are two DynamoDB tables:

| Table      | Purpose                                           |
| ---------- | ------------------------------------------------- |
| **Items**  | Metadata about albums and media items             |
| **Errors** | Async failures that the frontend needs to display |

### Items Table

Stores albums and media items (images and videos).

**Composite key:**

- **Partition key:** `parentPath` (e.g., `/2024/`)
- **Sort key:** `itemName` (e.g., `01-15` or `photo.jpg`)

**Item types:**

| Field        | Albums           | Images         | Videos             |
| ------------ | ---------------- | -------------- | ------------------ |
| `itemType`   | `'album'`        | `'image'`      | `'image'` (legacy) |
| `mediaType`  | —                | —              | `'video'`          |
| `versionId`  | —                | ✓              | ✓                  |
| `dimensions` | —                | ✓              | ✓                  |
| `duration`   | —                | —              | ✓ (seconds)        |
| `thumbnail`  | pointer to media | crop rectangle | crop rectangle     |

**Streams:** Enabled (`NEW_IMAGE` view) for real-time Redis sync.

### Errors Table

Tracks async failures that the frontend needs to display.

| Field          | Description                                               |
| -------------- | --------------------------------------------------------- |
| `path`         | Partition key. Gallery path of the failed item.           |
| `errorType`    | Error category (e.g., `'media_processing'`).              |
| `errorMessage` | Human-readable error description.                         |
| `timestamp`    | ISO 8601 timestamp of when the error occurred.            |
| `ttl`          | Unix epoch seconds; DynamoDB auto-deletes after 24 hours. |

**Current use:** Media processing failures (video transcoding, EXIF extraction).

## API Layer (AWS API Gateway)

All API calls from the front end go through the AWS API Gateway.

- **Authentication:** AWS Cognito User Pool; ID tokens delivered via HTTP-only cookies.
- **Authorization:**
    - _Read operations:_ Token existence check only (fast path for public content)
    - _Write operations:_ Full JWT validation required
- **CORS:** Enabled for gallery app domain with credentials support.

## Compute (AWS Lambda)

There's no persistent server; all processing is done via Lambdas. There's a few different types of Lambdas, triggered by different things:

| Category                    | Responsibilities                                     | Trigger                                   |
| --------------------------- | ---------------------------------------------------- | ----------------------------------------- |
| **API handlers**            | Album & media CRUD, search, presigned URL generation | API Gateway                               |
| **Upload processing**       | EXIF extraction, video transcoding initiation        | S3 ObjectCreated on the Originals bucket  |
| **Transcoding completion**  | Writes DynamoDB record or error                      | EventBridge (MediaConvert)                |
| **Thumbnail generation**    | Generates derived images (resizes via Sharp)         | Lambda Function URL (CloudFront failover) |
| **Search index population** | Sync a DynamoDB item to Redis                        | DynamoDB Streams                          |

### Custom Lambda Layer for HEIC

**Sharp + HEIC:** Media processing and image generation use a custom Lambda Layer with Sharp compiled with libheif for HEIC support.

## Search (Redis)

Redis is used as the search engine. It's hosted by Redis Labs; AWS doesn't provide a nice cheap Redis.

- **Sync:** Items are sync'ed from DynamoDB in real-time via DynamoDB Streams
- **Capabilities:** Full-text search, date range filtering, item type filtering, pagination
- **Indexed fields:** `itemName`, `title`, `summary`, `tags`, `albumDate`

### Auto-tags for filtering by media type

To allow users to filter search results by media type, the system injects some tags into the Redis entries:

- **Videos** get auto-tags: `movie`, `video`, `clip`
- **Images** get auto-tags: `photo`, `image`, `picture`

This allows searches like:

- "teddy bear movie" → finds videos about teddy bears, excludes photos
- "teddy bear photo" → finds images about teddy bears, excludes videos

These auto-tags are added during the DynamoDB-to-Redis sync and are stored in the `tags` array alongside any user-defined tags.

## CDN (AWS CloudFront) & URLs / Routing

All media files are delivered to browsers via the AWS CloudFront CDN.

**Distribution domain:** `img.{environment}.tacocat.com`

**Three origins:**

1. **Originals bucket** — Direct S3 access (default route)
2. **Derived bucket** — S3 with Origin Access Identity
3. **Lambda** — Failover for cache misses on derived images

**URL routing:**

| Route   | Purpose         | Original URL                                       | S3 Key                                        |
| ------- | --------------- | -------------------------------------------------- | --------------------------------------------- |
| `/i/*`  | Derived images  | `/i/2024/06-15/photo.jpg?version=abc&size=200x200` | `i/2024/06-15/photo.jpg/abc/200x200`          |
| `/v/*`  | Video playback  | `/v/2024/06-15/video.mp4?version=abc`              | `i/2024/06-15/video.mp4/abc/video-transcoded` |
| Default | Original images | `/2024/06-15/photo.jpg`                            | `2024/06-15/photo.jpg`                        |

### CloudFront Functions

**CloudFront Functions** are used to rewrite query parameters to S3 paths. The browser sends URLs like this:

```text
https://img.pix.tacocat.com/i/2024/06-15/photo.jpg?version=abc&size=200
```

... which get rewritten by a CloudFront Function to this S3 key:

```text
s3://tacocat-gallery-sam-{env}-derived-images/i/2024/06-15/photo.jpg/abc/200
```

**Caching:**

The system is designed such that derived content can be cached immutably, forever, by browsers and the CDN.

- Derived content (`/i/*`, `/v/*`): Immutable, 1-year TTL. Version in URL ensures immediate updates on re-upload.
- Origin group failover: If derived bucket returns 403/404, Lambda generates the image on demand.

#### Thumbnail Generation Flow

Thumbnails and detail page images are generated **on-demand** the first time they're requested:

1. **Browser requests thumbnail** via URL like `https://img.pix.tacocat.com/i/2024/06-15/photo.jpg?version=abc&size=200x200`
2. **CloudFront Function rewrites** to S3 path: `i/2024/06-15/photo.jpg/abc/200x200`
3. **CloudFront checks cache** - if asset is already cached in CDN, return it immediately. Done!
4. **CloudFront tries Derived bucket first** - if file exists, return it and cache in CDN. Done!
5. **If not found**
    1. **CloudFront fails over to Lambda** -
        1. If the image is not in the Derived bucket, the bucket returns either a 404 (not found) or 403 (access denied, which S3 returns for non-existent keys).
        2. CloudFront Origin Groups allow specifying a failover origin. CloudFront automatically retries the request against a Lambda Function URL pointing at the Derived Image Generation lambda.
    2. **The Derived Image Generation Lambda generates the thumbnail:**
        1. Fetches original from Originals bucket (or poster for videos)
        2. Resizes using Sharp
        3. Writes result to Derived bucket for future requests
        4. If the image is under 5MB, it returns the image directly
            1. **CloudFront caches the response** - subsequent requests served from cache. Done!
        5. If the image is over 5MB, it returns a 503 Service Unavailable with retry-after: 1 header

This "lazy generation" approach means thumbnails are only created when actually needed, and the Lambda is only invoked once per unique thumbnail.
