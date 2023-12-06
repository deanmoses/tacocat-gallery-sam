/**
 * Fake environment variables used in automated tests
 */
let testEnv: Record<string, string>;

/**
 * The domain serving the HTML of the gallery app,
 * such as pix.tacocat.com or staging-pix.tacocat.com
 */
export function getGalleryAppDomain(): string {
    return getEnv('GALLERY_APP_DOMAIN');
}

/**
 * Name of DyanmoDB Table in which Gallery Items are stored
 */
export function getDynamoDbTableName(): string {
    return getEnv('GALLERY_ITEM_DDB_TABLE');
}

/**
 * Name of S3 bucket in which to store resized image
 */
export function getDerivedImagesBucketName(): string {
    return getEnv('DERIVED_IMAGES_BUCKET');
}

/**
 * Name of the S3 bucket containing original image
 */
export function getOriginalImagesBucketName(): string {
    return getEnv('ORIGINAL_IMAGES_BUCKET');
}

/**
 * JPEG quality of derived images
 */
export function getJpegQuality(): number {
    return getEnvAsInt('IMAGE_QUALITY');
}

export function getDerivedImageDomain(): string {
    return getEnv('DERIVED_IMAGE_DOMAIN');
}

function getEnv(name: string): string {
    const value = !!testEnv ? testEnv[name] : process.env[name];
    if (!value) {
        throw `No such environment variable [${name}]`;
    }
    return value;
}

function getEnvAsInt(name: string): number {
    return parseInt(getEnv(name), 10);
}

/**
 * Set the environment variables used in tests
 */
export function setTestEnv(env: Record<string, string>) {
    testEnv = env;
}
