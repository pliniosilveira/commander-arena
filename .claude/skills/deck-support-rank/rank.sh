#!/usr/bin/env bash
# Rank open `deck-support:ready` issues by unsupported-card count (fewest first).
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
jq -r '
  map(select(.pull_request | not))
  | map({
      n: .number,
      title: (.title | sub("^deck support "; "")),
      date: .created_at[0:10],
      count: ((.body // "") | capture("Unsupported cards \\((?<c>[0-9]+)\\)").c? | tonumber? // 99999)
    })
  | sort_by(.count, .n)
  | (["unsupported\tissue\tcreated\tdeck"]
     + map([(if .count == 99999 then "?" else (.count | tostring) end), "#\(.n)", .date, .title] | @tsv))
  | .[]' <<<"$all"
