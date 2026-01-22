# How to Do Migrations

**Jan 2026** - As part of doing the migrations to fix up missing search results and fix up broken dimensions and missing tags, I've gotten more comfortable doing long-running migrations that touch DynamoDB, Redis, S3. The next time we need to fix up existing data, I'll be less scared of it. Writing this doc to record lessons learned.

## Lessons

### It's cheap

- **DynamoDB**: Running operations over every entry in DynamoDB costs less than a penny, don't be scared of it
- **Redis**: I pay a fixed cost on Redis, the ingress and egress of migrations doesn't cost me anything
- **S3**: I don't seem to be incurring more than a penny or so touching the ~40k original images in S3
- **Lambda**: maybe I spend a penny or so running a Lambda migration script over the entire gallery.

### Beware rate limiting

- **DynamoDB**:
    - The gallery tables are set for 3RCU/3WCU, which is 3 transactional writes or 6 eventually consistent reads a second, which is not enough to do a migration. So you get scary "rate limit exceeded" errors.
    - Go into the AWS Console and set the DynamoDB table to On Demand, and your rate limiting disappears and it still costs much less than a penny.
- I don't think S3 or Redis has rate limiting.

### Don't worry about hammering the AWS infrastructure

Don't build in waits to "be polite" to DynamoDB / S3. AWS can handle my scale without noticing.

### Use Lambdas

Write the migration as a Lambda and run it via the AWS Console:

- **It gets great logging automatically**
    - ... that my local Claude Code has access to, which made verifying these migrations much easier
- **It uses the AWS internal network**
    - ... it's MUCH faster than going over my wifi
- **You can specify the minimum permissions**
    - For example, I did NOT give the Fix Dimensions & Tags lambda permission to create or delete DynamoDB records, only update existing ones. And it did not get permission to write to S3.
- **It gets committed to the AWS SAM project**
    - It'll be there in three years when I wonder what I did

#### Do NOT use these non-Lambda approaches

- **Don't create a script that runs locally**
    - Especially if it isn't checked in to the AWS SAM project
        - In two years I'll wonder what I did and if there's data quality issues
    - The networking over wifi will be worse
    - The lack of logging
    - The fact that it could do ANYTHING, rather than the minimum permissions
- **Don't create a script that runs on EC2**
    - Especially if it isn't checked in to the AWS SAM project
        - In two years I'll wonder what I did and if there's data quality issues
    - I just don't know EC2 and a migration script is not the time to learn
    - I know how lambda logging works
    - I don't want to rent a EC2 server, I want to rent a lambda for a brief amount of work
    - The fact that it could do ANYTHING, rather than the minimum permissions

### Use JSON logging

- JSON logging makes it easy to use CloudWatch's searchable logs to find things like error counts and items processed.
- I used Claude Code to query the logs: find errors, count fixes, identify the last processed image, etc. This made debugging and monitoring much easier than the AWS Console alone.
- Using consistent event names (like `dimensions_updated`, `tags_updated`, `migrate_complete`) make CloudWatch queries predictable and reusable.

### Use idempotent, resumption-based architecture

The system WILL error for some reason or another:

- Like timeouts
    - A drawback of lambdas is that they time out after 15 minutes, but it's still better than the alternatives (see above).
- Like out of memory
- Like transient Redis errors that I don't understand

Be okay with failures; be okay the script not completing in one run; instead, have a system that can resume from the last bit processed.

- Look in the logs for the last item processed, and resume processing from there.
- **Idempotency**
    - The script should be idempotent (safe to run multiple times)
    - For example, the Fix Dimensions & Tags script was idempotent because re-applying the same fix produced the same result.
- **Continuation**
    - You don't want to have to re-process stuff you've already fixed
        - If the whole script takes 20 minutes to run and fails 15 minutes in, you don't want to wait 15 minutes for it to get back to the same point
        - You also don't want to pay the cost of those 15 minutes of lambda compute / DyanmoDB access etc
        - You also don't want to trigger the same issue 15 minutes in, if it was something like an out of memory issue
    - So it's important to build in a way to resume
        - Resume \*ON\* the item that didn't work, be careful not to resume on the item AFTER that
    - You need a way to identify where to resume
        - For Missing Search Results the resumption was by DynamoDB continuation token, but Fix Dimensions & Tags improved on that by resuming on particular photo.
        - Resuming on a particular photo or album is the best approach
            - You process the gallery in reverse chronological order, from newest album to oldest. This lets you:
                - **Understand where in the process you are**
                    - When the logs say it stopped at "/2017/03-26/almost_gone.jpg", I have a pretty good idea of how far it got to
                    - ... as opposed to a DynamoDB continuation token which processes results in an order that's deterministic but not chronological.
                - **See the changes in your newest albums first**
                    - The newest albums are the ones you have the freshest memory of and can best validate whether the migration worked.

