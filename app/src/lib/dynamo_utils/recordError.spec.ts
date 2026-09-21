import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ErrorType, recordError, recordMediaProcessingError } from './recordError';

const mockDynamoDB = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
    process.env.ERROR_TABLE = 'test-error-table';
    mockDynamoDB.reset();
    mockDynamoDB.on(PutCommand).resolves({});
});

describe('recordError()', () => {
    it('Writes error to error table with correct fields', async () => {
        const beforeTime = Date.now();
        const result = await recordError(ErrorType.MediaProcessing, '/2024/06-15/photo.jpg', 'Test error message');
        const afterTime = Date.now();

        expect(result).toBe(true);

        const putCalls = mockDynamoDB.commandCalls(PutCommand);

        expect(putCalls).toHaveLength(1);

        const item = putCalls[0].args[0].input.Item;

        expect(item?.path).toBe('/2024/06-15/photo.jpg');
        expect(item?.errorType).toBe('media_processing');
        expect(item?.errorMessage).toBe('Test error message');

        const timestamp = Date.parse(item?.timestamp as string);

        expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(timestamp).toBeLessThanOrEqual(afterTime);

        // TTL should be ~24 hours from now
        const expectedTtl = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

        expect(item?.ttl).toBeGreaterThan(expectedTtl - 10);
        expect(item?.ttl).toBeLessThan(expectedTtl + 10);
    });

    it('Uses correct table name from environment', async () => {
        process.env.ERROR_TABLE = 'custom-error-table';

        await recordError(ErrorType.MediaProcessing, '/2024/06-15/photo.jpg', 'Test error');

        const putCalls = mockDynamoDB.commandCalls(PutCommand);

        expect(putCalls[0].args[0].input.TableName).toBe('custom-error-table');
    });

    it('Returns false on DynamoDB error', async () => {
        mockDynamoDB.on(PutCommand).rejects(new Error('DynamoDB error'));

        const result = await recordError(ErrorType.MediaProcessing, '/2024/06-15/photo.jpg', 'Test error');

        expect(result).toBe(false);
    });

    it('Does not throw on DynamoDB error', async () => {
        mockDynamoDB.on(PutCommand).rejects(new Error('DynamoDB error'));

        await expect(recordError(ErrorType.MediaProcessing, '/2024/06-15/photo.jpg', 'Test error')).resolves.toBe(
            false,
        );
    });
});

describe('recordMediaProcessingError()', () => {
    it('Writes error with errorType media_processing', async () => {
        const result = await recordMediaProcessingError('/2024/06-15/photo.jpg', 'Test error message');

        expect(result).toBe(true);

        const putCalls = mockDynamoDB.commandCalls(PutCommand);

        expect(putCalls).toHaveLength(1);

        const item = putCalls[0].args[0].input.Item;

        expect(item?.path).toBe('/2024/06-15/photo.jpg');
        expect(item?.errorType).toBe('media_processing');
        expect(item?.errorMessage).toBe('Test error message');
    });
});
