# tacocat-gallery-sam

Back end for Tacocat's photo gallery. Implemented using the Amazon AWS Serverless Application Model (SAM).

## Key services

Database (DynamoDB), image storage (S3), APIs (API Gateway), CDN (CloudFront), image EXIF/IPTC metadata extraction, image resizing.

# Getting Started

## Prerequisites

- Node.js 24 or higher
- The AWS Serverless Application Model Command Line Interface (SAM CLI)
- [esbuild](https://esbuild.github.io/) installed globally (`npm install --global esbuild`)
- I'm using the Visual Studio Code IDE with a lot of extensions, the AWS Toolkit is a key one

## Install

- Clone this project from github
- Install dependencies: `cd` into its directory, `cd app` and then install dependencies with `npm install` or `pnpm install` or `yarn`. *Note the `app` subdirectory!* Due to the way SAM handles Typescript, the package.json and all the Node.js stuff is under `app`.

## Build

Build the SAM app with the `sam build` command:

```bash
tacocat-gallery-sam$ sam build
```

This installs dependencies defined in `app/package.json`, compiles TypeScript with esbuild, creates a deployment package, and saves it in the `.aws-sam/build` folder.

It does NOT deploy to AWS; that comes later.

## Unit & integration tests

Use NPM to install the [Jest test framework](https://jestjs.io/) and run unit tests...

```bash
tacocat-gallery-sam$ cd app
app$ npm install
app$ npm run test
```

... or better yet use Visual Studio Code's Jest support rather than dealing with the command line.

## Invoke lambdas locally

Run Lambda functions locally via `sam local invoke` (this requires Docker) and passing it a test event:

```bash
tacocat-gallery-sam$ sam local invoke HelloWorldFunction --event app/src/test/data/events/some-event.json
```

An event is a JSON document that represents the input that the function receives from the event source. Some test events are in the `app/src/test/data/events` folder.

## Debug lambdas locally

To debug a Lambda function locally, run the function in debug mode by adding `-d 5858`...

```bash
sam local invoke HelloWorldFunction -e app/src/test/data/events/events/some-event.json -n .env.json -d 5858
```

... then attach to the function in Visual Studio's debugger. You have to configure each Lambda individuall in `.vscode/launch.json`. Yes that's a hassle.

## Run API locally

Use `sam local start-api` to run the API locally on port 3000:

```bash
tacocat-gallery-sam$ sam local start-api
tacocat-gallery-sam$ curl http://localhost:3000/
```

## Environments

The project can create three environments. Each environment is a separate AWS infrastructure stack.

| Environment | Stack Name | Web App | Purpose |
|-------------|------------|--------|---------|
| dev | tacocat-gallery-sam-dev | staging-pix.tacocat.com | Staging for manual testing |
| test | tacocat-gallery-sam-test | test-pix.tacocat.com | Integration tests (CI) |
| prod | tacocat-gallery-sam-prod | pix.tacocat.com | Production |

The web app is not in this project; it's built and hosted in other projects.

## Deploy for the first time

To deploy your application to AWS for the first time:

```bash
sam build
sam deploy --guided
```

`sam deploy --guided` will package and deploy your application to AWS, with a series of prompts.

After the first time configures everything, use `sam deploy` or `sam sync` after that (see next section)

## Deploy during development

While developing, run `sam sync` to keep watch over your lambda functions as they change and automatically deploy them to AWS. This skips the normal CloudFormation machinery and is thus much faster:

```bash
sam sync
```

## CI/CD

### Automatic staging deploy

When you merge a PR to `main`, GitHub Actions automatically:
1. Runs lint, type check, and unit tests
2. Builds the SAM application
3. Deploys to staging (the tacocat-gallery-sam-dev AWS stack)
4. The web app at <https://staging-pix.tacocat.com> is attached to the staging stack

### Deploy to production

To deploy to prod:

1. Get access to the [repo](https://github.com/deanmoses/tacocat-gallery-sam/)
2. Go to [*Actions* > *Deploy to Production*](https://github.com/deanmoses/tacocat-gallery-sam/actions/workflows/deploy-prod.yml)
3. Click "Run workflow" and select the `main` branch
4. The workflow:
   1. Runs tests
   2. Deploys to prod (the tacocat-gallery-sam-prod AWS stack)
      1. The live web app <https://pix.tacocat.com/> is attached to the prod stack
   3. Creates a GitHub release with auto-generated release notes

Technically, you could also deploy manually from your localhost command line, if you have all the AWS credentials configured.  However, it won't ensure you're deploying from main (it'll pick up whatever random code changes are on your local filesystem), and it won't create a GitHub release, so don't do it:

```bash
sam deploy --config-env prod
```

This will change the name of the stack to tacocat-gallery-sam-prod (look in `samconfig.toml` for how).

## Working with remote logs

The `sam logs` command fetches logs generated by your deployed Lambda functions.

Tail ALL Lambda functions in your AWS account:
```bash
sam logs --include-traces --tail
```
Tail a specific function:

```bash
sam logs --include-traces --tail -n HelloWorldFunction
```

