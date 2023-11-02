import { setTestEnv } from '../../lambda_utils/Env';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { deleteImage } from './deleteImage';
import {
    DeleteObjectsCommand,
    DeleteObjectsCommandOutput,
    ListObjectsV2Command,
    ListObjectsV2CommandOutput,
    S3Client,
} from '@aws-sdk/client-s3';

const mockS3Client = mockClient(S3Client);
const mockDocClient = mockClient(DynamoDBDocumentClient);
setTestEnv({
    GALLERY_ITEM_DDB_TABLE: 'notRealTable',
    ORIGINAL_IMAGES_BUCKET: 'notARealBucket',
    DERIVED_IMAGES_BUCKET: 'notARealBucket',
});

afterEach(() => {
    mockDocClient.reset();
    mockS3Client.reset();
});

describe('Invalid Paths', () => {
    const paths = [
        '',
        '/',
        'adf',
        '2000',
        '/2000',
        '2000/',
        '/2000/',
        '2000/12-31',
        '/2000/12-31/', // album, not image
        '2000/12-31/image.jpg', // no starting /
        '/2000/12-31/image', // no extension
    ];
    paths.forEach((path) => {
        test(`Path should be invalid: [${path}]`, async () => {
            await expect(deleteImage(path)).rejects.toThrow(/malformed/i);
            expect(mockDocClient.commandCalls(DeleteCommand).length).toBe(0);
        });
    });
});

test('Delete Image That Exists', async () => {
    expect.assertions(2);

    // Mock the AWS calls
    mockDocClient.on(DeleteCommand).resolves({});
    mockS3Client.on(ListObjectsV2Command).resolves(listResponseWithItems);
    mockS3Client.on(DeleteObjectsCommand).resolves(deleteObjectsResponseWithItems);
    const result = await deleteImage('/2001/12-31/image.jpg');
    expect(result).toBeUndefined();
    expect(mockDocClient.commandCalls(DeleteCommand).length).toBe(1);
});

test('Delete Nonexistent Image', async () => {
    expect.assertions(2);

    // Mock the AWS calls
    // TODO: verify that the response is no different than deleting an image that DOES exist
    mockDocClient.on(DeleteCommand).resolves({});
    mockS3Client.on(ListObjectsV2Command).resolves({
        KeyCount: 0,
    });
    const result = await deleteImage('/1899/01-01/image.jpg');
    expect(result).toBeUndefined();
    expect(mockDocClient.commandCalls(DeleteCommand).length).toBe(1);
});

const listResponseWithItems: ListObjectsV2CommandOutput = {
    $metadata: {
        httpStatusCode: 200,
        requestId: '9GP1FPPMPNVK3E0P',
        extendedRequestId: 'nnihMHyyXg8Aaa9663M5t5IuXjwj41sg9N4PHFDN9aLW6r4oPoKoUO+BOCdUn8qxhb72MVLECAA=',
        cfId: undefined,
        attempts: 1,
        totalRetryDelay: 0,
    },
    Contents: [
        {
            Key: 'i/2001/01-01/tswift.jpg/jpeg/70x70',
            LastModified: new Date(),
            ETag: '"64075e46ca3e1a4c2b3fca20de448d38"',
            Size: 1378,
            StorageClass: 'STANDARD',
        },
        {
            Key: 'i/2001/01-01/tswift.jpg/jpeg/71x71',
            LastModified: new Date(),
            ETag: '"3bac94b15946370ec3a306cc2aac0d9e"',
            Size: 1365,
            StorageClass: 'STANDARD',
        },
        {
            Key: 'i/2001/01-01/tswift.jpg/jpeg/75x75',
            LastModified: new Date(),
            ETag: '"3c096e5e4e28218bae1d9308da93d16d"',
            Size: 1500,
            StorageClass: 'STANDARD',
        },
        {
            Key: 'i/2001/01-01/tswift.jpg/jpeg/80x80',
            LastModified: new Date(),
            ETag: '"f391375a64f37bba141aa5a5ed0c98e2"',
            Size: 1547,
            StorageClass: 'STANDARD',
        },
        {
            Key: 'i/2001/01-01/tswift.jpg/jpeg/81x81',
            LastModified: new Date(),
            ETag: '"40618a08c72ce4198889f8f009900e12"',
            Size: 1706,
            StorageClass: 'STANDARD',
        },
        {
            Key: 'i/2001/01-01/tswift.jpg/jpeg/90x90',
            LastModified: new Date(),
            ETag: '"a197f7deb6e6910d0c6ca4c97838cc7a"',
            Size: 1888,
            StorageClass: 'STANDARD',
        },
        {
            Key: 'i/2001/01-01/tswift.jpg/jpeg/95x95',
            LastModified: new Date(),
            ETag: '"f1348192b6481ae449faa556b3b02e97"',
            Size: 1944,
            StorageClass: 'STANDARD',
        },
    ],
    IsTruncated: false,
    KeyCount: 7,
    MaxKeys: 1000,
    Name: 'tacocat-gallery-sam-dev-derived-images',
    Prefix: 'i/2001/01-01/tswift.jpg/',
};

const deleteObjectsResponseWithItems: DeleteObjectsCommandOutput = {
    $metadata: {
        httpStatusCode: 200,
        requestId: 'M8BFXQAX8KHX3ZYN',
        extendedRequestId: 'bBXsAOOrEcm9sWiiqTru0+eNvZf0iP5aFGtJYX6Sq7eyh1Wi3JHGeCvVqqxTy89gkuGGYp1o9mI=',
        cfId: undefined,
        attempts: 1,
        totalRetryDelay: 0,
    },
    Deleted: [
        { Key: 'i/2001/01-01/tswift.jpg/jpeg/80x80' },
        { Key: 'i/2001/01-01/tswift.jpg/jpeg/81x81' },
        { Key: 'i/2001/01-01/tswift.jpg/jpeg/75x75' },
    ],
};
