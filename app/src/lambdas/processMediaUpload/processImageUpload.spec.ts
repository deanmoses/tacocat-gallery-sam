import { processImageUpload } from './processImageUpload';
import { MetadataExtractionError } from './extractImageMetadata';
import * as extractMetadata from './extractImageMetadata';
import * as revertS3 from '../../lib/s3_utils/s3revertVersion';
import * as recordError from '../../lib/dynamo_utils/recordError';

jest.mock('./extractImageMetadata', () => {
    const actual = jest.requireActual('./extractImageMetadata');
    return {
        ...actual,
        extractImageMetadata: jest.fn(),
    };
});
jest.mock('../../lib/s3_utils/s3revertVersion');
jest.mock('../../lib/dynamo_utils/recordError');
jest.mock('../../lib/gallery/createAlbum/createAlbum', () => ({
    createAlbumNoThrow: jest.fn().mockResolvedValue(false),
}));

const mockExtractImageMetadata = extractMetadata.extractImageMetadata as jest.MockedFunction<
    typeof extractMetadata.extractImageMetadata
>;
const mockRevertS3Version = revertS3.revertS3Version as jest.MockedFunction<typeof revertS3.revertS3Version>;
const mockRecordError = recordError.recordMediaProcessingError as jest.MockedFunction<
    typeof recordError.recordMediaProcessingError
>;

beforeEach(() => {
    jest.clearAllMocks();
    mockExtractImageMetadata.mockResolvedValue({ title: 'Test', dimensions: { width: 100, height: 100 } });
    mockRevertS3Version.mockResolvedValue(true);
    mockRecordError.mockResolvedValue(true);
});

describe('processImageUpload()', () => {
    describe('Invalid Image S3 Keys', () => {
        const s3keys = [
            '',
            '/',
            'image',
            'image.jpg', // no images in root album
            '/image.jpg',
            '.jpg',
            '2000',
            '/2000',
            '2000/',
            '2000/image.jpg', // no images in year albums
            '2000/12-31',
            '/2000/12-31/image.jpg', // no preceding slash in bucket keys
            '2000/12-31/image',
            '2000/12-31/image.heic', // HEIC not valid for storage (only for upload)
        ];

        s3keys.forEach((s3key) => {
            test(`S3 key should be invalid: [${s3key}]`, async () => {
                await expect(processImageUpload('bucket', s3key, 'FAKE_VERSION_ID')).rejects.toThrow(/invalid/i);
            });
        });
    });

    describe('Metadata extraction error handling', () => {
        test('Records error and reverts S3 version on MetadataExtractionError', async () => {
            const metadataError = new MetadataExtractionError('Corrupt file');
            mockExtractImageMetadata.mockRejectedValue(metadataError);

            await processImageUpload('test-bucket', '2024/06-15/photo.jpg', 'version123');

            expect(mockRecordError).toHaveBeenCalledWith(
                '/2024/06-15/photo.jpg',
                'Metadata extraction failed: Corrupt file',
            );
            expect(mockRevertS3Version).toHaveBeenCalledWith('test-bucket', '2024/06-15/photo.jpg', 'version123');
        });

        test('Does not throw on MetadataExtractionError (returns normally)', async () => {
            const metadataError = new MetadataExtractionError('Corrupt file');
            mockExtractImageMetadata.mockRejectedValue(metadataError);

            await expect(
                processImageUpload('test-bucket', '2024/06-15/photo.jpg', 'version123'),
            ).resolves.toBeUndefined();
        });

        test('Propagates non-MetadataExtractionError errors for retry', async () => {
            const s3Error = new Error('S3 connection failed');
            mockExtractImageMetadata.mockRejectedValue(s3Error);

            await expect(processImageUpload('test-bucket', '2024/06-15/photo.jpg', 'version123')).rejects.toThrow(
                'S3 connection failed',
            );
            expect(mockRevertS3Version).not.toHaveBeenCalled();
        });
    });
});
