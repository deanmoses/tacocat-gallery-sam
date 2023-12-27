-- These snippets are used for manual testing via the AWS Console or a DynamoDB thick client

-- GET ALL ATTRIBUTES OF AN ITEM
SELECT *
FROM "tacocat-gallery-sam-dev-items" 
WHERE parentPath='/2001/' AND itemName='01-01'

-- GET AN ALBUM'S IMAGES
SELECT parentPath, itemName, tags
FROM "tacocat-gallery-sam-dev-items" 
WHERE parentPath='/2023/01-01/' 

-- GET WHETHER AN ALBUM IS USING AN IMAGE AS IT'S THUMBNAIL
SELECT parentPath, itemName, updatedOn, thumbnail.path 
FROM "tacocat-gallery-sam-dev-items" 
WHERE parentPath='/2001/' AND itemName='01-01' AND thumbnail.path='/2001/01-01/tswift.jpg'

-- UPDATE ATTRIBUTES
UPDATE "tacocat-gallery-sam-dev-items"
SET title='Albums don\'t have titles'
SET description='Here\'s what we did this year'
SET summary='Images don\t have summaries'
SET updatedOn='2023-10-26T23:56:39.618Z'
WHERE parentPath='/' AND itemName='2018' 

-- RENAME ALBUM - UPDATE IMAGES
-- THIS DOESN'T WORK: MUST SPECIFY itemName in WHERE clause
UPDATE "tacocat-gallery-sam-dev-items"
SET parentPath='/2023/01-02/'
WHERE parentPath='/2023/01-01/' -- MUST SPECIFY itemName in WHERE clause

-- RENAME IMAGE: UPDATE ALBUM'S USAGE OF IMAGE AS THUMBNAIL
UPDATE "tacocat-gallery-sam-dev-items"
SET thumbnail.path='/2001/01-01/NEW_NAME.jpg'
SET updatedOn='2023-11-02T07:55:45.847Z' 
WHERE parentPath='/2001/' AND itemName='01-01' AND thumbnail.path='/2001/01-01/OLD_NAME.jpg'

-- RENAME ALBUM: UPDATE ALBUM'S USAGE OF IMAGE AS THUMBNAIL
-- THIS DOESN'T WORK: contains() won't do a string contains on a nested element
UPDATE "tacocat-gallery-sam-dev-items"
SET thumbnail.path='/1400/01-02/INVALID.jpg' -- SET IMAGE PATH TO NEW PATH OF ALBUM
SET updatedOn='HEY I UPDATED THIS 2023-11-02T07:55:45.847Z' 
WHERE parentPath='/2023/' AND itemName='01-01' AND contains('thumbnail.path', '/2023/01-01/') -- OLD THUMB CONTAINS OLD PATH OF ALBUM

-- DELETE IMAGE: REMOVE IMAGE ENTRY
DELETE FROM "tacocat-gallery-sam-dev-items"
WHERE parentPath='/2023/01-01' AND itemName='oldImage.jpg'

-- DELETE IMAGE: REMOVE ALBUM'S USAGE OF IMAGE AS THUMBNAIL
UPDATE "tacocat-gallery-sam-dev-items" 
REMOVE thumbnail
SET updatedOn='2023-11-02T07:55:45.847Z' 
WHERE parentPath='/2001/01-01/' AND itemName='tswift.jpg' AND thumbnail.path='/2001/01-01/tswift.jpg'
