/**
 * The year album each suite owns, keyed by the suite's file name.
 *
 * Suite cleanup wipes the whole year from DynamoDB and S3, so two suites
 * sharing a year and running in parallel would wipe each other's fixtures.
 * integrationTestYears.spec.ts checks that the values are distinct and that
 * every suite uses only its own entry.
 */
export const TEST_YEARS = {
    albumUpdating: '/1700/',
    albumCreation: '/1701/',
    albumThumbnails: '/1702/',
    mediaRenaming: '/1703/',
    imageCreation: '/1704/',
    mediaUpdating: '/1705/',
    imageReplacing: '/1706/',
    derivedImages: '/1707/',
    videoProcessing: '/1710/',
    albumRenaming: '/1711/',
    heicConversion: '/1712/',
    imageCdnHeaders: '/1713/',
    presignedUpload: '/1714/',
    api: '/1715/',
    albumNextPrev: '/1716/',
} as const;
