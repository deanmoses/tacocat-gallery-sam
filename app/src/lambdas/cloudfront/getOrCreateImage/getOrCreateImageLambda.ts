import { CloudFrontResponseEvent, CloudFrontResponseResult, Handler } from 'aws-lambda';
import { getOrCreateImage } from './getOrCreateImage';

/**
 * A Lambda used by CloudFront to resize images
 */
export const handler: Handler = async (event: CloudFrontResponseEvent): Promise<CloudFrontResponseResult> => {
    console.info('I got this event: ', event);
    console.info('CloudFormation record: ', event.Records[0].cf);
    await getOrCreateImage();
    event.Records[0].cf.response.headers['moses_header'] = [{ key: 'moses_header', value: 'moses_header_value' }];
    console.info('getOrCreateImageLambda(): DONE!');

    return event.Records[0].cf.response;
};
