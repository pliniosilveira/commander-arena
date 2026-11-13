# Contributing

Commander Arena is an unofficial, free Magic: The Gathering Commander game. Its rules engine follows the Comprehensive Rules and is careful never to guess: a card the engine does not fully understand is flagged as unsupported, never half-run. Contributions are welcome, within that rule.

## The easiest way to help: ask for a deck's support

Import your deck in the app. If some cards are unsupported, press **Ask for support on GitHub** on the coverage report: it opens an issue with your decklist, what blocks each card and the card data. Press Submit. Nothing else is needed.

Other issues are welcome too: a wrong rules result (say the cards, the steps and what the game did against what the Comprehensive Rules say), a bug in the app, or an idea.

## Code

1. Open an issue first for anything bigger than a small fix, so the work is not wasted.
2. Read `AGENTS.md`: it is the rulebook for this repository (the layout, the checks, the engine's purity and determinism rules, the documentation duties). It is written for coding agents and applies to people as well.
3. Needs Node 22 (`.nvmrc`) and the pnpm version pinned in `package.json`. Then `pnpm install`.
4. Write the failing test first for any rules change (the scenario tests in `packages/engine`). Run `pnpm format`, `pnpm typecheck`, `pnpm lint` and the tests of what you changed before you open the pull request.
5. Never add card-specific code to the engine, never add Wizards' text (the Comprehensive Rules file is not in this repository), and never invent card data.

Work on a branch of its own for the task (`fix-<topic>`, `feat-<topic>`): in this repository if you have write access, from a fork otherwise. Never push to `main`: it requires a pull request and a green `check`.

`.github/CODEOWNERS` lists what the owner must review before it is merged: the workflows, the scripts and configuration that the check runs, the instructions of the coding agents (`AGENTS.md`, `.claude/`) and the specification. A pull request is checked by the files of its own branch, so a change to any of those could make the check pass without testing anything, or change what an agent does. Everything else merges when `check` is green.

Pull requests from forks run the checks with a read-only token and no secrets.

## Card data and rules text

Card data comes from Scryfall. The Comprehensive Rules text belongs to Wizards of the Coast and is not distributed here: `pnpm rules:fetch` downloads it for your own use. See the Fan Content Policy notice in the README.
