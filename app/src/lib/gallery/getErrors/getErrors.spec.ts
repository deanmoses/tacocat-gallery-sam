import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { getErrors } from './getErrors';
import { BadRequestException } from '../../lambda_utils/BadRequestException';

const mockDocClient = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
    process.env.ERROR_TABLE = 'test-errors';
});

afterEach(() => {
    mockDocClient.reset();
});

describe('getErrors()', () => {
    test('Throws BadRequestException for empty input array', async () => {
        await expect(getErrors([])).rejects.toThrow(BadRequestException);
    });

    test('Throws BadRequestException for invalid path', async () => {
        await expect(getErrors(['invalid-path'])).rejects.toThrow(BadRequestException);
        await expect(getErrors(['/not/a/valid/path.jpg'])).rejects.toThrow(BadRequestException);
    });

    test('Returns empty object when no errors found', async () => {
        mockDocClient.on(BatchGetCommand).resolves({
            Responses: {
                'test-errors': [],
            },
        });

        const result = await getErrors(['/2001/12-31/video.mp4']);
        expect(result).toEqual({ errors: {} });
    });

    test('Returns errors for paths that have errors', async () => {
        mockDocClient.on(BatchGetCommand).resolves({
            Responses: {
                'test-errors': [
                    { path: '/2001/12-31/video.mp4', errorType: 'media_processing', errorMessage: 'Unsupported codec' },
                    { path: '/2001/12-31/video2.avi', errorType: 'media_processing', errorMessage: 'File corrupted' },
                ],
            },
        });

        const result = await getErrors(['/2001/12-31/video.mp4', '/2001/12-31/video2.avi', '/2001/12-31/video3.mov']);

        expect(result).toEqual({
            errors: {
                '/2001/12-31/video.mp4': 'Unsupported codec',
                '/2001/12-31/video2.avi': 'File corrupted',
            },
        });
    });

    test('Returns only paths with errors, omits successful ones', async () => {
        mockDocClient.on(BatchGetCommand).resolves({
            Responses: {
                'test-errors': [
                    {
                        path: '/2001/12-31/failed.mp4',
                        errorType: 'media_processing',
                        errorMessage: 'Transcoding failed',
                    },
                ],
            },
        });

        const result = await getErrors([
            '/2001/12-31/success.mp4',
            '/2001/12-31/failed.mp4',
            '/2001/12-31/another-success.avi',
        ]);

        expect(result).toEqual({
            errors: {
                '/2001/12-31/failed.mp4': 'Transcoding failed',
            },
        });
    });

    test('Handles large batches by splitting into chunks of 100', async () => {
        // Create 150 paths
        const paths = Array.from({ length: 150 }, (_, i) => `/2001/12-31/video${i}.mp4`);

        // Track how many batches were called
        let batchCallCount = 0;

        // Mock returns errors for first and last items
        mockDocClient.on(BatchGetCommand).callsFake((input) => {
            batchCallCount++;
            const keys = input.RequestItems?.['test-errors']?.Keys ?? [];

            // Return errors only for specific paths
            const responses: Array<{ path: string; errorType: string; errorMessage: string }> = [];
            for (const key of keys) {
                const path = (key as { path: string }).path;
                if (path === '/2001/12-31/video0.mp4' || path === '/2001/12-31/video149.mp4') {
                    responses.push({ path, errorType: 'media_processing', errorMessage: `Error for ${path}` });
                }
            }

            return Promise.resolve({
                Responses: {
                    'test-errors': responses,
                },
            });
        });

        const result = await getErrors(paths);

        // Should have called BatchGet twice (100 + 50 items)
        expect(batchCallCount).toBe(2);
        expect(result.errors['/2001/12-31/video0.mp4']).toBe('Error for /2001/12-31/video0.mp4');
        expect(result.errors['/2001/12-31/video149.mp4']).toBe('Error for /2001/12-31/video149.mp4');
        expect(Object.keys(result.errors).length).toBe(2);
    });
});
