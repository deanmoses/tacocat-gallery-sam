/** Domain serving HTML of gallery app like pix.tacocat.com */
export function getGalleryAppDomain(): string {
    return getEnv('GALLERY_APP_DOMAIN');
}

/** Name of DynamoDB Table in which gallery items are stored */
export function getDynamoDbTableName(): string {
    return getEnv('GALLERY_ITEM_DDB_TABLE');
}

/** Name of S3 bucket in which to store resized image */
export function getDerivedImagesBucketName(): string {
    return getEnv('DERIVED_IMAGES_BUCKET');
}

/**  Name of the S3 bucket containing original image */
export function getOriginalImagesBucketName(): string {
    return getEnv('ORIGINAL_IMAGES_BUCKET');
}

/** JPEG quality of derived images */
export function getJpegQuality(): number {
    return getEnvAsInt('JPEG_QUALITY');
}

/** Domain of Lambda URL to generate derived images */
export function getDerivedImageGeneratorDomain(): string {
    return getEnv('DERIVED_IMAGE_GENERATOR_DOMAIN');
}

export function getRedisHost(): string {
    return getEnv('REDIS_HOST');
}

export function getRedisWriteUsername(): string {
    return getEnv('REDIS_WRITE_USERNAME');
}

export function getRedisWritePassword(): string {
    return getEnv('REDIS_WRITE_PASSWORD');
}

export function getRedisSearchUsername(): string {
    return getEnv('REDIS_SEARCH_USERNAME');
}

export function getRedisSearchPassword(): string {
    return getEnv('REDIS_SEARCH_PASSWORD');
}

function getEnvAsInt(name: string): number {
    return parseInt(getEnv(name), 10);
}

function getEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw `No such environment variable [${name}]`;
    return value;
}
