# Derived Images Architecture

This is a proposed architecture for changing how derived images work.  The introduction of video support -- see [Video.md](./Video.md) -- has clarified how derived images should work for all media types.

This architecture accounts for ALL derived images.  This includes:
- **thumbnails** (for both original images and videos)
- **the detail page image** (for both original images and videos)
- **the transcoded video** that people actually view
- **the poster JPG** for a video

## Constraints and goals
- CDN caching is immutable
  - All derived assets continue to be cached in the CDN immutably, forever.  
- CDN caching is per-version
  - New versions are delivered immediately 
    - When a new version of the original media is uploaded, clients requesting derived assets for it must get them immediately, i.e., the caching must be per-version and we are not fooling around with cache timeouts
  - Old versions are supported forever
      - Ensure that stale clients with old versionIDs continue to work; when we upload a new version of a media item, the old versions of the thumbs / detail image / transcoded video must continue to exist.
      - We are not building any functionality to delete old versions.  Re-upload is vanishingly infrequent; we can afford to store old versions forever.  Maybe someday we'll run a cleanup script.
- Rename mustn't touch derived files
    - Avoid touching the derived images during renames
    - Write all derived files -- including thumbs -- to locations that don't include the original filename or path.  
    - When a rename happens, all derived images continue to work.
- Atomic delete
    - To support atomic delete, all derived files for a media item must live under a single path in the Derived Images bucket


## Proposal

### New Photos Get IDs

We start storing UUIDs not just for videos but ALSO for still images.
- All videos in the system will have an ID, because there *are* no videos yet; the video feature is still in development.
- Only new images will get an ID; we assign one on any save to DDB.  We do NOT do a migration.

### Old Derived Image Logic Still Works

We continue using the existing derived image URLs and S3 structure for any media item that does NOT have an id.  
- This will be all the images in the system that existed before we launched the feature.  
- This will not include ANY videos.

### Media with IDs Get a New Derived Image Logic

For any media item (video or still image) that has an ID, this is the logic we use.

#### S3

Store all derived assets in the Derived bucket by UUID and version ID:

| S3 Path | Asset Type | Notes |
|---------|------------|-------|
| `/u/UUID/VERSIONID/SIZE` | Resized JPG | SIZE uses current system (e.g., `1024` or `200x200`) |
| `/u/UUID/VERSIONID/poster` | Poster JPG | Source image for generating resized thumbnails; never served directly |
| `/u/UUID/VERSIONID/transcoded` | Transcoded Video | The video file users actually watch |

This simplifies operations over the derived assets:

| Operation | Notes | Path |
|-----------|-------|------|
| **Rename** | Does not touch derived assets | — |
| **Delete** | Clean up all derived assets when deleting a media item | `/u/UUID/` |
| **Partial Cleanup** | Clean up derived assets when re-uploaded video delivers transcode or poster | `/u/UUID/VERSIONID/` |


#### URLs

URL to transcoded video:
```
/v/2025/12-31/my_video.mov?id=UUID&version=VERSIONID
```
URL to a thumbnail:
```
/i/2025/12-31/my_video.mov?id=UUID&version=VERSIONID&size=200x200 ⬅️ a JPG
/i/2025/12-31/my_photo.jpg?id=UUID&version=VERSIONID&size=200x200 ⬅️ a JPG
/i/2025/12-31/my_image.png?id=UUID&version=VERSIONID&size=200x200 ⬅️ a WebP (not a PNG)
```

URL to a detail page image:
```
/i/2025/12-31/my_video.mov?id=UUID&version=VERSIONID&size=1024 ⬅️ a JPG
/i/2025/12-31/my_photo.jpg?id=UUID&version=VERSIONID&size=1024 ⬅️ a JPG
/i/2025/12-31/my_image.png?id=UUID&version=VERSIONID&size=1024 ⬅️ a WebP (not a PNG)
```

#### Routing from URLs to S3

