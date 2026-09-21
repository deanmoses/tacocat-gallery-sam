import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { recutThumbnail, toPixelsFromPctCrop } from './recutThumbnail';
import { Rectangle } from '../../../lambdas/generateDerivedImage/focusCrop';

const mockDocClient = mockClient(DynamoDBDocumentClient);

afterEach(() => {
    mockDocClient.reset();
});

describe('Invalid Image Path', () => {
    const crop: Rectangle = { x: 0, y: 0, width: 200, height: 200 };

    it('blank image path', async () => {
        const imagePath = '';
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*path/i);
    });

    it('malformed image path', async () => {
        const imagePath = '/2001/12-31/';
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*path/i);
    });
});

describe('Invalid Crop', () => {
    const imagePath = '/2001/12-31/image.jpg';

    it('empty crop', async () => {
        const crop = {} as unknown as Rectangle;
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid/i);
    });

    it('missing x', async () => {
        const crop = { y: 0, width: 200, height: 200 } as unknown as Rectangle;
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*x/i);
    });

    it('missing y', async () => {
        const crop = { x: 0, width: 200, height: 200 } as unknown as Rectangle;
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*y/i);
    });

    it('missing width', async () => {
        const crop = { x: 0, y: 0, height: 200 } as unknown as Rectangle;
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*width/i);
    });

    it('blank x', async () => {
        const crop = { x: '', y: 0, width: 100, height: 100 } as unknown as Rectangle;
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*x/i);
    });

    it('negative x', async () => {
        const crop = { x: -1, y: 0, width: 100, height: 100 };
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*x/i);
    });

    it('height > 100%', async () => {
        const crop = { x: 1.1, y: 0, width: 100, height: 101 };
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*height/i);
    });

    it('width > 100%', async () => {
        const crop = { x: 1.1, y: 0, width: 200, height: 100 };
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*width/i);
    });

    it('non-numeric x', async () => {
        const crop = { x: 'a', y: 0, width: 100, height: 100 } as unknown as Rectangle;
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*x/i);
    });

    it('string integer x', async () => {
        const crop = { x: '1', y: 0, width: 100, height: 100 } as unknown as Rectangle;
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*x/i);
    });

    it('string zero x', async () => {
        const crop = { x: '0', y: 0, width: 100, height: 100 } as unknown as Rectangle;
        await expect(recutThumbnail(imagePath, crop)).rejects.toThrow(/invalid.*x/i);
    });
});

test('Save Crop', async () => {
    const crop = { x: 0, y: 0, width: 100, height: 100 };
    // Mock out the AWS method to get the image dimensions
    mockDocClient.on(GetCommand).resolves({ Item: { dimensions: { width: 1000, height: 1000 } } });
    await recutThumbnail('/2001/12-31/image.jpg', crop);
    expect(mockDocClient.commandCalls(UpdateCommand)).toHaveLength(1);
    const x = mockDocClient.commandCalls(UpdateCommand)[0].args[0].input;
    expect(x?.Key?.parentPath).toBe('/2001/12-31/');
    expect(x?.Key?.itemName).toBe('image.jpg');
});

describe('Convert from % to absolute crop', () => {
    const inputs = [
        {
            name: 'Square original',
            pct: { x: 0, y: 0, width: 100, height: 100 },
            pixels: { width: 1000, height: 1000 },
            expected: { x: 0, y: 0, width: 1000, height: 1000 },
        },
        {
            name: 'Floats',
            pct: { x: 21.875, y: 0, width: 56.25, height: 99.9 },
            pixels: { width: 640, height: 360 },
            expected: { x: 140, y: 0, width: 360, height: 360 },
        },
    ];

    it.each(inputs)('$name', ({ pct, pixels, expected }) => {
        expect(toPixelsFromPctCrop(pct, pixels)).toStrictEqual(expected);
    });

    // toPixelsFromPctCrop({ x: 0, y: 10.3, width: 100, height: 100 }, { width: 1000, height: 750 })
    // should give { x: 0, y: 0, width: 1000, height: 1000 }: a full-height crop cannot start below the top
    it.todo('a 100% height crop with a nonzero y is clamped to y = 0');
});
