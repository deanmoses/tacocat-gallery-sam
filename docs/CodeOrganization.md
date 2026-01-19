# Code Organization

The codebase is organized into the following layers:

1. **Lambda Entry Points** (`app/src/lambdas/`) - Thin handlers that parse input and call business logic.
2. **Business Logic** (`app/src/lib/gallery/`) - Domain operations organized by feature (getAlbum/, deleteImage/, renameAlbum/, etc.)
3. **Utility Libraries** (`app/src/lib/*_utils/`) - Reusable code for DynamoDB, S3, Redis, path validation, and Lambda helpers.
4. **Types** (`app/src/lib/gallery/galleryTypes.ts`) - Shared type definitions. No runtime code.

## Dependency Rules

1. **Lambdas** import from any lower layer
2. **Gallery operations** import from utility libraries and types only.  Gallery operations do NOT import from each other; if `renameImage` needs to update an image in DynamoDB, it imports from `dynamo_utils` not `updateImage`.
3. **Utility libraries** import from other utility libraries and types
4. **Types** have no imports
