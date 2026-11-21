# Challenge snapshots

One `<id>.json` per challenge opponent the app offers on the Easy list of the Challenges block. Same format and loader as the precon snapshots (`../snapshots/`), kept apart so a challenge never shows up in the precon lists. Never edit them by hand: the owner generates each with

```sh
pnpm precon:snapshot --file .cache/corpus/oracle_cards-<updated_at>.jsonl.gz --deck decks/<name>.txt --id <id> --name "<display name>" --blurb "<one sentence>" --out apps/web/src/precons/challenges
```

and commits the result. The app lists exactly the files here and shows "No challenge is installed yet" when the folder holds none.

The Medium level adds emblems the opponent owns from the start of the game; they live in `medium.ts`, by challenge id, written as engine AST. A challenge with no entry there is not offered in Medium.
