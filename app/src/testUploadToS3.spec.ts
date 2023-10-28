import * as fs from 'fs';
import { Upload } from '@aws-sdk/lib-storage';
import { S3Client } from '@aws-sdk/client-s3';

test('Test uploading to S3 bucket', async () => {
    const filename = 'upload_test.png';
    const fileStream = fs.createReadStream(__dirname + '/' + filename);

    const parallelUploads3 = new Upload({
        params: {
            Bucket: 'tacocat-gallery-sam-dev-uploadbucket-17a1cq1lwjzxt',
            Key: `image-${Date.now()}.png`,
            Body: fileStream,
        },
        tags: [
            {
                Key: 'albumPath',
                Value: '/2001/12-31/',
            },
        ],
        queueSize: 4, // optional concurrency configuration
        leavePartsOnError: false, // optional manually handle dropped parts
        client: new S3Client({}),
    });

    parallelUploads3.on('httpUploadProgress', (progress: unknown) => {
        console.log(progress);
    });

    await parallelUploads3.done();
    console.info('Done uploading');
});