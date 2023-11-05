-- These snippets are used for manual testing via the AWS Console or a DynamoDB thick client

-- GET ALL ATTRIBUTES OF AN ITEM

SELECT *
FROM "tacocat-gallery-sam-dev-GalleryItemDDBTable-IML0M4QPQOFY" 
WHERE parentPath='/2001/' AND itemName='01-01'

-- GET AN ALBUM'S IMAGES

SELECT parentPath, itemName, tags
FROM "tacocat-gallery-sam-dev-GalleryItemDDBTable-IML0M4QPQOFY" 
WHERE parentPath='/2023/01-01/' 


-- GET WHETHER AN ALBUM IS USING AN IMAGE AS IT'S THUMBNAIL

SELECT parentPath, itemName, updatedOn, thumbnail.path 
FROM "tacocat-gallery-sam-dev-GalleryItemDDBTable-IML0M4QPQOFY" 
WHERE parentPath='/2001/' AND itemName='01-01' AND thumbnail.path='/2001/01-01/tswift.jpg'


-- UPDATE ATTRIBUTES

UPDATE "tacocat-gallery-sam-dev-GalleryItemDDBTable-IML0M4QPQOFY"
SET title='Years don\'t need titles, do they?'
SET description='Here\'s what we did this year'
SET updatedOn='2023-10-26T23:56:39.618Z'
WHERE parentPath='/' AND itemName='2018' 

-- RENAME IMAGE: UPDATE ALBUM'S USAGE OF IMAGE AS THUMBNAIL

UPDATE "tacocat-gallery-sam-dev-GalleryItemDDBTable-IML0M4QPQOFY"
SET thumbnail.path='/2001/01-01/NEW_NAME.jpg'
SET updatedOn='2023-11-02T07:55:45.847Z' 
WHERE parentPath='/2001/' AND itemName='01-01' AND thumbnail.path='/2001/01-01/OLD_NAME.jpg'

-- DELETE IMAGE: REMOVE IMAGE ENTRY

DELETE FROM "tacocat-gallery-sam-dev-GalleryItemDDBTable-IML0M4QPQOFY"
WHERE parentPath='/2023/01-01' AND itemName='oldImage.jpg'

-- DELETE IMAGE: REMOVE ALBUM'S USAGE OF IMAGE AS THUMBNAIL

UPDATE "tacocat-gallery-sam-dev-GalleryItemDDBTable-IML0M4QPQOFY" 
REMOVE thumbnail
SET updatedOn='2023-11-02T07:55:45.847Z' 
WHERE parentPath='/2001/01-01/' AND itemName='tswift.jpg' AND thumbnail.path='/2001/01-01/tswift.jpg'
