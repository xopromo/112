#!/bin/bash
# Web search via GitHub Actions
# Usage: bash agent/gh_search.sh "query"
# Returns: JSON with search results to stdout
# Requires: GITHUB_TOKEN env var OR /home/user/.github_token file

set -euo pipefail

QUERY="${1:-}"
if [ -z "$QUERY" ]; then
    echo '{"error": "Usage: gh_search.sh <query>"}' >&2
    exit 1
fi

REPO="xopromo/112"
TOKEN_FILE="/home/user/.github_token"
TOKEN="${GITHUB_TOKEN:-$(cat "$TOKEN_FILE" 2>/dev/null || echo '')}"

if [ -z "$TOKEN" ]; then
    echo '{"error": "No GitHub token. Set GITHUB_TOKEN or put token in /home/user/.github_token"}' >&2
    exit 1
fi

API="https://api.github.com"
AUTH_H="Authorization: token $TOKEN"
ACCEPT_H="Accept: application/vnd.github.v3+json"

log() { echo "[gh_search] $*" >&2; }

# Trigger workflow
log "Triggering search workflow for: $QUERY"
BEFORE=$(python3 -c "from datetime import datetime, timezone, timedelta; print((datetime.now(timezone.utc) - timedelta(seconds=5)).strftime('%Y-%m-%dT%H:%M:%SZ'))")

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "$AUTH_H" -H "$ACCEPT_H" -H "Content-Type: application/json" \
    "$API/repos/$REPO/actions/workflows/search.yml/dispatches" \
    -d "{\"ref\":\"main\",\"inputs\":{\"query\":$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$QUERY")}}")

if [ "$HTTP_STATUS" != "204" ]; then
    log "Failed to trigger workflow: HTTP $HTTP_STATUS"
    echo "{\"error\": \"Failed to trigger workflow (HTTP $HTTP_STATUS)\"}"
    exit 1
fi

# Find the run ID (poll up to 30s)
log "Waiting for run to appear..."
RUN_ID=""
for i in $(seq 1 10); do
    sleep 3
    RUN_ID=$(curl -s -H "$AUTH_H" -H "$ACCEPT_H" \
        "$API/repos/$REPO/actions/workflows/search.yml/runs?event=workflow_dispatch&per_page=5" | \
        python3 -c "
import json, sys
d = json.load(sys.stdin)
before = '$BEFORE'
for r in d.get('workflow_runs', []):
    if r.get('created_at', '') >= before:
        print(r['id'])
        break
" 2>/dev/null)
    [ -n "$RUN_ID" ] && break
done

if [ -z "$RUN_ID" ]; then
    log "Could not find workflow run"
    echo '{"error": "Could not find workflow run after 30s"}'
    exit 1
fi
log "Run ID: $RUN_ID"

# Wait for completion (max 2 min)
for i in $(seq 1 24); do
    sleep 5
    STATUS=$(curl -s -H "$AUTH_H" -H "$ACCEPT_H" \
        "$API/repos/$REPO/actions/runs/$RUN_ID" | \
        python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))")
    log "Status: $STATUS"
    [ "$STATUS" = "completed" ] && break
done

if [ "$STATUS" != "completed" ]; then
    echo '{"error": "Workflow did not complete in time"}'
    exit 1
fi

# Download artifact
log "Downloading results..."
ARTIFACT_URL=$(curl -s -H "$AUTH_H" -H "$ACCEPT_H" \
    "$API/repos/$REPO/actions/runs/$RUN_ID/artifacts" | \
    python3 -c "
import json,sys
d = json.load(sys.stdin)
arts = d.get('artifacts', [])
if arts:
    print(arts[0]['archive_download_url'])
" 2>/dev/null)

if [ -z "$ARTIFACT_URL" ]; then
    echo '{"error": "No artifacts found in completed run"}'
    exit 1
fi

TMP=$(mktemp)
curl -s -L -H "$AUTH_H" -H "$ACCEPT_H" "$ARTIFACT_URL" -o "${TMP}.zip"
unzip -p "${TMP}.zip" results.json
rm -f "${TMP}" "${TMP}.zip"
