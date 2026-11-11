# Precon snapshots

One `<id>.json` per precon the app offers (D-137). Never edit them by hand: the owner generates each with

```sh
pnpm precon:snapshot --file .cache/corpus/oracle_cards-<updated_at>.jsonl.gz --deck decks/<name>.txt --id <id> --name "<display name>" --blurb "<one sentence>"
```

and commits the result (`docs/CORPUS.md`, "Precon snapshots"). The app lists exactly the files here, starts a precon only when it is a valid Commander deck of fully supported cards, and shows "No precon is installed yet" when this folder holds no snapshot.
