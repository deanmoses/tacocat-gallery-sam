#!/usr/bin/env sh
# Syntax-checks the inline CloudFront Function code in template.yaml.
#
# Nothing else parses it: cfn-lint, `sam build` and the changeset dry-run all
# treat FunctionCode as an opaque string, so a syntax error only surfaces when
# CloudFront publishes the function partway through a real deploy.
#
# Each FunctionCode block scalar is extracted to a temp file and run through
# `node --check`. Errors are reported against template.yaml line numbers.
#
# This catches syntax errors only. The cloudfront-js-2.0 runtime is a subset
# of what node accepts (no for...of, for one); those errors still surface only
# at publish time, or via `aws cloudfront test-function` against a deployed stage.
set -eu

DIR=$(cd "$(dirname "$0")/.." && pwd)
TEMPLATE="$DIR/template.yaml"

TMPD=$(mktemp -d)
trap 'rm -rf "$TMPD"' EXIT

# A literal block scalar (`FunctionCode: |`, `|+2`, `|-` ...): everything
# indented deeper than the key, dedented by the indentation of its first
# content line. The .offset file records the key's line so a node error,
# which numbers lines within the extracted file, maps back to the template.
awk -v out="$TMPD/function-" '
    /^[ ]*FunctionCode:[ ]*\|[-+0-9]*[ ]*$/ {
        match($0, /^ */); key = RLENGTH
        incode = 1; content = -1; n += 1; f = out n ".js"
        print NR > (out n ".offset")
        next
    }
    incode {
        if ($0 ~ /^[ \t]*$/) { print "" > f; next }
        match($0, /^ */); ind = RLENGTH
        if (ind <= key) { incode = 0; next }
        if (content < 0) content = ind
        print substr($0, content + 1) > f
        next
    }
' "$TEMPLATE"

count=0
rc=0
for f in "$TMPD"/function-*.js; do
    [ -e "$f" ] || continue
    count=$((count + 1))
    if err=$(node --check "$f" 2>&1); then
        continue
    fi
    rc=1
    offset=$(cat "${f%.js}.offset")
    # Rewrite "<tmpfile>:<n>" into a template.yaml line. Match on the basename:
    # macOS hands mktemp a /var path and node echoes it back via /private/var.
    echo "$err" | awk -v base="$(basename "$f")" -v off="$offset" '
        index($0, base ":") > 0 {
            n = split($0, parts, ":")
            print "template.yaml:" (off + parts[n]) " (inline CloudFront Function)"
            next
        }
        { print }
    '
done

if [ "$count" -eq 0 ]; then
    echo "No inline CloudFront Function code found in template.yaml" >&2
    exit 1
fi
if [ "$rc" -eq 0 ]; then
    echo "OK: $count inline CloudFront Function(s) parse"
fi
exit "$rc"
