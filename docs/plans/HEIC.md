# Plan: HEIC Support (DONE)

This is the plan to support HEIC images.

Status: IMPLEMENTED.

## Background

See the [GitHub issue](https://github.com/deanmoses/tacocat-gallery-sam/issues/19) for full context. In short: we want to support uploading HEIC files, but need to convert them to JPEG for storage since most browsers do not support HEIC viewing.

## Plan

### Upload Flow

1. **Web app uploads HEIC to S3 Originals bucket**
    - Uses existing presigned URL mechanism
    - Web app must be updated to allow HEIC uploads (separate plan/PR for SvelteKit front end)
    - Web app should warn if uploading `foo.heic` when `foo.jpg` already exists in the album, since HEIC converts to JPEG and would overwrite

2. **S3 triggers `processMediaUpload` Lambda** (already happens)

3. **`processMediaUpload` Lambda detects HEIC and converts:**
    - Check file extension for `.heic` or `.heif`
    - Convert to archival quality JPEG suitable for printing out posters (quality 92) using Sharp
    - Save JPEG to S3 Originals bucket (same path, `.jpg` extension)
    - Delete the original HEIC from S3
    - **Return early** — do not continue with metadata extraction

4. **S3 triggers `processMediaUpload` again for the new JPEG**
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

## Cost Impact: Negligible

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
