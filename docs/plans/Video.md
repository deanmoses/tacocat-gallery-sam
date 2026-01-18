# Plan: Video Support

This is a plan for the Tacocat gallery AWS back end to support videos.  Currently, the gallery only supports still images. Users want to upload and view videos alongside their photos.

## Requirements

See [Github Issue #25 - Support videos](https://github.com/deanmoses/tacocat-gallery-sam/issues/25) for the full, detailed requirements. 

## Big Rocks
- Upload videos the same way as images (drag onto album)
- Play videos in the browser without downloading
- Show video thumbnails in album grids
- Provide feedback when video processing fails

## S3 Structure

How the various video-related files are stored in S3.

There are no new buckets.

### Original video

The original video is uploaded to the same place still images are uploaded:
```
Originals Bucket:
  /2001/12-31/my_video.avi    ← Original upload
```
### Transcoded video & poster image

However, videos require a few things that still images don't:
 - **Transcoded video**.  Videos will be transcoded to a universally playable format supported by all browsers.
 - **Poster image**.  A "poster" image will be be extracted from the video.  It'll be used as the source to generate thumbnails and detail page image.

Each video will get a UUID. The transcoded video and poster live in the Derived bucket by UUID:
```
Derived Bucket:
  /video/<UUID>.mp4          ← Transcoded playable version
  /video/<UUID>.jpg          ← Poster image (source for thumbnails)
```

**Poster JPG Quality**.  The poster JPG will never be served to a browser; it's the source for thumbs and detail image.  As such it will be generated with a high quality number.  Use the same quality number used by the HEIC -> JPG original conversion.

### Thumbnails and detail page image

Thumbnails and the derived detail image live in the same place as for images, but unlike images, they are generated from the poster:
```
Derived Bucket:
  /i/2001/12-31/my_video.avi/<versionId>/200      ← Thumbnail (derived from poster)
  /i/2001/12-31/my_video.avi/<versionId>/1024     ← Detail page size (derived from poster)
```

## Video Upload Processing Flow

1. Admin uploads video via Sveltekit front end, dragging and dropping a mixed batch of images and videos.

2. Browser uploads `my_video.avi` to Originals bucket using a presigned URL (same as images).

3. A S3 trigger triggers the `ProcessImageUpload` Lambda (to be renamed to `ProcessMediaUpload`)
   - Detects video extension
   - Validates upload rules (see below)
   - Generates a UUID for the video
   - Starts an AWS MediaConvert job, passing:
     - UUID for output paths
     - JPG quality setting
     - The original video's path and versionId via `userMetadata`

4. AWS MediaConvert (may take minutes)
   - Transcodes to H.264 MP4 with faststart flag
   - Extracts poster frame as JPG
   - Writes outputs to Derived bucket:
     -  `/video/<UUID>.mp4`
     -  `/video/<UUID>.jpg`

5. MediaConvert sends an EventBridge event containing the `userMetadata` containing the original video's path and versionId.

6. This triggers the `VideoTranscodingComplete` lambda, which:
   - If the EventBridge event status (`ERROR`, `CANCELED`), see 'On Failure' below.
   - Else write DynamoDB record with `id` (UUID), `mediaType: 'video'`, `duration`, `path`, `versionId` etc.

7. Frontend polling sees the video appear in album


### Failure Handling

On failure of any step in the processing:

- Write to the error table
  - Write error to the `Error` DynamoDB table (see below) with `errorType: 'media_processing'`
  - The Sveltekit front end polling checks error table, shows failure message
- Clean up
  - Delete the original video from Originals bucket
  - Delete any partial outputs by prefix `/video/<UUID>` from Derived bucket


## Upload Rules

**Replacements must match extension:**

You can't change the format of an item.  Instead, upload the new item, manually copy over its info, and delete the old item. For example:
- Can only replace `foo.jpg` with another `foo.jpg`
- Can only replace `foo.avi` with another `foo.avi`

The exception to this is HEIC.  We don't support HEIC originals.  Instead, HEIC uploads either create a new JPG or replace an existing JPG of the same name, then the HEIC is deleted. This is pre-existing behavior to be preserved.

## DynamoDB Data Model

### Video Records

Video records are stored in the same DynamoDB `items` table as images and albums:

```typescript
interface VideoRecord {
  parentPath: string;           // partition key: /2024/06-15/
  itemName: string;             // sort key: video.avi
  itemType: 'image';            // 'image' now means "media item", either a still image or video
  mediaType: 'video';           // distinguishes from still images
  path: string;                 // /2024/06-15/video.avi
  id?: string;                  // UUID for locating transcoded/poster in Derived bucket
  versionId: string;
  dimensions: { width: number; height: number };
  duration: number;             // seconds
  updatedOn: string;
  title?: string;
  description?: string;
  tags?: string[];
  thumbnail?: Rectangle;        // crop coords for poster
}
```

#### The `itemType` field

- The semantics of the existing `itemType` field changes: 'image' now means 'media'.
- This is because we do not want to run a migration for now.

#### The `mediaType` field

- Images do not get the `mediaType` field.  `itemType`=='image' + `mediaType`==undefined means an image. 
- This is because we do not want to run a migration for now.

#### The `id` field

- UUIDs are generated using `crypto.randomUUID()`, native to Node.js, no library needed.
- The `id` field is only present on videos.  Images do not get the `id` field, because we do not want to run a migration for now.

#### Migration in the future

- In the future (NOT for the initial release of video support) we will consider running a migration and fix up `itemType`, `mediaType` and `id`:
  - Images and videos would both get `itemType`='media'.  There'd no longer be an `itemType`='image'.
  - Images would get `mediaType`='image'.
  - Images would get an `id`, also a UUID.
- After doing this migration would be the appropriate moment to add a GlobalSecondaryIndex on `id`.  
  - This would help with maintenance tasks like finding orphaned UUID folders.
  - Nothing in the system currently needs this.

### Error Table

A new DynamoDB table for any sort of failure that happens async on the back end that the client should know about.  The first use case is video and photo processing, but the table is generic and can support other error types in the future.

```typescript
interface ErrorRecord {
  path: string;                 // partition key
  errorType: ErrorType;         // e.g., 'media_processing'
  errorMessage: string;
  timestamp: string;            // ISO 8601 timestamp
  ttl: number;                  // DynamoDB TTL
}

enum ErrorType {
  MediaProcessing = 'media_processing',
}
```

#### The `errorType` field

- Allows distinguishing errors by type (e.g., `media_processing`)
- Currently only `media_processing` is used, but the table can support other error types in the future

#### The `ttl` field

- `ttl` is a special field in DynamoDB; DynamoDB will auto-delete the record after this moment.
- It represents the exact time at which the item is considered expired.
- The format is a timestamp in the Unix epoch time format, specified in seconds (not milliseconds).
- We set `ttl` to delete after 24 hours.
- 24 hours is long enough for the UI to see it.
- Any longer, you're probably doing forensics, and looking at CloudWatch logs is more appropriate.

## API Changes

### Album API Response

The existing album API (`GET /album/{path}`) returns items in the album. Video items will include new fields:

```typescript
// Existing image item
{
  itemName: "photo.jpg",
  itemType: "image",
  path: "/2024/06-15/photo.jpg",
  versionId: "abc123",
  dimensions: { width: 4032, height: 3024 },
  // ... other fields
}

// New video item
{
  itemName: "video.avi",
  itemType: "image",           // legacy naming, "image" means "media item"
  mediaType: "video",          // NEW: distinguishes from images
  path: "/2024/06-15/video.avi",
  id: "550e8400-e29b-41d4-a716-446655440000", // NEW: UUID for video assets
  versionId: "def456",
  dimensions: { width: 1920, height: 1080 },
  duration: 45,                // NEW: video duration in seconds
  // ... other fields
}
```

The frontend uses `mediaType: 'video'` to render play icon overlays on thumbnails and video players on detail pages.

### New Error Check API

An admin will drag and drop a set of photos and videos into the Sveltekit front end to be uploaded, and need to check which ones have errored.  To do that it needs to be able to make a single API call that passes in all the uploaded items and check their failure status in a batch.

It will be a POST, not a GET, to avoid potential URL length issues:

```
POST /errors
Body: { paths: ["/2024/06-15/video.mov", ...] }
Response: { errors: { "/2024/06-15/video.mov": "Unsupported codec" } }
```

Only paths with errors are returned in the response. Paths that succeeded or are still processing are omitted.

While the media is being processed, the front end will poll with two API calls:
- This error table (for failure).
- Retrieve the album that the media was dropped on.  Existence of the media item in the album indicates success.

For the initial release of video support, it's only necessary to write video processing failures to this table.  Only update image processing errors if you're already in the code.

### Search

Videos are searchable via Redis, just like images.

**Search results include video-specific fields:**
```typescript
// Video in search results
{
  itemName: "video.avi",
  itemType: "image",           // legacy naming, "image" means "media item"
  mediaType: "video",          // distinguishes from images
  path: "/2024/06-15/video.avi",
  id: "550e8400-e29b-41d4-a716-446655440000",
  versionId: "def456",
  dimensions: { width: 1920, height: 1080 },
  duration: 45,
}
```

**Auto-tags for filtering by media type:**

To allow users to filter search results by media type, items are auto-tagged in Redis:

- **Videos** get auto-tags: `movie`, `video`, `clip`
- **Images** get auto-tags: `photo`, `image`, `picture`

This allows searches like:
- "teddy bear movie" → finds videos about teddy bears, excludes photos
- "teddy bear photo" → finds images about teddy bears, excludes videos

These auto-tags are added during the DynamoDB-to-Redis sync and are stored in the `tags` array alongside any user-defined tags.

### Album Thumbnails from Videos

Each album has a thumbnail, just like media items.  The album's thumbnail is a pointer to a media item.  Videos must be able to be set as album thumbnails, same as images. 

The existing flow works:

1. **Set thumbnail API:** `PATCH /album-thumb/{albumPath}` with `{ "imagePath": "/2024/06-15/video.avi" }`
2. **Album record stores:** `thumbnail: { path: "/2024/06-15/video.avi" }`
3. **Frontend requests thumbnail:** Uses same URL pattern with the video path

**Change needed in `GenerateDerivedImage` Lambda:**

When generating a thumbnail for a video path, the Lambda must fetch the **poster** from the Derived bucket instead of the original. The frontend passes the UUID in the request path, avoiding a DynamoDB lookup.

```
Request:  /i/2024/06-15/video.avi/<versionId>/<UUID>/200
Source:   /video/<UUID>.jpg in Derived bucket
```

The Lambda checks if the path has a video extension. If so, it extracts the UUID from the path and reads the poster from `/video/<UUID>.jpg` in the Derived bucket. No DynamoDB lookup is needed because the frontend already has the UUID from the album API response.

### Video Thumbnail Cropping 

Works the same as images. The video record can have a `thumbnail` crop rectangle, which is applied to the poster when generating the derived image.

## Video Playback URL

The frontend constructs the playback URL from the video's UUID:

```
Video id:      550e8400-e29b-41d4-a716-446655440000
Playback URL:  https://{derivedDomain}/video/550e8400-e29b-41d4-a716-446655440000.mp4
```

The frontend gets the `id` field from the album API response and constructs the URL to the Derived bucket (served via CloudFront).

## Video Metadata Extraction

The `VideoProcessingComplete` Lambda needs duration and dimensions for the DynamoDB record.  It gets them from the MediaConvert job output metadata. When MediaConvert completes, the EventBridge event includes job details. The Lambda can also call `GetJob` API to retrieve:
- Output video dimensions
- Duration in seconds

## Video Re-upload

In the Sveltekit front end, a user can drag a new video over an existing one of the same format, and replace it.

The flow:
1. Browser uses a presigned URL to overwrite the original in S3 with new upload
2. The S3 trigger triggers `ProcessMediaUpload` Lambda
3. `ProcessMediaUpload` detects existing video record, reuses the same UUID
4. `ProcessMediaUpload` triggers new MediaConvert job with existing UUID
5. MediaConvert overwrites `/video/<UUID>.mp4` and `/video/<UUID>.jpg`
6. DynamoDB record updated by VideoTranscodingComplete (same UUID, new versionId)
7. Front end polls to detects that processing is done by re-retrieving the album.  If the video has a new versionId, processing is complete.
8. Front end requests thumbnail and detail page using new versionId
9. `GenerateDerivedImage` Lambda generates the new thumbnail using new versionId
   
## Video Rename

In the Sveltekit front end, a user will be able to rename a video.

**Rename process:**
1. Validate that new name has the same extension as the old name, same as images
2. Copy (S3 COPY) the original video to new path in Originals bucket (gets new versionId)
3. Update DynamoDB record (transactional move with new versionId, same UUID)
4. Update album thumbnails if they referenced the old video
5. Delete old original from Originals bucket
6. Delete derived thumbnails with prefix `/i/<old-path>/` (e.g., `/i/2024/06-15/old_video.avi/`). They will be regenerated on demand

The transcoded video and poster at `/video/<UUID>.mp4` and `/video/<UUID>.jpg` are untouched because they're keyed by UUID, not path.

**Comparison with image rename:** Image rename deletes all derived images and lets them regenerate. For videos, we keep the transcoded/poster (expensive to regenerate) but, like images, delete the `/i/` thumbnails (cheap to regenerate).

## Video Delete

In the Sveltekit front end, a user will be able to delete a video.

**Delete process:**
1. Look up DynamoDB record to get UUID
2. Delete from Originals bucket: `/2024/06-15/video.avi`
3. Delete from Derived bucket (list by prefix, then batch delete):
   - Prefix `/video/<UUID>` → deletes `.mp4` and `.jpg`
   - Prefix `/i/2024/06-15/video.avi/` → deletes all thumbnails and detail image
4. Delete DynamoDB record

## Supported Video Extensions

The path validation in `gallery_path_utils` must be updated to accept video extensions. Supported formats:

**Accepted extensions:**
- `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm` - common containers
- `.m4v` - Apple format
- `.3gp` - older mobile format

**Validation changes in `gallery_path_utils`:**
- `isValidImagePath()` - still images only (unchanged)
- `isValidVideoPath()` - videos only (new)
- `isValidMediaPath()` - both images and videos (new)

Calling sites can choose the appropriate function. For example:
- Presigned URL endpoint uses `isValidMediaPath()` to allow both
- `ProcessMediaUpload` Lambda will use extension to determine image vs video processing path
- Existing image-only code continues using `isValidImagePath()`

## Technical Decision Log

Decisions that have been made, alternatives considered, tradeoffs.

### Use MediaConvert for transcoding

The alternative would have been use use Lambda + ffmpeg.

- Lambda has 15-minute timeout and 10GB temp storage, which would be fine for short clips, but 20-minute 4K videos would push limits.  AWS MediaConvert handles any size without concern.
- MediaConvert only costs ~$0.015/minute of video

### Transcode everything, even H.264 MP4

Some uploads are already in a streaming-friendly format:
- Android phones in "Compatibility" mode record H.264/AAC MP4
- Consumer cameras and GoPros often default to H.264 MP4

We will transcode those anyway because:
1. **faststart flag** - Even H.264 MP4 might not have `moov` atom at front (required for streaming without full download)
2. **Bitrate normalization** - A 4K@60fps at 100Mbps streams poorly; transcoding normalizes quality
3. **Simplicity** - Detecting "already good enough" requires probing codec, container, moov position, bitrate, audio codec
4. **Consistency** - Every video gets same poster/thumbnail generation, same file naming, same quality
5. **Transcoding is cheap** - AWS MediaConvert costs ~$0.015/min; simplicity outweighs savings from passthrough detection

### Transcoding Settings

**Codec:** H.264 with QVBR (Quality-Defined Variable Bitrate) at quality level 7 (out of 10).
 - This lets MediaConvert vary the bitrate based on scene complexity while staying under MaxBitrate

**Max bitrate:** 5 Mbps. This is based on:
- Netflix streams 1080p at 4-7 Mbps ([Netflix Help Center](https://help.netflix.com/en/node/306))
- Netflix 1080p: 5-8 Mbps
- YouTube 1080p: 8 Mbps recommended upload, but they re-encode lower
- iPhone 1080p HEVC: ~15-25 Mbps native, but that's overkill for web playback
- This is a family photo gallery viewed on phones/tablets/laptops over home WiFi, not a cinema
- 5 Mbps balances quality vs storage costs and buffering on slower connections

**Audio:** AAC at 128 kbps stereo, 48 kHz sample rate. Standard for web video.

### Playback: Progressive MP4

The alternative was use use HLS, which would have added a lot of complexity.

- H.264 MP4 with `faststart` moves metadata to front
- CloudFront supports byte-range requests for seeking
- Simpler than HLS (no playlist files, no segment management)
- Sufficient for short-to-medium clips on reasonable connections
- HLS would only matter for very long videos or highly variable bandwidth

### Upload: Presigned URLs

The alternative was to use multi-part upload.

Reasons to use Presigned URLs:
- **Works as-is**.  No changes to how uploads work
   - This is the same mechanism as images: user uploads directly to S3 via presigned URL.
- **Simpler**.  Presigned URLs are simpler than multi-part upload, which is a reason we didn't use them for still images

#### Drawbacks

- **5GB upload limit**
  - Presigned URLs work via a single S3 PUT, which has a max of 5GB.
  - 5GB works for most scenarios:
    - iPhone 1080p @ 30fps HEVC: ~125-150MB/min → **33-40 minutes** in 5GB
    - iPhone 4K @ 30fps HEVC: ~170MB/min → **~29 minutes** in 5GB
  - We'd prefer to support larger files, but don't want to sign up for the complexity of multipart upload at this point.  Maybe later.
 - **Uploads can't be resumed**  
   - With a Presigned URLs (single S3 PUT), if the upload fails, you have to re-start from the beginning.  
   - Multi-part upload would let parts fail, and you'd just reload that part.
   - If this starts to be a problem, we can always switch to multi-part uploads at that point.

**Presigned URL expiration:** Needs to be generous (1 hour?) for large uploads on slow connections.

### UUIDs for Video Transcode & Poster

The alternative considered was storing the transcoded video and poster image by path:
- `/video/2024/06-15/my_video.avi/transcoded.mp4`
- `/video/2024/06-15/my_video.avi/poster.jpg`

**Reasons to use UUID:**
- **Simplifies rename** - Renaming a video only requires updating DynamoDB and copying the original. The transcoded video and poster stay put.
 	- Right now during a rename we *delete* the derived files, but I don't want to resubmit a job to AWS MediaConvert to re-generate the transcoded video and poster image, so we're touching rename *SOMEHOW* here.
 	- I want to keep the delete-on-rename for the other derived images because it's more reliable:
 		- Multiple sizes - You'd have to find and copy all derived images at various sizes. Deleting uses a prefix scan on `/i/<path>/`; copying requires enumerating each size.
 		- Atomic consistency - If rename fails partway, you could have derived images at both old and new paths. With delete, worst case is missing derived images that regenerate on demand.
 	- I don't want to rename the video files, for the abovementioned reliability reasons.
 	- Also, Video files are large, and S3 doesn't support renames: we'd have to physically copy it to the new key.

**Tradeoffs:**
 - **Inconsistent with images**.  Using UUIDs for videos is inconsistent with how images are handled. Images use path-based derived storage (`/i/2024/06-15/photo.jpg/<versionId>/200`). 
 - **Harder to debug**.  For debugging, it's harder to browse S3 and understand what's what. Derived /video/2024/06-15/birthday.avi/transcoded.mp4 would be self-documenting; /video/a1b2c3d4/transcoded.mp4 is not.

**Future consideration:** In the future, I could see giving still images a UUID too, and updating the derived image generator to *always* use UUID, thus avoiding having to delete the derived files on rename.  But not for this PR.

### Concurrency

The system does not currently protect against simultaneous operations on the same item. Examples:

- Two users rename the same image/video concurrently
- User deletes an item while it's being renamed
- User re-uploads a video while the first upload is still processing
- User renames a video while MediaConvert is still processing

These scenarios can lead to orphaned S3 objects, inconsistent DynamoDB state, or lost data. In practice this hasn't been a problem due to low traffic and single-family use.

Video support increases the risk because:
- Longer processing windows (minutes vs seconds) create more opportunity for overlapping operations
- More state to coordinate (UUID, MediaConvert job, multiple S3 objects)

**Decision:** We are not solving concurrency in this PR. Addressing it piecemeal for videos while leaving images unprotected would add complexity without fully solving the problem. A proper solution (optimistic locking, processing flags, or conditional writes) should be designed holistically for both images and videos in a future enhancement.