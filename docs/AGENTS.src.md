START_IGNORE

<!-- markdownlint-disable-file MD041 -->

This is the source file for generating CLAUDE.md and AGENTS.md.
Do not edit those files directly - edit this file instead.

Regenerate with: npm run agent-docs (from app/ directory)

Markers:

- START_CLAUDE / END_CLAUDE - content appears only in CLAUDE.md
- START_AGENTS / END_AGENTS - content appears only in AGENTS.md
- START_IGNORE / END_IGNORE - content stripped from both (like this block)

END_IGNORE

START_CLAUDE

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

END_CLAUDE

START_AGENTS

# AGENTS.md

This file provides guidance to AI programming agents when working with code in this repository.

END_AGENTS

## Project Overview

AWS Serverless (SAM) backend for a photo and video gallery. Uses:

- DynamoDB for metadata (info about albums, images, and videos)
- S3 for media files: originals, derived images (resizes/thumbnails), transcoded videos
- Lambda for processing (EXIF extraction, image resizing, video transcoding via MediaConvert)
- API Gateway for the front end website to access the lambdas
- CloudFront for CDN delivery
- Redis Labs for search indexing

This project does NOT contain the front end, the gallery website. That's in another project.

## Common Commands

All commands run from the `app/` directory unless noted:

```bash
# Testing and linting
npm test              # unit tests with silent console output
npm run test:verbose  # unit tests with console output. Use for debugging only, this gets pretty noisy
npm run test:integration  # integration tests (requires AWS credentials)
npm run test:all      # all tests (unit + integration)
npm run lint          # ESLint, check only (fails on violations)
npm run lint:fix      # ESLint with auto-fix
npm run format:check  # Prettier, check only
npm run format        # Prettier with auto-fix
npm run lint:md       # markdownlint
npm run lint:cfn      # cfn-lint on template.yaml (via SAM CLI)
npm run lint:shell    # shellcheck on shell scripts (requires shellcheck)
npm run lint:actions  # actionlint on GitHub workflows (requires actionlint)

# Building and deploying (from project root)
sam build             # Build SAM application
sam deploy --no-execute-changeset  # Creates a changeset in AWS without executing it (uploads artifacts, needs credentials)
sam deploy            # Deploy to dev/staging
sam sync --watch      # Deploy to dev/staging and watch mode for rapid dev iteration

# Logs
sam logs --include-traces --tail         # All function logs (one shared log group per stack)
sam logs -n FunctionName --tail          # Specific function logs
aws logs tail tacocat-gallery-sam/dev --since 1h   # Same log group via the AWS CLI

# Documentation
npm run agent-docs    # Regenerate CLAUDE.md and AGENTS.md from docs/AGENTS.src.md
```

### esbuild

`sam build` shells out to esbuild on the host. It is pinned as an `app/` devDependency, but SAM resolves `node_modules` relative to each `CodeUri`, so the pinned binary is found only via PATH -- a global esbuild (Homebrew, `npm i -g`) silently shadows it and builds with a different version. To use the pinned one:

```bash
PATH="$PWD/app/node_modules/.bin:$PATH" sam build
```

## Environments

The project can create three environments. Each environment is a separate AWS infrastructure stack.

| Environment | Stack Name               | Web App                 | Purpose                    |
| ----------- | ------------------------ | ----------------------- | -------------------------- |
| dev         | tacocat-gallery-sam-dev  | staging-pix.tacocat.com | Staging for manual testing |
| test        | tacocat-gallery-sam-test | test-pix.tacocat.com    | Integration tests (CI)     |
| prod        | tacocat-gallery-sam-prod | pix.tacocat.com         | Production                 |

The web app is not in this project; it's built and hosted in other projects.

### Deploying to specific environments

Use `--config-env` to deploy to a specific environment:

```bash
sam build
sam deploy                       # Deploy to dev (default)
sam deploy --config-env test     # Deploy to test environment
```

