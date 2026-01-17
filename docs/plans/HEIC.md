# Plan: HEIC Support

This is the plan to support HEIC images. 

## Background

See the [GitHub issue](https://github.com/deanmoses/tacocat-gallery-sam/issues/19) for full context. In short: we want to support uploading HEIC files, but need to convert them to JPEG for storage since most browsers do not support HEIC viewing.

## Plan

### Upload Flow

1. **Web app uploads HEIC to S3 Originals bucket**
   - Uses existing presigned URL mechanism
   - Web app must be updated to allow HEIC uploads (separate plan/PR for SvelteKit front end)
   - Web app should warn if uploading `foo.heic` when `foo.jpg` already exists in the album, since HEIC converts to JPEG and would overwrite

2. **S3 triggers `processImageUpload` Lambda** (already happens)

3. **`processImageUpload` Lambda detects HEIC and converts:**
   - Check file extension for `.heic` or `.heif`
   - Convert to archival quality JPEG suitable for printing out posters (quality 92) using Sharp
   - Save JPEG to S3 Originals bucket (same path, `.jpg` extension)
   - Delete the original HEIC from S3
   - **Return early** — do not continue with metadata extraction

4. **S3 triggers `processImageUpload` again for the new JPEG**
   - `isHeicPath()` returns false for `.jpg`, so no conversion happens
   - Normal flow: extract metadata, save to DynamoDB, set album thumbnail, trigger detail image generation

**No infinite loop:** The JPEG re-trigger is safe because `isHeicPath()` only matches `.heic`/`.heif` extensions. The JPEG goes through the normal non-HEIC path. There's no risk of repeated re-encoding.

This two-trigger approach is cleaner than trying to do everything in one pass:
- The JPEG goes through the exact same code path as any direct JPEG upload
- No special-casing after conversion
- The JPEG's S3 `versionId` is captured correctly

### Lambda Layer

Sharp with HEIC support is provided via a custom Lambda layer built outside of this project from [zoellner/sharp-heic-lambda-layer](https://github.com/zoellner/sharp-heic-lambda-layer).

**Layer ARN:** `arn:aws:lambda:us-east-1:010410881828:layer:sharp-heic:1`

This layer compiles libheif, libde265, and Sharp from source to enable HEIC decoding.

### Code Changes Required

#### 1. Update `template.yaml`
- Change Sharp layer ARN from `Sharp-0_34_5` to the new HEIC-enabled layer `sharp-heic:1`

#### 2. Update path validation (`galleryPathUtils.ts`)

Create a new function `isValidImagePathForUpload()` that accepts HEIC/HEIF in addition to the existing formats. Keep `isValidImagePath()` unchanged (jpg/jpeg/gif/png only).

**Why two functions?** `isValidImagePath()` is used in ~20 places for storage/retrieval operations where HEIC should never appear (by then it's converted to JPEG). Adding HEIC to the existing function would be error-prone. Clear separation:

- `isValidImagePath()` — for stored images (jpg/jpeg/gif/png)
- `isValidImagePathForUpload()` — for uploads (jpg/jpeg/gif/png/heic/heif)

Also add `isHeicPath()` helper to detect HEIC files by extension. Use case-insensitive matching (`.HEIC`, `.Heic`, etc.).

#### 3. Update `generateUploadUrls.ts`
- Change `isValidImagePath()` to `isValidImagePathForUpload()` so presigned URLs can be generated for HEIC files

#### 4. Update `processImageUpload` Lambda (`template.yaml`)
- Add Sharp layer (needed for HEIC conversion; existing code uses exifreader for metadata, not Sharp)
- Add S3 write/delete policy for the Originals bucket (currently only has read). SAM's `S3CrudPolicy` is already scoped to a specific bucket.
- Add `External: - sharp` to esbuild config so it uses the layer instead of bundling
- Set MemorySize to 1024 MB (see memory analysis below)

**Note:** The layer ARN is hardcoded to us-east-1. This is fine because all environments (dev/test/prod) deploy to us-east-1 per samconfig.toml.

#### 5. Update `processImageUpload` Lambda (code)
- Use `isValidImagePathForUpload()` for initial validation
- Early in the function, check `isHeicPath()`
- If HEIC:
  1. Load image from S3
  2. Convert to JPEG using Sharp (quality 92)
  3. Save JPEG to S3 with `.jpg` extension
  4. Delete original HEIC from S3
  5. Return (let S3 trigger handle the JPEG)
- If not HEIC: continue with existing flow

**versionId handling:** The two-trigger approach handles this automatically. When the JPEG is saved, this Lambda returns. S3 triggers a new invocation for the JPEG, and that invocation receives the JPEG's versionId from the S3 event.

**S3 delete is safe:** The S3 bucket only triggers on `ObjectCreated` events, not `ObjectRemoved`. Deleting the HEIC won't trigger any Lambda or affect DynamoDB.

#### 6. Error handling

**Strategy:** Wrap Sharp and ExifReader calls individually. Quarantine on failure. Let S3/DynamoDB errors propagate for retry.

| Error source | Action | Rationale |
|--------------|--------|-----------|
| Sharp/ExifReader | Quarantine | File problem — won't fix itself on retry |
| S3/DynamoDB/other | Propagate | Infrastructure problem — SDK + S3 retries handle it |

**Skip quarantine prefix:** Early in the handler, check if the path starts with `quarantine/`. If so, return immediately.

**Implementation:**

```typescript
// Early exit for quarantined files
if (key.startsWith('quarantine/')) {
    console.info('Skipping quarantined file', { key });
    return;
}

// HEIC conversion (if applicable)
if (isHeicPath(key)) {
    try {
        await convertHeicToJpeg(bucket, key);
    } catch (error) {
        console.error('HEIC conversion failed, quarantining', { key, error: error.message });
        await quarantineFile(bucket, key);
        return;
    }
    return; // Let S3 re-trigger for the JPEG
}

// Metadata extraction
let metadata;
try {
    metadata = await extractImageMetadata(bucket, key);
} catch (error) {
    console.error('Metadata extraction failed, quarantining', { key, error: error.message });
    await quarantineFile(bucket, key);
    return;
}

// DynamoDB, album thumbnail, etc. — errors propagate for retry
await saveImageToDb(metadata);
await updateAlbumThumbnail(...);
```

**`quarantineFile(bucket, key)`:** Copies file to `quarantine/{original-path}` (e.g., `quarantine/2024/01-15/photo.heic`), then deletes original.

**Why this works:**
- No error classification needed — try/catch placement determines behavior
- Clear log messages indicate exactly which operation failed
- S3/DynamoDB errors naturally propagate without extra logic

#### 7. Logging
- Log explicitly when HEIC conversion occurs: `"HEIC converted: /2024/01-15/photo.heic → /2024/01-15/photo.jpg"`
- This distinguishes conversion triggers from normal JPEG uploads in CloudWatch


### Tests

#### Alter existing tests

1. **`galleryPathUtils.spec.ts`**
   - Add tests for `isValidImagePathForUpload()` — accepts HEIC/HEIF plus existing formats
   - Add tests for `isHeicPath()` — detects `.heic`/`.heif` (case-insensitive)

2. **`generateUploadUrls.spec.ts`**
   - Move `/2000/12-31/image.heic` from "invalid" to "valid" test cases

3. **`processImageUpload.spec.ts`**
   - Add test: `quarantine/...` paths return early (no processing)
   - Add test: HEIC paths return early after conversion (no metadata extraction, no DynamoDB write)

#### Add new tests

4. **`quarantineFile.spec.ts`** (new file)
   - Verify CopyObject to `quarantine/{original-path}`
   - Verify DeleteObject of original

#### Integration tests

6. **`s3ImageHelper.ts`**
   - Change `isValidImagePath` to `isValidImagePathForUpload` so it accepts HEIC uploads

7. **`imageCreation.spec.ts`** (or new `heicConversion.spec.ts`)
   - Upload HEIC, wait for processing, verify:
     - Original HEIC is deleted from S3
     - Converted JPEG exists in S3
     - DynamoDB entry exists with correct metadata

#### Test files to add

Add to `app/src/test/data/images/`:

- **`image.heic`** — Small HEIC file (1-2 MB) with EXIF metadata (dimensions, date taken). Any iPhone photo works.
- **`FullMetadata.heic`** (optional) — HEIC with IPTC metadata (title, description, keywords) to verify metadata survives conversion


# Appendix

## Memory Analysis

Sharp/libvips holds the decoded image in memory as uncompressed RGBA, plus working space for the output.

**Uncompressed image size calculation:**
- 12MP photo (4032×3024): 4032 × 3024 × 4 bytes = **48.8 MB**
- 48MP photo (8064×6048): 8064 × 6048 × 4 bytes = **195 MB**

**Working memory estimate:** 2-3× uncompressed size (input + output + processing overhead)
- 12MP: ~100-150 MB
- 48MP: ~400-600 MB

**Real-world data:** [Sharp issue #3934](https://github.com/lovell/sharp/issues/3934) reported 881 MB RSS for an 8736×5856 (51MP) HEIC.

**Decision:** Use 1024 MB. This handles typical 12MP photos with headroom and supports newer 48MP phones.

**Cost impact:** Negligible.
- Lambda pricing: $0.0000166667 per GB-second
- At 1024 MB vs 256 MB for a 3-second conversion: ~$0.000037 extra per conversion
- 1,000 HEIC uploads/month: ~$0.04 extra
- More memory also means more CPU, which can reduce execution time and partially offset the cost


## Rejected Approaches

### WASM Conversion (heic-convert)

Would have used this if the Sharp layer hadn't worked.

**Pros:**
- Pure JavaScript, no native dependencies
- Add `heic-convert` to existing Node.js Lambda
- Single Lambda, single flow

**Cons:**
- Slower — WASM is ~2-3x slower than native
- Less battle-tested (~120k weekly downloads)
- Higher memory usage — WASM decoder + Sharp both in memory
- Synchronous decoding can block event loop

### Browser-Side Conversion

**Rejected because:** Browser Canvas `toBlob('image/jpeg', quality)` uses the browser's built-in JPEG encoder, which produces noticeably worse quality than Sharp/mozjpeg at the same quality setting. Would need quality ~0.92-0.95 in browser to match Sharp at 0.85.

### Python Lambda (pillow-heif)

**Rejected because:**
- Two runtimes in one project:
  - Two dependency systems (`package.json` + `requirements.txt`)
  - Two build processes
  - Mental context-switching
- Architectural complexity:
  - Need to coordinate two Lambdas (S3 trigger → Python → S3 → Node.js)
  - Or change upload flow to go through Python first
  - Error handling across the handoff
- New code to maintain in a language not used elsewhere in the project


## References

- [sharp-heic-lambda-layer](https://github.com/zoellner/sharp-heic-lambda-layer) — Lambda layer source
- [Can I Use: HEIF/HEIC](https://caniuse.com/heif) — Browser support
- [pillow-heif](https://pypi.org/project/pillow-heif/) — Python alternative (rejected)
- [heic-convert](https://www.npmjs.com/package/heic-convert) — WASM alternative (rejected)
