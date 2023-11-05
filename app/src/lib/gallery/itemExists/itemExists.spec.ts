import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { itemExists } from './itemExists';

const mockDocClient = mockClient(DynamoDBDocumentClient);

afterEach(() => {
    mockDocClient.reset();
});

describe('Invalid Paths', () => {
    const paths = ['', '/', 'adf', '2000', '/2000', '2000/', '2000/12-31', '2000/12-31/image.jpg', '/2000/12-31/image'];

    paths.forEach((path) => {
        test(`Path should be invalid: [${path}]`, async () => {
            await expect(itemExists(path)).rejects.toThrow(/malformed/i);
        });
    });
});

test('Item Exists', async () => {
    // Mock out the AWS method
    mockDocClient.on(GetCommand).resolves({
        Item: {
            /* Item without any attributes returned */
        },
    });
    const result = await itemExists('/2001/12-31/');
    expect(result).toBe(true);
});

test('Item Does Not Exist', async () => {
    // Mock out the AWS method
    mockDocClient.on(GetCommand).resolves({
        /* No Item returned*/
    });
    const result = await itemExists('/2001/12-31/');
    expect(result).toBe(false);
});
