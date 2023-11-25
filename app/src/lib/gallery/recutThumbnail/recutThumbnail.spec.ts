import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { recutThumbnail } from './recutThumbnail';
import { Rectangle } from '../../../lambdas/generateDerivedImage/focusCrop';

const mockDocClient = mockClient(DynamoDBDocumentClient);

afterEach(() => {
    mockDocClient.reset();
});

describe('Invalid Image Path', () => {
    const crop: Rectangle = { x: 0, y: 0, width: 200, height: 200 };

    test('blank image path', async () => {
        const imagePath = '';
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*path/i);
    });

    test('malformed image path', async () => {
        const imagePath = '/2001/12-31/';
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*path/i);
    });
});

describe('Invalid Crop', () => {
    const imagePath = '/2001/12-31/image.jpg';

    test('empty crop', async () => {
        const crop = {} as unknown as Rectangle;
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid/i);
    });

    test('missing x', async () => {
        const crop = { y: 0, width: 200, height: 200 } as unknown as Rectangle;
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*x/i);
    });

    test('missing y', async () => {
        const crop = { x: 0, width: 200, height: 200 } as unknown as Rectangle;
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*y/i);
    });

    test('missing width', async () => {
        const crop = { x: 0, y: 0, height: 200 } as unknown as Rectangle;
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*width/i);
    });

    test('blank x', async () => {
        const crop = { x: '', y: 0, width: 200, height: 200 } as unknown as Rectangle;
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*x/i);
    });

    test('negative x', async () => {
        const crop = { x: -1, y: 0, width: 200, height: 200 };
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*x/i);
    });

    test('float x', async () => {
        const crop = { x: 1.1, y: 0, width: 200, height: 200 };
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*x/i);
    });

    test('non-numeric x', async () => {
        const crop = { x: 'a', y: 0, width: 200, height: 200 } as unknown as Rectangle;
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*x/i);
    });

    test('string integer x', async () => {
        const crop = { x: '1', y: 0, width: 200, height: 200 } as unknown as Rectangle;
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*x/i);
    });

    test('string zero x', async () => {
        const crop = { x: '0', y: 0, width: 200, height: 200 } as unknown as Rectangle;
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*x/i);
    });
});

test('Save Crop', async () => {
    const crop = { x: 0, y: 0, width: 200, height: 200 };
    await recutThumbnail('/2001/12-31/image.jpg', crop);
    expect(mockDocClient.commandCalls(UpdateCommand).length).toBe(1);
    const x = mockDocClient.commandCalls(UpdateCommand)[0].args[0].input;
    expect(x?.Key?.parentPath).toBe('/2001/12-31/');
    expect(x?.Key?.itemName).toBe('image.jpg');
});
