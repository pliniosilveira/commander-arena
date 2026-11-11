# Decklists for `pnpm corpus:decks`

This folder is for real decklists that the owner supplies (today: `angels`, `artifacts`, `dinosaurs`, `dragons` and `zombies`). None may be written from memory or invented: copy each list from the site or tool that exports it.

## Layout

One text file per deck, for example `decks/<precon-name>.txt`. The file name without the extension is the deck's name in the report. Arena, MTGO, Moxfield and Archidekt text exports are read, with quantities and the Commander section (see `docs/CORPUS.md`, "Per-deck coverage"). Only the commander and the main deck count; sideboard, maybeboard and companion lines are listed as not counted.

## Run

```sh
pnpm corpus:decks --file .cache/corpus/oracle_cards-<updated_at>.jsonl.gz --deck decks/
```

The report goes to `reports/decks.md`. It needs Scryfall's `oracle_cards` bulk file (the owner has it from `pnpm coverage:cards --download`) and no network.

## Precons of the app

A deck that the app should offer to play needs a snapshot of its card data too, made from the same list and the same bulk file (D-137):

```sh
pnpm precon:snapshot --file .cache/corpus/oracle_cards-<updated_at>.jsonl.gz --deck decks/<name>.txt --id <id> --name "<display name>" --blurb "<one sentence>"
```

The snapshot goes to `apps/web/src/precons/snapshots/<id>.json`, and the owner commits it with the list. Only a deck that `pnpm corpus:decks` reports FULLY SUPPORTED can be started in the app. See `docs/CORPUS.md`, "Precon snapshots".
