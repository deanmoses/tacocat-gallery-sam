import * as fs from 'fs';
import { Upload } from '@aws-sdk/lib-storage';
import { S3Client } from '@aws-sdk/client-s3';

test('Test uploading to S3 bucket', async () => {
    const fileStream = fs.createReadStream(__dirname + '/test_data/test_image.jpg');
    const parallelUploads3 = new Upload({
        params: {
            //Bucket: 'tacocat-gallery-sam-dev-originals',
            Bucket: 'tacocat-gallery-sam-dev-uploads',
            //Key: `2001/12-31/image-${Date.now()}.jpg`,
            Key: `2001/12-31/image.jpg`,
            Body: fileStream,
        },
        // tags: [
        //     {
        //         Key: 'albumPath',
        //         Value: '/2001/12-31/',
        //     },
        // ],
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
