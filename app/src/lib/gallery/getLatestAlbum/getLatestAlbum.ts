import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { AlbumThumbnail, AlbumThumbnailResponse } from '../galleryTypes';

/**
 * Retrieve the latest album in the gallery from DynamoDB.  Just retrieves
 * enough information to display a thumbnail: does not retrieve any child
 * photos or child albums.
 */
export async function getLatestAlbum(): Promise<AlbumThumbnailResponse | undefined> {
    // get path to current year's album
    const currentYearAlbumPath = `/${new Date().getUTCFullYear()}/`;
    const album = await getLatestItemInAlbum(currentYearAlbumPath);
    if (!album) return;
    else {
        return {
            album,
        };
    }
}

/**
 * Retrieve the latest album or image in the specified parent album from DynamoDB.
 *
 * Just retrieves enough information to display a thumbnail: does not retrieve any
 * child photos or child albums.
 *
 * @param path Path of the parent album, like /2001/12-31/
 */
async function getLatestItemInAlbum(path: string): Promise<AlbumThumbnail | undefined> {
    // find the most recent album within the current year
    const ddbCommand = new QueryCommand({
        TableName: getDynamoDbTableName(),
        KeyConditionExpression: 'parentPath = :parentPath',
        ExpressionAttributeValues: {
            ':parentPath': path,
        },
        ProjectionExpression: 'itemName,parentPath,updatedOn,title,description,thumbnail',
        Limit: 1, // # of results to return
        ScanIndexForward: false, // sort results in descending order, i.e., newest first
    });
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    const result = await docClient.send(ddbCommand);
    if (!!result.Items && result.Items?.length > 0) {
        return result.Items[0];
    } else {
        return undefined;
    }
}
