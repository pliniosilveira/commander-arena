# Corpus and coverage tooling: how to run it

Purpose: measure how much of the format the parser supports and rank what to teach it next (SPEC 7.3 and A21, D-057, `docs/design/scaling-card-support.md`). The real run needs Scryfall's bulk host, which the cloud sessions cannot reach, so the owner runs it locally and commits the reports; the numbers live in `reports/`, never in prose. The tests of the tool run offline against a SYNTHETIC corpus.

## Run it (local machine, Node 22, after `pnpm install`)

First run, one command (downloads, analyses, writes everything, records the first baseline):

```sh
pnpm coverage:cards --download --update-baseline
```

What the download does: `GET https://api.scryfall.com/bulk-data` (with `Accept: application/json` and a `User-Agent` naming this project), picks the `oracle_cards` entry and streams its `jsonl_download_uri` to `.cache/corpus/oracle_cards-<updated_at>.jsonl.gz` (gitignored). The file is gzipped JSON Lines, about 25 MB compressed (D-048). A second `--download` for the same `updated_at` reuses the cached file.

Later runs on a file you already have, no network:

```sh
pnpm coverage:cards --file .cache/corpus/oracle_cards-<updated_at>.jsonl.gz
pnpm corpus:templates --file .cache/corpus/oracle_cards-<updated_at>.jsonl.gz   # backlog only
pnpm coverage:cards --file <file> --check             # compare with the baseline, write nothing
pnpm coverage:cards --file <file> --update-baseline   # also rewrite the baseline
```

`--file` takes gzipped JSON Lines (`.jsonl.gz`), plain JSON Lines (`.jsonl`) or a JSON array (`.json`); the form is recognised from the content. Other options: `--all` (keep every card, not only Commander-legal ones), `--out <dir>` (default `reports/`), `--cache-dir <dir>`, `--max-templates <n>` (templates kept in `templates.json`, default 1000), `--help`.

Expected cost: reading is a stream, so memory does not grow with the file; about 0.6 ms per card for the import was measured on a 30,000-card SYNTHETIC file, so expect on the order of 30 seconds to a minute and a few hundred MB of memory for the real file (an estimate, not yet measured on real data).

Exit codes: 0 done; 1 `--check` found a drop; 2 bad arguments, unreadable input or no baseline.

## Replaying templates.json offline (`pnpm corpus:replay`)

`pnpm coverage:cards` needs Scryfall's bulk file, which the cloud sessions cannot reach. `reports/templates.json` (the owner's run) keeps the 1,000 heaviest unparsed shapes, each with one real Oracle example line. `pnpm corpus:replay` runs the current parser over those example lines and writes `reports/template-replay.md`, so the next grammar work can be chosen without a new bulk file. It needs no network and reads no card data other than `templates.json`.

```sh
pnpm corpus:replay                                   # reports/templates.json -> reports/template-replay.md
pnpm corpus:replay --file <templates.json> --out <report.md>
```

How it classifies a line (`tools/corpus/replay.ts`): the example is parsed with `parseFaceText`, the converter's own entry, as the only ability of a SYNTHETIC face. The result is `read` (the grammar reads it and the lowering needs no feature that `SUPPORTED_FEATURES` lacks), `notRunnable` (read, but the missing engine features are listed), `unboundReference` (read, but a pronoun had nothing to mean) or `unrecognised` (no rule reads it; the report gives the closest rule and where reading stopped). The real card type is not known, so it is not guessed: the line is tried in a creature, an Equipment, an Aura, a Vehicle and an instant face (the faces that Equip, "equipped", "enchanted", Crew and spell text need) and counts as read when any of them reads it. Card-level checks (layout, printed values, `validateCard`) are excluded by construction.

The report is an ability-level ESTIMATE, not card coverage: a card needs all its abilities read, and the cards of two shapes overlap, so the summed weights and cards are not card counts. It is deterministic (no timestamps; the header repeats the `source` and `parserVersion` of `templates.json` and the current `PARSER_VERSION`). Regenerate it after the grammar or `SUPPORTED_FEATURES` changes. After the first line it lists the top 150 unread shapes by weight, then groups the unread ones by closest rule and by missing feature: the work order.

## Per-deck coverage (`pnpm corpus:decks`)

M9 asks for at least two precons built only from supported cards. This command says, for each decklist you give it, how much of the deck the engine fully supports, which cards block it and what it would take to fix them. It reads the bulk file like the other commands (no network) and needs real decklists, which the owner supplies (the five precons in `decks/` so far).

```sh
pnpm corpus:decks --file .cache/corpus/oracle_cards-<updated_at>.jsonl.gz --deck decks/<name>.txt --deck decks/<other>.txt
pnpm corpus:decks --file <file> --deck decks/            # a folder stands for its .txt files
pnpm corpus:decks --file <file> --deck <decklist> --out <report.md>
```

