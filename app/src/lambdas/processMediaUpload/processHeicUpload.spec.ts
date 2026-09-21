import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { mockClient } from 'aws-sdk-client-mock';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { sdkStreamMixin } from '@smithy/util-stream';
import sharp from 'sharp';
import { recordMediaProcessingError } from '../../lib/dynamo_utils/recordError';
import { processHeicUpload } from './processHeicUpload';

jest.mock('../../lib/dynamo_utils/recordError');
const mockRecordError = jest.mocked(recordMediaProcessingError);
const mockS3Client = mockClient(S3Client);

const bucket = 'no-such-bucket';
const heicKey = '2024/06-15/photo.heic';
const jpegKey = '2024/06-15/photo.jpg';

/**
 * Stands in for a HEIC. The converter decides what to do by the key and Sharp
 * by the bytes, and the Sharp installed here lacks the HEVC decoder the Lambda
 * layer carries, so a PNG exercises the same code. The HEIC decode itself is
 * covered by the heicConversion integration suite.
 */
const png = fs.readFileSync(path.join(__dirname, '..', '..', 'test', 'data', 'images', 'image.png'));

function uploadOf(bytes: Buffer) {
    return { Body: sdkStreamMixin(Readable.from([bytes])) };
}

function commandOrder(): string[] {
    return mockS3Client.calls().map((call) => call.args[0].constructor.name);
}

beforeEach(() => {
    jest.spyOn(console, 'info').mockReturnValue(undefined);
    jest.spyOn(console, 'error').mockReturnValue(undefined);
    mockS3Client.reset();
    mockS3Client.on(GetObjectCommand).resolves(uploadOf(png));
    mockS3Client.on(PutObjectCommand).resolves({});
    mockS3Client.on(DeleteObjectCommand).resolves({});
    mockRecordError.mockResolvedValue(true);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('a convertible upload', () => {
    it('is written back as a JPEG under the .jpg key, then the upload is deleted', async () => {
        await expect(processHeicUpload(bucket, heicKey)).resolves.toBe(jpegKey);

        const puts = mockS3Client.commandCalls(PutObjectCommand);
        const { width, height } = await sharp(png).metadata();

        expect(puts).toHaveLength(1);

        const { Body, ...put } = puts[0].args[0].input;

        expect(put).toStrictEqual({ Bucket: bucket, Key: jpegKey, ContentType: 'image/jpeg' });
        expect(Buffer.isBuffer(Body)).toBe(true);
        await expect(sharp(Body as Buffer).metadata()).resolves.toMatchObject({ format: 'jpeg', width, height });

        const deletes = mockS3Client.commandCalls(DeleteObjectCommand);

        expect(deletes).toHaveLength(1);
        expect(deletes[0].args[0].input).toStrictEqual({ Bucket: bucket, Key: heicKey });
        expect(commandOrder()).toStrictEqual(['GetObjectCommand', 'PutObjectCommand', 'DeleteObjectCommand']);
        expect(mockRecordError).not.toHaveBeenCalled();
    });

    it('maps an uppercase HEIF extension to .jpg', async () => {
        await expect(processHeicUpload(bucket, '2024/06-15/photo.HEIF')).resolves.toBe(jpegKey);

        expect(mockS3Client.commandCalls(PutObjectCommand)[0].args[0].input.Key).toBe(jpegKey);
    });

    it('propagates a failed JPEG write and leaves the upload in place, so Lambda retries', async () => {
        mockS3Client.on(PutObjectCommand).rejects(new Error('SlowDown'));

        await expect(processHeicUpload(bucket, heicKey)).rejects.toThrow('SlowDown');

        expect(mockS3Client.commandCalls(DeleteObjectCommand)).toHaveLength(0);
        expect(mockRecordError).not.toHaveBeenCalled();
    });
});

describe('an upload Sharp cannot decode', () => {
    beforeEach(() => {
        mockS3Client.on(GetObjectCommand).resolves(uploadOf(Buffer.from('not an image')));
    });

    it('records the error against the upload path, deletes the upload and reports failure', async () => {
        await expect(processHeicUpload(bucket, heicKey)).resolves.toBe('');

        expect(mockRecordError).toHaveBeenCalledWith(
            `/${heicKey}`,
            expect.stringMatching(/^HEIC conversion failed: .+/),
        );
        expect(mockS3Client.commandCalls(PutObjectCommand)).toHaveLength(0);
        expect(mockS3Client.commandCalls(DeleteObjectCommand)[0].args[0].input).toStrictEqual({
            Bucket: bucket,
            Key: heicKey,
        });
    });

    it('still deletes the upload when the error could not be recorded', async () => {
        mockRecordError.mockResolvedValue(false);

        await expect(processHeicUpload(bucket, heicKey)).resolves.toBe('');

        expect(mockS3Client.commandCalls(DeleteObjectCommand)).toHaveLength(1);
    });

    it('still reports failure, with the error recorded, when the upload could not be deleted', async () => {
        mockS3Client.on(DeleteObjectCommand).rejects(new Error('AccessDenied'));

        await expect(processHeicUpload(bucket, heicKey)).resolves.toBe('');

        expect(mockRecordError).toHaveBeenCalledTimes(1);
    });
});

describe('an upload that cannot be read', () => {
    it('rejects when S3 returns no body', async () => {
        mockS3Client.on(GetObjectCommand).resolves({});

        await expect(processHeicUpload(bucket, heicKey)).rejects.toThrow(/body/i);

        expect(mockRecordError).not.toHaveBeenCalled();
        expect(mockS3Client.commandCalls(DeleteObjectCommand)).toHaveLength(0);
    });

    it('propagates the S3 error so Lambda retries', async () => {
        mockS3Client.on(GetObjectCommand).rejects(new Error('SlowDown'));

        await expect(processHeicUpload(bucket, heicKey)).rejects.toThrow('SlowDown');

        expect(mockRecordError).not.toHaveBeenCalled();
        expect(mockS3Client.commandCalls(DeleteObjectCommand)).toHaveLength(0);
    });
});