#### Example continuation output

Here's an example of what the Lambda response from Fix Dimensions & Tags looked like. The `startFrom` identifies where the script stopped at for some reason, like it hit the max number of results the script allowed it to process in one run:

```json
{
    "albumsChecked": 923,
    "imagesChecked": 16922,
    "issuesFound": 300,
    "issuesFixable": 300,
    "issuesUnfixable": 0,
    "issuesFixed": 300,
    "durationMs": 635250,
    "stoppedEarly": true,
    "startFrom": "/2017/03-26/almost_gone.jpg"
}
```

In practice, I've found scripts often do NOT complete successfully, due to out of memory or timeouts or other errors. In that case, look at the logs for the last item processed.

To resume where the script stopped from:

```json
{
    "mode": "fix",
    "image": "/2017/03-26/almost_gone.jpg"
}
```

## Techniques

### Two modes: diagnose vs fix

Having a mode that was read-only, that just reported problems, is super helpful. Run it from the AWS console something like this:

```json
{
    "mode": "diagnose"
}
```

And then actually fix things like this:

```json
{
    "mode": "fix"
}
```

### Single-image mode

For Fix Dimensions & Tags, the `image` parameter let me test the migration on specific images before running it on the whole gallery. I found it very useful to validate that the script worked correctly: it gave me the confidence I needed to run it over the whole gallery.

Example of invoking it:

```json
{
    "mode": "diagnose",
    "image": "/2025/12-28/uc_campus2.jpg"
}
```

Example output:

```json
{
    "albumsChecked": 0,
    "imagesChecked": 1,
    "issuesFound": 1,
    "issuesFixable": 1,
    "issuesUnfixable": 0,
    "issuesFixed": 0,
    "durationMs": 342,
    "stoppedEarly": false,
    "issues": [
        {
            "path": "/2024/07-04/fireworks.jpg",
            "type": "dimensionsOrientation",
            "details": "DynamoDB: 4016x6016, S3: 6016x4016, EXIF orientation: 6"
        }
    ]
}
```

### Cap the # issues addressed

For Fix Dimensions & Tags we capped the # of issues addressed in a single run at 300 to prevent out of memory errors collecting all the issues for reporting at the end. But also I feel like after 300 fixed issues, I want to verify that the issues were indeed fixed.

### Distinguish fixable vs unfixable issues

For Fix Dimensions & Tags, the migration categorized issues and only auto-fixed safe ones (`dimensionsOrientation`, `tagsMismatch`). Unfixable issues (`dimensionsOther`, `corrupt`, `missingFromS3`) were logged for manual review. This conservative approach prevented the one weird image from being auto-"fixed" incorrectly.

### Give it lots of memory

- Give the migration lambda more memory than regular gallery lambdas, like 2048MB
- This makes it run faster, because Lambda CPU scales proportionally with memory
- It might actually make it cheaper because it runs faster
- This allows it to collect more results for eventual return to the user, though I've found collecting lots of results like this to be of limited value compared to just searching the logs for the results.

### Run in test, then dev, then prod

1. **Run the migration lambda on the test stack first**. Since there's basically zero data, it just tests that the thing can run.
2. **Then the dev/staging stack** (smaller data set than prod)
3. **Then prod** (this is where the data size becomes a challenge)

### Use AI

- Have the AI plan the migration
- Have the AI write the migration
- Have the AI write unit tests
- Have multiple AIs review it -- both the plan and the implementation
    - You want these migrations to be bug-less
    - Codex AI seems to be good at finding bugs
- Emphasize to the AI to not update databases / filesystems directly
    - Claude Code almost ran a raw DynamoDB update on prod!
    - Emphasize to the AI that all updates go through the tested migration script
