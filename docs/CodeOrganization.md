# Code Organization

The codebase is organized into the following layers:

1. **Lambda Entry Points** (`app/src/lambdas/`) - Thin handlers that parse input and call business logic.
2. **Business Logic** (`app/src/lib/gallery/`) - Domain operations organized by feature (getAlbum/, deleteImage/, renameAlbum/, etc.)
3. **Utility Libraries** (`app/src/lib/*_utils/`) - Reusable code for DynamoDB, S3, Redis, path validation, and Lambda helpers.
4. **Types** (`app/src/lib/gallery/galleryTypes.ts`) - Shared type definitions. No runtime code.

## Dependency Rules

1. **Lambdas** import from any lower layer
2. **Gallery operations** import from utility libraries and types only. Gallery operations do NOT import from each other; if `renameImage` needs to update an image in DynamoDB, it imports from `dynamo_utils` not `updateImage`.
3. **Utility libraries** import from other utility libraries and types
4. **Types** have no imports

## Lambdas

Lambda handlers should be **thin wrappers** that:

- Parse input (API Gateway event, S3 event, EventBridge event, etc.)
- Call business logic functions from `lib/gallery/` or `lib/*_utils/`
- Return formatted responses

**AWS SDK imports:** Lambda handlers should NOT import AWS SDK clients directly (except `aws-lambda` types for handler signatures). Instead:

- Business logic goes in `lib/gallery/` functions
- AWS operations go in `lib/*_utils/` functions
- Lambda-specific AWS operations (e.g., S3 operations tied to a specific Lambda's workflow) can go in a local file like `s3.ts` within the Lambda folder

This keeps handlers testable and business logic reusable.
