import { Context, Handler, S3Event } from 'aws-lambda';

/**
 * A Lambda function that kicks off the image processing Step Functions
 * state machine every time a new object is uploaded
 * into the S3 uploads bucket
 * under the "albums/" prefix.
 */
export const handler: Handler = async (event: S3Event, context: Context, callback) => {
    const record = event.Records[0];
    console.info('I got this event: ', event);
    console.info('s3', record.s3);
    console.info('bucket name:', record.s3.bucket.name);
    console.info('bucket key: ', record.s3.object.key);
    console.info('request ID: ', context.awsRequestId);
    console.info('event name: ', record.eventName);

    if (!record.eventName.includes('Removed') && !record.eventName.includes('Created')) {
        console.info(`Unhandled event: [${record.eventName}]`);
        callback(`Unhandled event: [${record.eventName}]`);
    }
};
