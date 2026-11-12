# Commander Arena

An unofficial, free, in-browser Magic: The Gathering Commander game: one human against an AI opponent, driven by a rules engine that follows the Comprehensive Rules and tells you up front when it cannot run a card correctly.

## Status

Playable and still growing. You can play a full two-player Commander game against an AI in the browser, from **Quick start** with one of the precons in the menu, whose card data ships with the app so it starts without a connection (card images load from Scryfall). Only decks that follow the Commander rules and use cards the engine fully supports can be played. The decks you save in the browser can be picked for either seat, and the precons can be edited on the "Your decks" page (your version stays in this browser; "Reset to default" brings the shipped list back). The start screen shows the app build, engine and card parser versions at the bottom. You can also import your own Commander list (Moxfield, Archidekt, Arena or MTGO text): cards are looked up on Scryfall (it needs a connection), checked against the Commander rules, and a coverage report says which cards the engine can run and why it cannot run the others.

What exists: a rules engine for two-player Commander (the stack, turn structure and combat, triggered, activated and static abilities, layers, replacement and prevention effects, tokens, copies, the common keywords, split, Adventure, double-faced and Saga cards, state-based actions, commander tax and damage), an Oracle text parser that turns card text into engine definitions, an AI opponent that looks ahead (`HeuristicAgent`) and a casual AI kept for tests, and the web app: board, hand, card preview, stack with arrows, game log, targeting, attack and block, an auto-pass policy so you only click when there is a real decision (it always stops to show you the opponent's spell before it resolves, which Settings can turn off), and dialogs for every decision the engine can ask. What does not exist yet: a search-based AI beyond one turn, card animation beyond combat damage and deaths, and multiplayer (see `docs/ROADMAP.md`).

Where to look next:

- `docs/STATUS.md`: current milestone, what is done, blockers and next steps.
- `docs/SPEC.md`: the current specification, the required tests and the milestone status.
- `docs/ARCHITECTURE.md`: what is built and what is planned, kept apart.
- `docs/ROADMAP.md`: deferred work and known limitations.

## Quick start

You need Node 22 (see `.nvmrc`) and pnpm (the version is pinned by `packageManager` in `package.json`).

```sh
git clone https://github.com/pliniosilveira/commander-arena.git
cd commander-arena
pnpm install
pnpm dev
```

`pnpm dev` starts the Vite dev server; open the address it prints, pick a precon for each seat under Quick start, and press Start game (the menu says so when no precon is installed yet). The opponent has one level: it plans blocks and attacks by looking ahead. Click or drag cards to play them, Ctrl+Z takes back a small action (a land tapped for mana, with its mana unspent, untaps when clicked again), Space passes or confirms (the button names the step it moves to, such as To Declare Blockers), P passes the turn (in your main phases: skips combat and the other steps up to the opponent's turn, stopping for a question or an opponent spell aimed at you or that you can answer; Esc cancels it, Full Control keeps its stops), right-click pins the card preview, F toggles Full Control. The battlefield has a column on each side: the card preview and the log on the left; the stack at the top of the right column and the action buttons (the prompt, the pass button, Undo, Full Control, Manual mana) at its bottom, so the buttons stay in place whatever the stack holds (below 1100px wide the two are one drawer). While the opponent takes a long time to decide, a quiet "Opponent is thinking" line shows above the prompt after about 0.4 s and goes when it has moved; the buttons do not move. Settings, at the foot of the right column, holds the stops, the theme, Text size (Large or Normal), which side the stack and the buttons are on (Right or Left) and Concede game. In combat a blocked attacker and each of its blockers carry the same number and colour, with an arrow from each blocker to its attacker; while you choose blockers the panel "Damage getting through" shows what each defender would take, and dividing combat damage is a panel beside the board that shows each creature's card. Combat is animated slowly enough to follow: attackers lunge at what they hit, the recipient bursts, shakes and shows a big damage number, life gained, lost and poison show their own numbers, and a creature that dies cracks and dissolves (Settings: "Combat animations" on or off, "Animation speed" Fast, Normal or Slow; all off when your system asks for reduced motion). While the effects play, the automatic passes wait for them, for at most 2.5 s, and a click takes priority at once. A deck you import is saved and then picked as "Your deck" on the menu. To run every check:

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

The browser smoke tests need Chromium: `pnpm --filter @commander-arena/web exec playwright install chromium`, then `pnpm e2e`.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm install` | Install dependencies. |
| `pnpm dev` | Start the Vite dev server for the web app. |
| `pnpm e2e` | Browser tests (Playwright, Chromium needed). |
| `pnpm test:soak` | The AI soak tests with 100 games each. |
| `pnpm coverage:cards` and the `corpus:*` scripts | Card coverage over Scryfall's bulk file, the template backlog, the per-deck report (owner-run, `docs/CORPUS.md`). |
| `pnpm precon:snapshot` | Write the card-data snapshot of a precon (owner-run, `docs/CORPUS.md`). |
| `pnpm typecheck` | Type-check every package, the web app and `tools`. |
| `pnpm lint` | Biome, then the package-boundary rules (dependency-cruiser). |
| `pnpm test` | Run all Vitest projects. |
| `pnpm build` | Build packages and apps. |
| `pnpm format` | Format and apply safe fixes with Biome. |
| `pnpm rule <number>` | Print a Comprehensive Rules entry from `docs/rules/`. |
| `pnpm rule --search <text>` | Search the rules by title or text. |
| `pnpm rules:fetch` | Download the Comprehensive Rules text into `docs/rules/`. |

The Comprehensive Rules text is Wizards' and is not part of this repository: `pnpm rules:fetch` downloads it into `docs/rules/` (git ignores it; see `docs/rules/README.md` and `docs/rules/RULES_VERSION.md` for the version). It needs network access to Wizards of the Coast, and `pnpm rule` and a few checks need the file.

## Requesting card support

The app has no request button. When you import a card the game cannot run, the import screen's "Why unsupported?" shows what blocks it. To get the card supported, tell the owner or open a GitHub issue with the card name. The coding agent then follows `docs/CARD_SUPPORT_PLAYBOOK.md`: it finds the missing capability, adds it in a general form so other cards using the same mechanic work too, and records what it learned.

These are the three things you type to the coding agent:

- `Add support for <card name>.`
- `Work the backlog: implement the top 3 mechanics in reports/backlog.md.`
- `Approve the proposal in docs/proposals/<mechanic>.md.`

## Known limitations

- An imported deck is playable only when every card is supported. The grammar reads the common shapes of triggered, activated and static abilities, the keywords listed in `docs/MECHANICS.md`, and the normal, split, adventure, transform, modal double-faced and Saga layouts; the coverage report lists what it does not read, and a deck with such a card is reported invalid until the card is replaced or support is added. The opponent is the `HeuristicAgent`: at Normal it plays candidate blocks and attacks out on a copy of the game and picks the best, plans its mana and holds instants for a good moment; at Easy it considers fewer options and sometimes takes the second best. It never reads your hand or the order of any library; it does know which cards are in your deck, as D-161 allows. The older casual AI is reachable with `?autostart=<deck>,<deck>&ai=casual` (the default of `?autostart`, so the browser tests stay as they were); `&ai=easy` and `&ai=normal` pick the levels.
- v1 is Commander, one human against one AI. Free-for-all with 2 to 6 seats is planned for v2.
- Out of scope: online play between humans, other formats, sideboarding, ante, subgames, Un-cards, Conspiracies, Attractions, accounts and monetization.
- Every card is either supported or unsupported, with no "partially supported". A deck that contains an unsupported card cannot be played until the card is supported or replaced; the import screen's "Why unsupported?" shows the text the parser did not read and says whether the grammar or the engine is the blocker. Text the engine does not understand is never half-executed.
- Card layouts: normal, split, adventure, transform, modal double-faced and Saga are supported (not Fuse, Aftermath, Rooms, flip, meld, day and night, or read ahead). Other layouts are unsupported until added through the card support loop.
- Face-down permanents: manifest is supported (the top card of a library goes onto the battlefield face down as a 2/2 creature; you may turn a creature card with a mana cost face up for that cost; only you can look at it, and it is drawn with the Manifest token picture from Scryfall). Morph, Megamorph, Disguise, cloak and manifest dread are not.
- The rules baseline is the Comprehensive Rules effective September 25, 2026 with the Update Bulletin of October 19, 2026, verified and recorded in `docs/rules/RULES_VERSION.md`.
- Card data and images come from Scryfall, so deck import needs a connection to it; the precons carry their own card data.

See `docs/ROADMAP.md` for the full list.

## Project layout

```text
packages/engine    Pure rules engine (TypeScript, no DOM, no network, no randomness)
packages/cards     Decklist parsing, Scryfall client, Oracle text parser
packages/ai        AI agents: random, casual, greedy and the heuristic agent (engine public API only)
apps/web           React + Vite UI
tools/boundaries   Package-boundary rules and the tests that prove them
tools/corpus       Card coverage, template backlog, per-deck coverage (owner-run)
tools/creature-types  Creature type table generated from the rules text
tools/precon       Precon card-data snapshots
tools/lint         Lint plugin that bans nondeterministic APIs
tools/rules        Rules lookup and Comprehensive Rules downloader
decks/             Real decklists the owner supplies (for the per-deck coverage report)
reports/           Generated coverage reports (committed)
docs/              Spec, decision log, status, architecture, roadmap
AGENTS.md          Instructions for coding agents (CLAUDE.md points to it)
```

## Credits

- Card data and images: [Scryfall](https://scryfall.com).
- Magic: The Gathering, its card names, text and images are property of Wizards of the Coast.

## Fan Content Policy

Commander Arena is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. © Wizards of the Coast LLC.

## License

The code is released under the MIT License (see `LICENSE`). The license covers the code only. Magic: The Gathering card names, text and images are property of Wizards of the Coast and are not covered by it.
