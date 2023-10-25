import { BadRequestException } from '../../api_gateway_utils/BadRequestException';
import { NotFoundException } from '../../api_gateway_utils/NotFoundException';

/**
 * Update an image's attributes (like title and description) in DynamoDB
 *
 * @param tableName Name of the table in DynamoDB containing gallery items
 * @param imagePath Path of the image to update, like /2001/12-31/image.jpg
 * @param attributesToUpdate bag of attributes to update
 *
 * @returns nothing if success
 */
export async function updateImage(tableName: string, imagePath: string, attributesToUpdate: unknown) {
    //
    // Validate the input
    //

    if (!imagePath) {
        throw new BadRequestException('No image path specified');
    }

    const dynamoParams = generateDynamoUpdateParams(ctx.tableName, imagePath, attributesToUpdate);

    try {
        await ctx.doUpdate(dynamoParams);
    } catch (e) {
        if (e.toString().includes('conditional')) {
            throw new NotFoundException(`Image not found: [${imagePath}]`);
        } else {
            throw e;
        }
    }
}
