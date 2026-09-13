# Repo & Domain Consolidation

We want to consolidate the back end of the tacocat photo gallery to a single repo and a single domain:

- Migrate `tacocat-gallery-hosting-aws` and `tacocat-gallery-auth` repos into the `tacocat-gallery-sam`, which becomes the sole AWS infrastructure repo
- Move API requests from `api.pix.tacocat.com` → `pix.tacocat.com/api/`
- Move auth requests from `auth.pix.tacocat.com` → `pix.tacocat.com/auth/`
- Maybe also move media requests from `img.pix.tacocat.com` → `pix.tacocat.com/media/`

Things that wouldn't change:

- The `tacocat-gallery-sveltekit` front end repo would remain separate. Different build system, multiple hundreds of commits in 18 months, and it produces artifacts rather than deploying infrastructure.
- Cognito would still be configured manually.
- DNS lives outside AWS; certs stay ARN parameters rather than becoming in-stack resources.
- Redis would still be configured independently.

## Reasons

### Simplicity

#### Collapse all AWS infrastructure from 3 repos to 1

When we bump dependencies or improve linting or testing or upgrade Node, we only do it once. For example, this will improve our ability to do testing over the pix.tacocat.com Cloudfront because right now tacocat-gallery-hosting-aws just uses some janky shell scripts for tests rather than an industrial strength testing system like tacocat-gallery-sam already has.

This would also allow us to make coordinated changes more easily, though that hasn't been a big problem so far.

#### Eliminate all the CORS complexity

Eliminate CORS: `AllowCredentials`, `credentials: 'include'` and preflights. Optionally drop `Domain=tacocat.com` afterwards, so cookies stop reaching every `*.tacocat.com` host.

### Performance

#### Global CDN for API requests

Put the Cloudfront CDN, a global edge, in front of API Gateway, a regional edge only in Virginia.

#### Reduce TLS handshake time

Remove some handshake time by removing domains. However, `preconnect` has diminished the importance of this one. `api.pix.tacocat.com` shows 0.10ms observed RTT in Lighthouse because the preconnect hint fires during HTML parse. The 155ms handshake runs in parallel with the 122ms shell download. Starting at ~10ms it completes around ~165ms; the album fetch starts at 122ms. So the exposed portion is only ~40ms.

Worth confirming with a Resource Timing check on connectStart/connectEnd for the album request in production before spending the effort. Everything below assumes it's still worth it.

## Merge or not?

Should we move the stacks into the `tacocat-gallery-sam` repo but keep the stacks separate, not merged into a single `template.yaml`?

## Costs and considerations if we don't merge stacks

### Releases

#### Alternative: separate stacks

- **Each stack would get its own folder**.
- **Each stack would get its own release** and own release tag: `hosting-2026v3`, `auth-2026v1`, `backend-2026v9`.
- **There's one prod deploy action**; it would deploy only the stacks whose directory changed since the last release.
- **There's no atomic rollback**; if a subsequent stack fails the prior ones will not be rolled back and prod is only partially released.

#### Alternative: nested stacks

- Use nested stacks, which DO get rolled back if one stack fails. However, changes go live one by one. Each nested stack's changes serve traffic as soon as they apply. If auth updates first and SAM then fails, the new auth is live until the rollback reaches it.
- Not sure how release tags work in this model
- Deploy time. SAM builds every Lambda in every child on each deploy, even when only hosting changed. A few minutes per prod release rather than one with separate stacks.

### Repo layout

The SAM CLI assumes one `template.yaml` and `samconfig.toml` per directory. Separate stacks need subdirectories or `--template-file`/`--config-file`, which ripples into the hooks, CI and the sam build steps in `CLAUDE.md`.

## Costs and considerations if we merge stacks

### Auth test stack

Auth's `Env` parameter also no test value. Folding auth into the SAM stack would create auth in test, which would need its own Cognito client and secret. I don't want to do this.

### Deploy coupling

One rollback unit for auth and the photo pipeline.

### The distributions need importing, not recreating

CloudFront aliases are globally unique, you can't stand up a parallel `pix.tacocat.com`.

### Template length

`template.yaml` gets big: about 1838 + 496 + 229 = 2563 lines.

We have existing section banners which probably carry it. Nested stacks might be an escape hatch if not. Otherwise this may be the moment to consider CFN?

### Globals collisions

`MemorySize`: Auth is 128 and SAM is 1024, we'd just go with 1024.

`Timeout`: Auth is 10 and SAM is 100. 100 is way too much. Maybe we set it per function: API handlers around 10–29s, `ProcessMediaUpload` higher for HEIC, `SyncRedis` already correctly overrides to 900.

`Globals.Api`. Globals are per-template, so merging means dropping the global and declaring two explicit `AWS::Serverless::Api` resources with per-function `RestApiId`. Or make the four auth Lambdas routes on the main API (/auth/login and so on). Then `/api/*` and `/auth/*` share one origin.

## Costs and considerations whether or not we merge stacks

### CustomErrorResponses

CustomErrorResponses apply to the whole distribution. Once `/api/*` is added, every API or auth 403/404 comes back as `index.html` with a 200. Replace them with a viewer-request CloudFront Function.

## Sequencing

First draft of sequencing. Each heading would be a PR.

### Migrate `tacocat-gallery-hosting-aws`

Migrate `tacocat-gallery-hosting-aws` into `tacocat-gallery-sam`. Do not consolidate domains.

- Migrate `tacocat-gallery-hosting-aws`'s shell-based tests to `tacocat-gallery-sam`'s test frameworks

### Migrate `tacocat-gallery-auth`

Migrate `tacocat-gallery-auth` into `tacocat-gallery-sam`. Do not consolidate domains.

### Migrate `api.pix.tacocat.com`

Migrate `api.pix.tacocat.com` → `pix.tacocat.com/api/`.

### Migrate `auth.pix.tacocat.com`

Migrate `auth.pix.tacocat.com` → `pix.tacocat.com/auth/`.

### Migrate `img.pix.tacocat.com`

Migrate `img.pix.tacocat.com` → `pix.tacocat.com/media/`.
