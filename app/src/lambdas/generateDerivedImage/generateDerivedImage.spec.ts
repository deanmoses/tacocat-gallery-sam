import { generateDerivedImage } from './generateDerivedImage';

// Mock the S3 functions
jest.mock('./s3', () => ({
    loadOriginalImage: jest.fn(),
    loadVideoPoster: jest.fn(),
    saveOptimizedImage: jest.fn(),
}));

// Mock the DynamoDB functions
jest.mock('./ddb', () => ({
    getVideoUuid: jest.fn(),
}));

// Mock optimizeImage but preserve isImageFormat which is used by parsePath
jest.mock('./optimizeImage', () => ({
    ...jest.requireActual('./optimizeImage'),
    optimizeImage: jest.fn(),
}));

import { loadOriginalImage, loadVideoPoster, saveOptimizedImage } from './s3';
import { getVideoUuid } from './ddb';
import { optimizeImage } from './optimizeImage';

const mockLoadOriginalImage = loadOriginalImage as jest.MockedFunction<typeof loadOriginalImage>;
const mockLoadVideoPoster = loadVideoPoster as jest.MockedFunction<typeof loadVideoPoster>;
const mockGetVideoUuid = getVideoUuid as jest.MockedFunction<typeof getVideoUuid>;
const mockSaveOptimizedImage = saveOptimizedImage as jest.MockedFunction<typeof saveOptimizedImage>;
const mockOptimizeImage = optimizeImage as jest.MockedFunction<typeof optimizeImage>;

