#!/usr/bin/env bash
# Rank open `deck-support:ready` issues by unsupported-card count (fewest first).
# Cards already supported on main are not counted.
# Read-only: lists issues from the public GitHub API, comments on nothing.
set -euo pipefail
repo="${1:-pliniosilveira/commander-arena}"
page=1
all='[]'
while :; do
  chunk=$(curl -sf "https://api.github.com/repos/$repo/issues?state=open&labels=deck-support:ready&per_page=100&page=$page")
  [ "$(jq length <<<"$chunk")" -eq 0 ] && break
  all=$(jq -s 'add' <(echo "$all") <(echo "$chunk"))
  page=$((page + 1))
done
# Cards the engine supports today (golden corpus on main). The issue text is a snapshot from
# the day it was written, so a card supported since then must not count as unsupported.
supported=$(curl -sf "https://raw.githubusercontent.com/$repo/main/packages/cards/test/fixtures/corpus/golden.expected.json" \
  | jq -c '[.cards[] | select(.status == "supported") | .name]')
jq -r --argjson sup "$supported" '
  map(select(.pull_request | not))
  | map(
      ((.body // "") | capture("Unsupported cards \\([0-9]+\\): (?<l>[^\n]*)").l? // null) as $line
      | ($line | if . == null then null else split("; ") | map(select(length > 0)) end) as $cards
      | {
          n: .number,
          title: (.title | sub("^deck support "; "")),
          date: .created_at[0:10],
          listed: ($cards | if . == null then null else length end),
          count: ($cards | if . == null then 99999 else map(select(. as $c | $sup | index($c) | not)) | length end)
        })
  | sort_by(.count, .n)
  | (["unsupported\tlisted\tissue\tcreated\tdeck"]
     + map([(if .count == 99999 then "?" else (.count | tostring) end), (.listed // "?" | tostring), "#\(.n)", .date, .title] | @tsv))
  | .[]' <<<"$all"