Do NOT deploy to the prod environment. NEVER deploy to the prod environment. That goes through a GitHub Actions CI/CD process.

### Running integration tests locally

Integration tests run against the test environment. Deploy to test first, then run:

```bash
sam build
sam deploy --config-env test     # Deploy to test environment
cd app && npm run test:integration
```

Note: Integration tests require AWS credentials and hit actual AWS resources in the test stack.

## Architecture

### Gallery Path Structure

Strict date-based hierarchy enforced throughout:

- Root: `/`
- Year albums: `/YYYY/`
- Day albums: `/YYYY/MM-DD/`
- Images: `/YYYY/MM-DD/image.jpg`

All paths validated via regex in `app/src/lib/gallery_path_utils/`.

### DynamoDB Data Model

Composite key structure:

- Partition key: `parentPath` (e.g., `/2024/`)
- Sort key: `itemName` (e.g., `01-15` or `photo.jpg`)
- Item types: `album` or `image`

### Lambda Functions (`app/src/lambdas/`)

- **api/**: REST endpoints (CRUD for albums/images, search, admin operations)
- **processMediaUpload/**: S3-triggered, processes uploads (images: extract EXIF; videos: start transcoding)
- **videoTranscodingComplete/**: EventBridge-triggered, handles MediaConvert job completion
- **generateDerivedImage/**: Lambda URL, generates resized images via Sharp
- **dynamoToRedis/**: DynamoDB Streams-triggered, syncs data to Redis for search

### Shared Libraries (`app/src/lib/`)

- **gallery/**: Core business logic organized by operation
- **lambda_utils/**: Exception types, API Gateway helpers, response formatting
- **dynamo_utils/**: DynamoDB query patterns
- **redis_utils/**: Redis client, search operations
- **s3_utils/**: S3 operations (copy, list, delete)
- **gallery_path_utils/**: Path validation and parsing

### Lambda Handler Pattern

```typescript
export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // Validate request
        // Call business logic
        return respondHttp(event, result);
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
```

Custom exceptions: `NotFoundException`, `BadRequestException`, `UnauthorizedException`, `ServerException`

For detailed architecture documentation (S3 storage patterns, CDN routing, design decisions), see `docs/Architecture.md`.

## Code Style

Prettier (see `.prettierrc.js`): 4-space indent, single quotes, 120 char width, trailing commas.

### Don't wrap Markdown

Never hard-wrap prose in Markdown. Write each paragraph and list item as one long line and let the viewer soft-wrap it to its own width; wrapping at ~80 columns turns into choppy short lines on a narrow screen. Tables, code blocks and YAML frontmatter keep their own line structure.

## Logging

Use structured logging for CloudWatch queryability. Pass a plain object as the single argument to the console method:

```typescript
console.info({ event: 'transcoding_complete', videoPath, videoId });
console.error({ event: 'transcoding_failed', videoPath, error: errorMessage });
```

- Always include an `event` field (snake_case) describing what happened
- Include relevant context (IDs, paths, etc.) as additional fields
- Use `console.info` for success/progress, `console.error` for failures, `console.warn` for warnings
- Never `JSON.stringify` the object or pass extra arguments. The Lambda functions use the JSON log format, so the runtime already wraps each record in JSON with `timestamp`, `level` and `requestId` and nests a single object argument under `message` as real JSON. A pre-stringified string gets escaped into `message`, and Logs Insights can't then query its fields without a `parse` step.

## Key Configuration Files

- `template.yaml`: SAM CloudFormation template defining all AWS resources
- `samconfig.toml`: Deployment configs for dev/test/prod environments
- `.env.json`: Local development environment variables

## Important Notes

- Sharp library runs in a Lambda Layer due to native compilation requirements
- S3 versioning enabled; `versionId` tracked in image metadata
- Integration tests hit actual AWS resources (require valid credentials)
- Production resources have `Retain` deletion policy

## Tools & CI/CD

- **gh CLI**: Use the `gh` CLI tool for GitHub operations.
- **Branch protection**: The `main` branch is protected. All changes require a pull request.
- **Pre-commit hooks**: Husky runs gitleaks (secret scanning), shellcheck, actionlint, markdownlint, lint-staged, type checking, and unit tests on commit. gitleaks, shellcheck, and actionlint are skipped with a warning if not installed locally; CI enforces them regardless.
- **CI workflow**: On PR and push to main, runs lint, format check, markdownlint, shellcheck, actionlint, cfn-lint, type check, unit tests, and SAM build. On push to main, also deploys to staging.
- **Production deploy**: Manual workflow dispatch from GitHub Actions. Runs tests, deploys to prod, creates a release tag (YYYYvN format), and generates release notes.

START_CLAUDE

## Custom Skills

Use this project's `/branch`, `/commit` and `/pr` skills via the Skill tool rather than running git or gh by hand.

END_CLAUDE

## Git Amend

`git commit --amend` only amends HEAD (the most recent commit). To amend an older commit, you must use interactive rebase:

```bash
git rebase -i <commit>^   # Interactive rebase starting from parent of target commit
# Change "pick" to "edit" for the commit you want to amend
# Make your changes, then:
git add <files>
git commit --amend
git rebase --continue
```

START_AGENTS

## Branch, Commit and PR Conventions

Use these types for branch names, commit messages, and PR titles:

- `feat`: User-facing features or behavior changes (must change production code)
- `fix`: Bug fixes (must change production code)
- `docs`: Documentation only
- `style`: Code style/formatting (no logic changes)
- `refactor`: Code restructuring without behavior change
- `test`: Adding or updating tests
- `chore`: CI/CD, tooling, dependency bumps, configs (no production code)

### Branch Naming

Use `type/short-description`:

```text
feat/search-pagination
fix/year-search-bug
chore/pre-commit-hooks
```

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <description>

[optional body]
```

- **Scopes:** Optional. Use when it adds clarity (e.g., `api`, `gallery`, `search`).
- **Breaking changes:** Use `!` suffix: `feat!: remove deprecated endpoint`

**Examples:**

```text
feat(search): add pagination support
fix(gallery): include newest year in search results
chore: add husky pre-commit hooks
docs: update API documentation
```

### Pull Requests

**PR titles:** Use conventional commit format, same as commit messages.

**PR descriptions:**

```markdown
## Summary

One sentence describing the overall change.

- Optional supporting details
- If needed

## Test plan

- [ ] How to verify it works
```

### PR Labels

Use labels on pull requests. Apply all labels that fit. Only use the following labels:

- `enhancement` - User-facing features or improvements. Must change production code behavior.
- `refactor` - Production code changes that don't alter behavior
- `bug` - Fixes broken production code functionality
- `test` - Changes to tests
- `documentation` - Documentation changes

**No label needed** for dependency bumps, CI/CD, tooling, or infrastructure changes - these go in "Other Changes" in release notes.

END_AGENTS

## AI Assistant Configuration

`docs/AGENTS.src.md` is the single source of truth for AI assistant instructions. Two files are auto-generated from it:

- `CLAUDE.md` - Instructions for Claude Code
- `AGENTS.md` - Generic instructions for other AI assistants

**To update AI assistant instructions:**

1. Edit `docs/AGENTS.src.md` (never edit CLAUDE.md or AGENTS.md directly)
2. Run `npm run agent-docs` (from app/) to regenerate, or just commit and the pre-commit hook will regenerate automatically

**Conditional content markers:**

- `START_CLAUDE` / `END_CLAUDE` - Content appears only in CLAUDE.md
- `START_AGENTS` / `END_AGENTS` - Content appears only in AGENTS.md
- `START_IGNORE` / `END_IGNORE` - Content stripped from both (for source file metadata)
