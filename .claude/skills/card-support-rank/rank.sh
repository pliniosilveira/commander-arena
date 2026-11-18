#!/usr/bin/env bash
# Rank the unsupported cards that repeat across open `deck-support:ready` issues
# (most decks first). Read-only: reads the public GitHub API, changes nothing.
# Usage: rank.sh [owner/repo] [top-N]   (top-N default 40, 0 = all)
set -euo pipefail
repo="${1:-pliniosilveira/commander-arena}"
top="${2:-40}"
page=1
all='[]'
while :; do
  chunk=$(curl -sf "https://api.github.com/repos/$repo/issues?state=open&labels=deck-support:ready&per_page=100&page=$page")
  [ "$(jq length <<<"$chunk")" -eq 0 ] && break
  all=$(jq -s 'add' <(echo "$all") <(echo "$chunk"))
  page=$((page + 1))
done
jq -r --argjson top "$top" '
  map(select(.pull_request | not))
  | map(. as $i
      | ($i.body // "") as $b
      | ($b | capture("Unsupported cards \\([0-9]+\\): (?<l>[^\n]*)").l? // "") as $line
      | {n: $i.number, cards: ($line | split("; ") | map(select(length > 0)))})
  | (map(.n) | length) as $issues
  | map(. as $r | $r.cards[] | {card: ., n: $r.n})
  | group_by(.card)
  | map({card: .[0].card, decks: length, issues: (map("#\(.n)") | join(" "))})
  | sort_by(-.decks, .card)
  | (if $top > 0 then .[:$top] else . end) as $rows
  | "# \($issues) ready issues, \(length) distinct unsupported cards",
    "decks\tcard\tissues",
    ($rows[] | "\(.decks)\t\(.card)\t\(.issues)")' <<<"$all"
