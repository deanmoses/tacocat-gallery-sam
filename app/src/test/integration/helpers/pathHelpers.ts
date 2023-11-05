/**
 * Get path of an album for today's date
 *
 * @returns an album path like /2030/01-31/
 */
export function getAlbumPathForToday(): string {
    const day = new Date().getDate().toString().padStart(2, '0');
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const year = new Date().getFullYear();
    const albumName = `${month}-${day}`;
    return `/${year}/${albumName}/`;
}

/**
 * Get path to a unique image for today's date
 *
 * @returns an image path like /2030/01-31/image-982374923.jpg
 */
export function getUniqueImagePathForToday(imageNamePrefix: string = 'image-'): string {
    const newImageName = `${imageNamePrefix}${Date.now()}.jpg`;
    return getAlbumPathForToday() + newImageName;
}