The system has to distinguish between these URLs:

| URL | S3 Path | Use Case |
|-----|---------|----------|
| `/v/path/video.mov?id=UUID&version=VER` | `/u/UUID/VER/transcoded` | Video playback |
| `/i/path/video.mov?id=UUID&version=VER&size=200x200` | `/u/UUID/VER/200x200` | Thumbnail |
| `/i/path/video.mov?id=UUID&version=VER&size=1024` | `/u/UUID/VER/1024` | Detail page image |

- `/v/` - routes to the transcoded video
- `/i/` - routes to an image that can be generated on the fly via the derived image generator

#### Derived Image Generation

The existing lambda cache miss behavior is kept. Currently if a derived image doesn't exist, CloudFront fails over to the Lambda which generates it.

##### Content Type / Extensions
- The derived image generator continues to decide the best file format for a given derived image (such as it generates WebP for PNG originals).  
  - There's existing infrastructure in the lambda around requesting a specific format, but we don't expose it via CloudFront, and we're going to keep it that way.
- Derived assets to do not have an extension so that the front end can request them in URLs without knowing the content type.
  - Instead, Content-Type is set as S3 object metadata when the file is saved, same as now.
  - For the transcoded video, we know the content type because we requested a particular content type in the first place.  Or maybe MediaConvert outputs the content type, either way.

##### The Path
The path ( `2025/12-31/my_video.mov` ) is part of the URL, but isn't used as part of the S3 path.  It's there because:
 - The derived image generator must look up media by path -- amusingly, the UUID is *not* yet indexed.
 - It aids debuggability in the browser: when looking in the Network tab, you see which requests go with which media item.

##### Generating Resizes from Video Poster
The derived image generator needs to know whether the request is for a video, so that it can look up the poster JPG, rather than fetch the original from the Originals bucket.  To do that, it queries DynamoDB to check mediaType=video.

##### The ID

The CloudFront function to rewrite URLs will need to check for presence of id param to decide old vs new logic. If no id, use existing path-based logic. If id present, rewrite URLs to the S3 paths above.  If the file is not there, that triggers the lambda generator

If the derived image generator gets a request without an `id` -- as in it wasn't specified in the URL -- but the media item *HAS* an ID, that's an error.  The derived image generator returns a 400 Bad Request.

This means a DynamoDB lookup, even for all existing images.  That is acceptable overhead.

##### Old Images Without IDs
Existing images won't have ID; there won't be a bulk migration
- When someone re-uploads an existing image, it gets an ID at that point.  
- We do not delete its old derived images
  - We don't delete old derived images even for the case where the media item already has an ID; we do not clean up derived assets on re-upload
  - Stale clients trying to fetch the old album thumbnail URLs MAY break at that point, but probably not
    - They probably won't break, because we don't clean up old derived assets, so the old derived thumbnails will almost certainly be there
    - But they might break, if there is no old derived asset, because the lambda will see the request does not have an ID and error
    - We can live with this very small edge case


##### The `/i/` Generated Image Route

The existing `/i/` route has a CloudFront function that will be updated to rewrite both old and new style URLs:

| URL | S3 Path | Style |
|-----|---------|-------|
| `/i/path?version=VER&size=200x200&id=UUID` | `/u/UUID/VER/200x200` | New (with id) |
| `/i/path?version=VER&size=200x200` | `/i/path/VER/200x200` | Old (no id) |

`/i/` will continue to support the crop parameter. 

##### The `/v/` Video Route
- If the transcoded video doesn't exist at the path in S3, it's a 404.  The dynamoDB entry won't be written until that file is there.

## Release Sequencing With The Front End

We must release the front end changes before the back end changes:

- ❌ Releasing the back end first: it will start enforcing IDs for media with IDs (returning 400), but the current front end won't be sending them.
- ✅ Releasing the front end: it will start sending IDs for media with IDs, but the current back end will ignore them.
