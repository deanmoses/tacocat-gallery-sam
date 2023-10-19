# tacocat-gallery-sam
Tacocat Gallery back end APIs and image processing.  Implemented on Amazon AWS Serverless Application Model (SAM).

# Prerequisites
 - Node.js
 - The AWS SAM CLI

# IDE 
I'm using Visual Studio Code with the following extensions:
 - AWS Toolkit

# Install
Run `npm install` on each nested SAM app, such as:
```
    cd image_api/image_api_app
    npm install

    cd state_machine/state_machine_app
    npm install
```

# Build
From root:
```
npm run build
```

# Deploy
From root:
```
npm run deploy
```