Options: `--file` (required; `.jsonl.gz`, `.jsonl` or a `.json` array, as everywhere), `--deck` (required, repeatable: a decklist file or a folder of `.txt` files), `--out <file>` (the report FILE, default `reports/decks.md`). It never downloads and takes none of the other options. Exit codes: 0 done (also when a deck is not fully supported: that is the report, not a failure); 2 bad arguments, an unreadable decklist or bulk file, two decks with the same name, or a bulk file with no readable card.

Supplying decklists: put one export per deck in a `decks/` folder at the repository root, one `.txt` file each; the file name (without the extension) is the deck's name in the report. Arena, MTGO, Moxfield and Archidekt text exports work (the decklist parser of `packages/cards`, with quantities and the Commander section; see `decks/README.md`). Copy the list from the source site, never retype it from memory.

How it works (`tools/corpus/decks.ts`): only the commander and main deck count (sideboard, maybeboard and companion lines are reported as not counted). Names are matched as deck import matches them: case, quotes and dashes normalised, a double-faced or split card found by its front-face name or its full name (D-048). Every card then goes through the same `importCard` that `pnpm coverage:cards` uses; the status and the reasons are the pipeline's, nothing is re-implemented. A card the bulk file does not have under that name is listed as UNRESOLVED and counts as not supported; it is never guessed. A card is blocked by its unparsed ability shapes (normalised as in `reports/backlog.md`: numbers as N, mana costs as {M}) and by its other reasons (layout, card type, printed values, validation).

The stdout summary has one line per deck. The Markdown report is deterministic (decks sorted by name, no timestamp; the header repeats the bulk file name and the parser version) and holds:

- A table of the decks: cards by quantity and unique, supported cards and share both ways, FULLY SUPPORTED (every card supported, basic lands and the commander included, every name resolved, every line read) and the commander line.
- The blockers across the decks, ranked by the distinct cards of these decks each one blocks: the cheapest next engine slice to unlock a deck comes first. "Solo" counts the cards whose only blocker is that row (learning it makes them supported) and names them per deck; "What it takes" is the pipeline's diagnosis (the closest grammar rule, or the engine features missing when the text is read but not runnable).
- Per deck: the status and shares, the commander, how many blockers clear the deck, the lines that could not be read, the UNRESOLVED names and the unsupported cards, each with its blockers and the number of other decks of the run that have a card with the same blocker.

## Precon snapshots (`pnpm precon:snapshot`)

The web app plays only real precons (D-137), and a precon is a decklist of `decks/` plus a snapshot of the card data of its cards, so "Quick start" works offline (SPEC 6.2, 15 M9; A16 allows committing precon snapshots; card images still load from Scryfall). The sandbox cannot reach Scryfall, so the owner generates a snapshot from the bulk file already on their machine:

```sh
pnpm precon:snapshot --file .cache/corpus/oracle_cards-<updated_at>.jsonl.gz --deck decks/<name>.txt --id <id> --name "<display name>" --blurb "<one sentence>"
```

It writes `apps/web/src/precons/snapshots/<id>.json` (`--out <dir>` changes the folder) and commits nothing: review the file and commit it. The file holds the id, the name, the blurb, the bulk file's base name (`source`), the decklist text exactly as given and the stored cards of the list in the format of the import cache (`StoredCard`, SPEC 6.2: faces, image URIs, color identity, Commander legality and so on, but no `fetchedAt` and no whole Scryfall objects). It is deterministic: fixed key order, cards sorted by name, no timestamp, so the same inputs give the same bytes and a refresh shows up as a clean diff.

Names are matched as `pnpm corpus:decks` matches them (the same code): case, quotes and dashes normalised, a double-faced or split card found by its front-face name. A name no card of the file matches, or a decklist line the parser cannot read, is listed and the command exits 1 without writing anything. Exit 2 is a usage, file or empty-deck error. A card the engine cannot fully run, or a deck that breaks the Commander rules, is only a warning here: the web app refuses to start such a precon, and a test over the shipped snapshots fails until the list is fixed.

Without any snapshot the menu says "No precon is installed yet" and Start is disabled. The generated snapshot of the Zombies deck (`--id zombies`) is what the web app's sample deck and its menu entry come from.

## The golden corpus (`pnpm corpus:extract`)

`packages/cards/test/fixtures/corpus/golden.jsonl` holds real cards, one JSON object per line (name, oracle id, faces with mana cost, type line and Oracle text, source), and `golden.expected.json` what the parser does with each (D-066). CI runs it without network access. It starts with the text already in the repository: the engine's real-card fixtures (hand-written from Oracle text, `source` says so, no oracle id) and the Korvold request. To add real cards, put their names in a text file (one per line, `#` for comments) and run, where Scryfall's bulk file is available:

