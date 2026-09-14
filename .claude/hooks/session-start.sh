#!/usr/bin/env bash
# Prepare a Claude Code on the web session: select the Node version .nvmrc pins,
# install dependencies, and put the pinned esbuild on PATH for `sam build`.
#
# The Node version is the point. app/package.json sets engines.node to >=24 <25,
# and the cloud image ships an older Node. npm only warns about the engine
# mismatch and installs anyway, which does quiet damage: the npm bundled with
# Node 22 rewrites package-lock.json, stripping the `libc` fields that newer npm
# records for optional platform-specific packages, so an unrelated change
# arrives with a few dozen lines of lockfile churn. The Sharp layer needs the
# pinned Node for a second reason: its BuildMethod is nodejs24.x, so `sam build`
# shells out to whatever npm is on PATH to install linux-arm64 binaries.
#
# Registered as a SessionStart hook in .claude/settings.json. The timeout there
# has to stay comfortably above the worst cold-start total -- a cold image
# downloads a Node tarball before npm even starts -- so bump both together if
# the `done total=` line below creeps toward it.
#
# Each stage prints `[session-start] <step> elapsed=Ns`, and an ERR trap names
# the step on the way out, so a hang or a nonzero exit is visible in the session
# banner instead of silent.

set -eEuo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

script_start=$SECONDS
current_step="startup"
step_t0=$SECONDS
trap 'echo "[session-start] FAILED step=${current_step} elapsed=$((SECONDS - script_start))s exit=$?"' ERR

step_start() {
    current_step="$1"
    step_t0=$SECONDS
}

step_done() {
    echo "[session-start] ${current_step} elapsed=$((SECONDS - step_t0))s"
}

# A developer on their own machine manages their own Node; this is only for the
# cloud image, whose default is the one that cannot run the project.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
    echo "Not a remote session, leaving Node and dependencies alone."
    exit 0
fi

step_start "node-select"

# nvm installs itself somewhere different in every image, and it is a shell
# function rather than a binary, so it has to be sourced before it exists.
nvm_dir=""
for candidate in "${NVM_DIR:-}" /opt/nvm "$HOME/.nvm" /usr/local/nvm; do
    if [ -n "$candidate" ] && [ -s "$candidate/nvm.sh" ]; then
        nvm_dir="$candidate"
        break
    fi
done

node_bin=""
if [ -z "$nvm_dir" ]; then
    wanted_major="$(tr -d '[:space:]v' <.nvmrc)"
    actual_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
    echo "No nvm found, so the Node version is whatever the image provides:"
    echo "  node $(node --version), npm $(npm --version)"
    if [ "$actual_major" != "$wanted_major" ]; then
        echo ".nvmrc wants Node $wanted_major. Skipping npm install so this npm cannot rewrite package-lock.json."
        exit 0
    fi
else
    export NVM_DIR="$nvm_dir"
    # nvm.sh is not written to survive `set -u`, and returns non-zero on a
    # version it has not installed yet
    set +eu
    # shellcheck disable=SC1091 # sourced from the image at runtime
    . "$NVM_DIR/nvm.sh"
    # Reads .nvmrc, so the pinned version lives in one place
    nvm install
    nvm use
    set -eu

    node_bin="$(dirname "$(nvm which current)")"
fi

echo "Using node $(node --version), npm $(npm --version)"
step_done

# install rather than ci: the container image is cached after this hook, and
# install can reuse what is already unpacked there. Every npm script in this
# project runs from app/, so the install does too.
step_start "npm-install"
(cd app && npm install --no-audit --no-fund)
step_done

# A hook runs in its own shell, so the PATH it sets is gone by the time the
# session starts. CLAUDE_ENV_FILE is what carries it across. app/node_modules/.bin
# is on it because `sam build` resolves esbuild through PATH rather than through
# each CodeUri's node_modules, so without this the build silently uses whatever
# esbuild the image happens to have instead of the pinned one.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    {
        if [ -n "$node_bin" ]; then
            echo "export NVM_DIR=\"$NVM_DIR\""
            echo "export PATH=\"$node_bin:\$PATH\""
        fi
        echo "export PATH=\"$PWD/app/node_modules/.bin:\$PATH\""
    } >>"$CLAUDE_ENV_FILE"
fi

echo "[session-start] done total=$((SECONDS - script_start))s"
echo "Session ready: npm test, npm run lint and npm run compile should all work."

# The AWS tools are not in the image and are too slow to install per session, so
# they come from the cloud environment's setup script, whose result is cached in
# the filesystem snapshot. Say so here rather than letting `sam deploy` fail later.
if ! command -v sam >/dev/null || ! command -v aws >/dev/null; then
    echo
    echo "NOTE: sam and/or aws are missing, so deploys and logs will not work."
    echo "      See 'Claude Code on the web' in infra/README.md for the setup script."
fi