describe('generateDerivedImage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('HTTP method validation', () => {
        it('should return 405 for POST method', async () => {
            const result = await generateDerivedImage('POST', '/i/2001/12-31/image.jpg/VERSIONID/200');
            expect(result.statusCode).toBe(405);
            expect(result.body).toBe('method not allowed');
        });

        it('should return 405 for PUT method', async () => {
            const result = await generateDerivedImage('PUT', '/i/2001/12-31/image.jpg/VERSIONID/200');
            expect(result.statusCode).toBe(405);
        });

        it('should return 405 for DELETE method', async () => {
            const result = await generateDerivedImage('DELETE', '/i/2001/12-31/image.jpg/VERSIONID/200');
            expect(result.statusCode).toBe(405);
        });

        it('should accept GET method', async () => {
            mockLoadOriginalImage.mockResolvedValue(undefined);
            const result = await generateDerivedImage('GET', '/i/2001/12-31/image.jpg/VERSIONID/200');
            // Will return 404 because image not found, but method was accepted
            expect(result.statusCode).not.toBe(405);
        });

        it('should accept HEAD method', async () => {
            mockLoadOriginalImage.mockResolvedValue(undefined);
            const result = await generateDerivedImage('HEAD', '/i/2001/12-31/image.jpg/VERSIONID/200');
            expect(result.statusCode).not.toBe(405);
        });
    });

    describe('favicon handling', () => {
        it('should return 404 for favicon.ico', async () => {
            const result = await generateDerivedImage('GET', '/favicon.ico');
            expect(result.statusCode).toBe(404);
            expect(result.body).toBe('not found');
        });

        it('should return 404 for any path containing favico', async () => {
            const result = await generateDerivedImage('GET', '/i/2001/12-31/favico.jpg/VERSIONID');
            expect(result.statusCode).toBe(404);
        });
    });

    describe('path parsing errors', () => {
        it('should return 400 for invalid path format', async () => {
            const result = await generateDerivedImage('GET', '/wrongpath/UUID');
            expect(result.statusCode).toBe(400);
            expect(result.body).toBe('bad request');
        });

        it('should return 400 for path without versionId', async () => {
            const result = await generateDerivedImage('GET', '/i/2001/12-31/image.jpg');
            expect(result.statusCode).toBe(400);
        });

        it('should return 400 for path without image id', async () => {
            // parsePath returns error for malformed paths
            const result = await generateDerivedImage('GET', '/i/');
            expect(result.statusCode).toBe(400);
        });
    });

    describe('image loading', () => {
        it('should return 404 when image not found in S3', async () => {
            mockLoadOriginalImage.mockResolvedValue(undefined);

            const result = await generateDerivedImage('GET', '/i/2001/12-31/image.jpg/VERSIONID/200');

            expect(result.statusCode).toBe(404);
            expect(result.body).toBe('not found');
            expect(mockLoadOriginalImage).toHaveBeenCalledWith('2001/12-31/image.jpg', 'VERSIONID');
        });

        it('should look up UUID and load video poster for video paths', async () => {
            const uuid = '550e8400-e29b-41d4-a716-446655440000';
            mockGetVideoUuid.mockResolvedValue(uuid);
            mockLoadVideoPoster.mockResolvedValue(undefined);

            const result = await generateDerivedImage('GET', '/i/2001/12-31/video.mp4/VERSIONID/200');

            expect(mockGetVideoUuid).toHaveBeenCalledWith('2001/12-31/video.mp4');
            expect(mockLoadVideoPoster).toHaveBeenCalledWith(uuid);
            expect(result.statusCode).toBe(404); // poster not found
        });

        it('should return 404 when video UUID not found', async () => {
            mockGetVideoUuid.mockResolvedValue(undefined);

            const result = await generateDerivedImage('GET', '/i/2001/12-31/video.mp4/VERSIONID/200');

            expect(mockGetVideoUuid).toHaveBeenCalledWith('2001/12-31/video.mp4');
            expect(mockLoadVideoPoster).not.toHaveBeenCalled();
            expect(result.statusCode).toBe(404);
        });
    });

    describe('successful image generation', () => {
        const mockImageBuffer = Buffer.from('test-image-data');

        beforeEach(() => {
            mockLoadOriginalImage.mockResolvedValue(new Uint8Array(mockImageBuffer));
            mockOptimizeImage.mockResolvedValue({ buffer: mockImageBuffer, format: 'jpeg' });
            mockSaveOptimizedImage.mockResolvedValue(undefined);
        });

        it('should return 200 with image data for GET request', async () => {
            const result = await generateDerivedImage('GET', '/i/2001/12-31/image.jpg/VERSIONID/200');

            expect(result.statusCode).toBe(200);
            expect(result.headers['content-type']).toBe('image/jpeg');
            expect(result.headers['cache-control']).toBe('public, max-age=31536000');
            expect(result.body).toBe(mockImageBuffer.toString('base64'));
            expect(result.isBase64Encoded).toBe(true);
        });

        it('should return 200 without body for HEAD request', async () => {
            const result = await generateDerivedImage('HEAD', '/i/2001/12-31/image.jpg/VERSIONID/200');

            expect(result.statusCode).toBe(200);
            expect(result.headers['content-type']).toBe('image/jpeg');
            expect(result.body).toBeUndefined();
        });

        it('should save optimized image to S3', async () => {
            const path = '/i/2001/12-31/image.jpg/VERSIONID/200';
            await generateDerivedImage('GET', path);

            expect(mockSaveOptimizedImage).toHaveBeenCalledWith(
                path,
                mockImageBuffer,
                'image/jpeg',
                'public, max-age=31536000',
            );
        });

        it('should use correct content type for webp format', async () => {
            mockOptimizeImage.mockResolvedValue({ buffer: mockImageBuffer, format: 'webp' });

            const result = await generateDerivedImage('GET', '/i/2001/12-31/image.jpg/VERSIONID/webp/200');

            expect(result.headers['content-type']).toBe('image/webp');
        });
    });

    describe('large response handling', () => {
        it('should return 503 for responses larger than 5MB', async () => {
            // Create a buffer larger than 5MB
            const largeBuffer = Buffer.alloc(6 * 1024 * 1024, 'x');

            mockLoadOriginalImage.mockResolvedValue(new Uint8Array(largeBuffer));
            mockOptimizeImage.mockResolvedValue({ buffer: largeBuffer, format: 'jpeg' });
            mockSaveOptimizedImage.mockResolvedValue(undefined);

            const result = await generateDerivedImage('GET', '/i/2001/12-31/image.jpg/VERSIONID/200');

            expect(result.statusCode).toBe(503);
            expect(result.headers['retry-after']).toBe('1');
            expect(result.headers['cache-control']).toBe('no-cache, no-store');
        });

        it('should return 200 for HEAD even with large response', async () => {
            const largeBuffer = Buffer.alloc(6 * 1024 * 1024, 'x');

            mockLoadOriginalImage.mockResolvedValue(new Uint8Array(largeBuffer));
            mockOptimizeImage.mockResolvedValue({ buffer: largeBuffer, format: 'jpeg' });
            mockSaveOptimizedImage.mockResolvedValue(undefined);

            const result = await generateDerivedImage('HEAD', '/i/2001/12-31/image.jpg/VERSIONID/200');

            // HEAD returns early before the size check
            expect(result.statusCode).toBe(200);
        });
    });

    describe('response headers', () => {
        it('should have correct cache-control for 400 response', async () => {
            const result = await generateDerivedImage('GET', '/wrongpath/UUID');
            expect(result.headers['cache-control']).toBe('public, max-age=300');
        });

        it('should have correct cache-control for 404 response', async () => {
            const result = await generateDerivedImage('GET', '/favicon.ico');
            expect(result.headers['cache-control']).toBe('public, max-age=300');
        });

        it('should have correct cache-control for 405 response', async () => {
            const result = await generateDerivedImage('POST', '/i/2001/12-31/image.jpg/VERSIONID');
            expect(result.headers['cache-control']).toBe('public, max-age=300');
        });
    });
});