```sh
pnpm corpus:extract --file .cache/corpus/oracle_cards-<updated_at>.jsonl.gz --names <names file>
pnpm corpus:extract --file <file> --names deck.txt --acceptance   # the cards of your own deck
UPDATE_GOLDEN=1 pnpm exec vitest run packages/cards/test/golden.test.ts   # then review the diff of golden.expected.json
```

A card already in the file (same oracle id) is replaced by the fresh data; names not found in the bulk file are listed and the exit code is 1. Cards are split 75/25 into training and hold-out by the last hex digit of the oracle id (`0` to `b`, `c` to `f`); acceptance cards are outside the split. The test prints training and hold-out coverage; a hold-out share more than 5 points under training means rules are being written to examples, so widen rules instead of adding them.


### Cards from a support issue (`pnpm corpus:from-issue`)

A support issue opened with the import screen's "Ask for support on GitHub" button carries the deck's unsupported cards as golden records, as the player's browser received them from Scryfall, in a collapsed "Card data for the golden corpus" block (gzip, base64url; D-245). Save the issue's description to a file and run:

```bash
pnpm corpus:from-issue --body issue-144.md --issue 144
UPDATE_GOLDEN=1 pnpm exec vitest run packages/cards/test/golden.test.ts   # then review the diff of golden.expected.json
```

The cards are added as acceptance cards (a card already in the file, same oracle id, is replaced), with the source "app import (Scryfall API), issue #144". No bulk file and no network are needed, so a cloud session can do it from the issue alone.

## What each report says

All files are written to `reports/`, are deterministic (two runs over the same file are identical) and carry no timestamps; the first line says which file, how many cards and which parser version.

- `reports/coverage.md`: the supported count and share of all Commander-legal cards, of the top 500 and of the top 1,000 by `edhrecRank` (cards without a rank are excluded from those two rows, and the report says how many); the unsupported cards by reason (unparsed abilities, layout, card type, `*` power or toughness, fixture mismatch, other); the 20 most common failure shapes; where parsing stopped; the malformed lines skipped.
- `reports/backlog.md`: the ranked work order. Each unparsed ability is normalised to a shape (numbers as N, mana costs as {M}); a shape's weight is the sum of `1 / edhrecRank` over the distinct cards it blocks (a card without a rank weighs 0.00001, the weight of rank 100,000). Each entry shows the cards blocked, the weight, one example text and the first ten card names, most popular first. The first section lists the shapes that are the only blocker of some cards (no other unparsed ability, no other reason): learning that one shape makes those cards supported, so those are the ones worth doing first.
- `reports/templates.json`: the same ranking for tools (`template`, `cards`, `weight`, `abilities`, `example`, `topCards`, `soloCards`, `soloWeight`), capped at `--max-templates`.
- `reports/coverage-baseline.json`: the supported counts (all, top 500, top 1,000) and the population sizes. `--check` exits 1 when a supported count is below the baseline. It compares counts, not percentages, because a newer bulk file adds cards and lowers a percentage without any regression. When the run reads the same bulk file as the baseline (the same `source`, the file's base name), all three counts must not drop. When the bulk file differs, only the `all` count can fail the check: the top 500 and top 1,000 are chosen by EDHREC rank, which changes between bulk files, so a drop there is printed as a `WARNING` that names both files and asks you to refresh the baseline (`--update-baseline`), and the exit code stays 0. The daily CI run (D-090) downloads a fresh bulk file, so it normally runs in this second mode.

## Pasting the results back

Commit the files in `reports/` (they are small, text only; the name lists are capped) on the milestone branch, or, if you prefer not to commit, paste into the chat:

1. The "Supported share" and "Why cards are unsupported" parts of `reports/coverage.md`.
2. The first 15 entries of both sections of `reports/backlog.md`.
3. The `Generated from ...` line of each file, so the data's age is known.

The bulk file itself stays in `.cache/` and is never committed. After each slice of M5, rerun `pnpm coverage:cards --file <same file> --check` and then `--update-baseline`: progress is the change in those numbers.

## Notes for developers

- The scripts run under plain `node` (`node tools/corpus/cli.ts`). The packages are written for a bundler, so `tools/corpus/register.ts` installs a small resolution hook first (see `docs/ARCHITECTURE.md`, "Corpus and coverage tooling"). Tests run through Vitest and the synthetic fixture is written to a temporary directory in the test (`tools/corpus/synthetic.ts`; its ability texts use invented words so no grammar rule can ever read them).
- `pnpm exec vitest run tools/corpus` runs the tests, including one that starts the real entry point in a child process.
