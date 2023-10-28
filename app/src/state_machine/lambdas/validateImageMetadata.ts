/**
 * Validate the minimum required image metdata
 *
 * @param imageMetadata an image's EXIF and IPTC metadata
 */
export function validateImageMetadata(imageMetadata: ExifReader.ExpandedTags) {
    if (!imageMetadata) {
        throw 'Missing all image metadata';
    }
    if (!imageMetadata?.file?.['Image Height']) {
        throw 'Missing image dimensions';
    }
}
