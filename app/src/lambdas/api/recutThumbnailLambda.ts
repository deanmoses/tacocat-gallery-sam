import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import {
    HttpMethod,
    ensureHttpMethod,
    getBodyAsObject,
    getNumberField,
    getMediaPath,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { ensureAuthorizedForWrites } from '../../lib/lambda_utils/AuthorizationHelpers';
import { recutThumbnail } from '../../lib/gallery/recutThumbnail/recutThumbnail';
import { Rectangle } from '../generateDerivedImage/focusCrop';

/**
 * A Lambda function that stores thumbnail re-cut info about an image in DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.PATCH);
        await ensureAuthorizedForWrites(event);
        const mediaPath = getMediaPath(event);
        const body = getBodyAsObject(event);
        const crop: Rectangle = {
            x: getNumberField(body, 'x'),
            y: getNumberField(body, 'y'),
            width: getNumberField(body, 'width'),
            height: getNumberField(body, 'height'),
        };
        await recutThumbnail(mediaPath, crop);
        return respondSuccessMessage(event, `Media [${mediaPath}] thumbnail re-cut`);
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
