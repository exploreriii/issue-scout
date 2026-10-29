#!/usr/bin/env bash
# Records a snapshot of open good-first-issue and help-wanted issues for every
# enabled org in orgs.json, mapped to the RawIssue shape from ARCHITECTURE.md
# section 3. Requires an authenticated `gh` CLI and `jq`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORGS_FILE="$ROOT/orgs.json"
OUT="$ROOT/packages/core/test/fixtures/issues.snapshot.json"
MAX_PAGES=3
MAX_TOTAL=60

QUERY='query($q: String!, $cursor: String) {
  search(query: $q, type: ISSUE, first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on Issue {
        id number title body url createdAt updatedAt
        assignees { totalCount }
        comments { totalCount }
        labels(first: 20) { nodes { name } }
        repository {
          name
          primaryLanguage { name }
          repositoryTopics(first: 10) { nodes { topic { name } } }
        }
      }
    }
  }
}'

# Newline-delimited RawIssue objects accumulated across all searches.
NDJSON=""

# fetch_search <org> <search-string>
# Pages through up to MAX_PAGES results and appends mapped RawIssue objects.
fetch_search() {
  local org="$1" search="$2" cursor="" page resp
  for (( page = 1; page <= MAX_PAGES; page++ )); do
    if [[ -n "$cursor" ]]; then
      resp=$(gh api graphql -f query="$QUERY" -f q="$search" -f cursor="$cursor")
    else
      resp=$(gh api graphql -f query="$QUERY" -f q="$search")
    fi

    local mapped
    mapped=$(jq -c --arg org "$org" '
      .data.search.nodes[]
      | select(.id != null)
      | {
          id: .id,
          org: $org,
          repo: .repository.name,
          number: .number,
          title: .title,
          body: ((.body // "")[0:2000]),
          url: .url,
          labels: [.labels.nodes[].name],
          assignees: .assignees.totalCount,
          comments: .comments.totalCount,
          createdAt: .createdAt,
          updatedAt: .updatedAt,
          repoLanguage: .repository.primaryLanguage.name,
          repoTopics: [.repository.repositoryTopics.nodes[].topic.name],
          repoLastMergedPrAt: null
        }
      | if .repoLanguage == null then del(.repoLanguage) else . end
    ' <<<"$resp")
    if [[ -n "$mapped" ]]; then
      NDJSON+="$mapped"$'\n'
    fi

    if [[ "$(jq -r '.data.search.pageInfo.hasNextPage' <<<"$resp")" != "true" ]]; then
      break
    fi
    cursor=$(jq -r '.data.search.pageInfo.endCursor' <<<"$resp")
  done
}

ORG_LOGINS=$(jq -r '.[] | select(.enabled) | .login' "$ORGS_FILE")
ORG_JSON=$(jq -c '[.[] | select(.enabled) | .login]' "$ORGS_FILE")

for org in $ORG_LOGINS; do
  fetch_search "$org" "org:$org is:issue is:open label:\"good first issue\""
  fetch_search "$org" "org:$org is:issue is:open label:\"help wanted\""
done

RECORDED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Dedupe by id, prefer unassigned, then most recently updated; keep MAX_TOTAL.
printf '%s' "$NDJSON" | jq -s \
  --arg recordedAt "$RECORDED_AT" \
  --argjson orgs "$ORG_JSON" \
  --argjson max "$MAX_TOTAL" '
    unique_by(.id)
    | sort_by(.updatedAt) | reverse
    | sort_by(.assignees > 0)
    | .[0:$max]
    | { recordedAt: $recordedAt, orgs: $orgs, issues: . }
  ' > "$OUT"

echo "Wrote $(jq '.issues | length' "$OUT") issues to $OUT" >&2
