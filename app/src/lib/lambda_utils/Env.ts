/**
 * Name of DyanmoDB Table in which Gallery Items are stored
 */
export function getDynamoDbTableName(): string {
    return getEnv('GALLERY_ITEM_DDB_TABLE');
}

/**
 * Name of S3 bucket in which to store resized image
 */
export function getDerivedImageBucketName(): string {
    return getEnv('DERIVED_IMAGE_BUCKET');
}

/**
 * Name of the S3 bucket containing original image
 */
export function getS3BucketName(): string {
    return getEnv('ORIGINAL_IMAGE_BUCKET');
}

/**
 * S3 key prefix under which to read original image
 */
export function getOriginalImagePrefix(): string {
    return getEnv('ORIGINAL_IMAGE_S3_PREFIX');
}

/**
 * S3 key prefix under which to store resized image
 */
export function getThumbnailImagePrefix(): string {
    return getEnv('THUMBNAIL_IMAGE_S3_PREFIX');
}

/**
 * Longest edge of the resized image, in pixels
 */
export function getEdgeSize(): string {
    return getEnv('THUMBNAIL_IMAGE_SIZE');
}

/**
 * JPEG quality of the resized image
 */
export function getJpegQuality(): string {
    return getEnv('THUMBNAIL_IMAGE_QUALITY');
}

function getEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw `Environment misconfiguration: no [${name}] defined`;
    }
    return value;
}
