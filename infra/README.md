# Account setup deployed by hand

Things that must exist in the AWS account before CI can run, and so are deployed by hand rather than by CI.

## GitHub Actions roles

[github-oidc.yaml](github-oidc.yaml) creates the three roles the workflows assume (pull request, main, prod), the CloudFormation service role that does the actual deploying, and the [Claude Code on the web](#claude-code-on-the-web) user. The template's header comment explains how they fit together. The GitHub OIDC identity provider they trust is account-wide and lives in the [aws-bootstrap](https://github.com/deanmoses/aws-bootstrap) repo.

Deploy or update with admin credentials:

```bash
aws cloudformation deploy --template-file infra/github-oidc.yaml --stack-name tacocat-gallery-sam-cicd --capabilities CAPABILITY_NAMED_IAM
```

The role ARNs are stable, so the workflows and `samconfig.toml` reference them directly. If you rename a role, update `.github/workflows/*.yml` and the `role_arn` entries in `samconfig.toml` to match.

There are no AWS secrets in the GitHub repository. A workflow job gets a short-lived credential by presenting its OIDC token, and which role it may assume is decided by the token's `sub` claim: pull requests, runs on `main`, or the `prod` GitHub environment. The prod role's trust depends only on the `prod` environment's protected-branch rule: the environment is configured in the repository settings to deploy only from protected branches, of which `main` is the only one. There is no reviewer gate.

## Claude Code on the web

A cloud session can run `sam build`, `sam deploy`, `sam logs` and the integration tests, the same as a laptop. Three things have to be set up once, and only the first lives in this repo.

### The IAM user

`tacocat-gallery-claude-code-cloud`, in [github-oidc.yaml](github-oidc.yaml), holds what the `main` CI role holds (deploy dev and test, run the integration tests against the test stack) plus read access to every environment, which no CI job needs: logs, metrics and alarms, table rows and bucket contents, stack, Lambda and API Gateway configuration, the edge cache's version stores, and the bill. Prod is included: an incident is when you most want to look, and looking changes nothing. Deploying to prod and writing to prod's table, buckets or functions stay out of reach, under an explicit `Deny` that lists the reads and denies the rest.

The user is defined here, but what it may reach in each of the other Tacocat projects is granted there. Each of those repos attaches its own managed policy to this user from its own `infra/` stack, so a project's permissions live with the project rather than accumulating in this template. That makes this stack a prerequisite for theirs: the user has to exist before a policy can name it.

What this repo grants is its own: the gallery stacks and what they contain, in all three environments, and the image distribution's CloudFront access log bucket.

It carries a long-lived access key, the only principal here that does. A cloud session has no GitHub OIDC token to trade for a role, and IAM Identity Center needs a browser sign-in that cannot happen inside a session, so there is nothing shorter-lived to use. CloudFormation does not create the key, because a key created that way is readable from the stack forever. Create it by hand after deploying the stack, and rotate it the same way:

```bash
aws iam create-access-key --user-name tacocat-gallery-claude-code-cloud
```

### The credential, in the cloud environment

At [claude.ai/code](https://claude.ai/code), open an existing environment for editing, then **API credentials** > **Add credential**. Pick credential type **AWS SigV4**, set the allowed websites to `*.amazonaws.com` and `*.api.aws`, and paste the key pair. Anthropic's proxy then signs AWS requests after they leave the session, so the key never reaches the container: `AWS_ACCESS_KEY_ID` inside a session stays the placeholder string `proxy-injected`, and AWS still answers. That placeholder reaching AWS unchanged (`InvalidClientTokenId` from every service) is what a missing or misscoped credential looks like.

Two constraints worth knowing before you go looking for the button: API credentials are a Pro and Max plan feature, and the dialog for a _new_ environment does not offer them, only the editor for one that already exists. There is no edit, either -- to rotate, delete the credential and add it again. Failing all that, the key can go in the environment's plain environment variables instead, which are readable by anyone using the environment and by every command in the session.

No network configuration is needed: `*.amazonaws.com` and `*.api.aws` are already on the default **Trusted** allowlist.

### The setup script

Neither the SAM CLI nor the AWS CLI is in the image, and the usual SAM installer pulls release assets from the `aws/aws-sam-cli` GitHub repo, which the session's GitHub proxy refuses for any repo not attached to the session. PyPI works. Put this in the environment's **Setup script** field, where its result is cached in the filesystem snapshot, rather than in the session-start hook, which would pay for it on every session:

```bash
pip3 install --ignore-installed PyYAML --timeout 180 --retries 8 aws-sam-cli awscli
```

`--ignore-installed PyYAML` is needed because the image's PyYAML comes from apt and pip cannot uninstall it; the retries are for PyPI read timeouts, which are common enough to fail the script without them.

Node comes from [`.claude/hooks/session-start.sh`](../.claude/hooks/session-start.sh) instead, which runs every session and puts the version `.nvmrc` pins, plus the pinned esbuild, on `PATH` for `sam build`.

`sam local` is the one thing that will not work: the session's Docker daemon is not running, and a container could not reach the session's proxy or trust its CA anyway.
