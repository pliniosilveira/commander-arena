# Adding more opponents: investigation (3 and 4 seats)

Status: phase 0, an investigation. Nothing here is a decision; the SPEC (section 2, "v2") only says that nothing in v1 may assume exactly two players. This note records what was read in the code and what the first probe found, so the next step starts from facts. Counts and timings depend on the machine and the seeds listed below.

## Question

Can the app run free-for-all Commander games with 3 and 4 seats, what would break, and what does the board look like?

## What the code already does

- `SeatId` is a `number` and `GameState.seats` is an ordered array. The SPEC forbids `players[1]`; no `seat ^ 1` or `1 - seat` pattern was found in the rules code.
- The next turn goes to the next seat that has not lost (`startNextTurn` in `rules/flow.ts` through `seatsInOrder` in `state/ops.ts`, which skips seats with `hasLost`). The skipped first draw (CR 103.8a) applies only with two seats. The free first mulligan (CR 103.5c) is forced on for more than two seats, and the order of the mulligans uses `seats.length` (`rules/setup.ts`).
- `apnapOrder` (`rules/select.ts`) orders `eachPlayer` and `eachOpponent` effects. `loseTheGame` (`rules/lose-game.ts`) marks `hasLost` per seat, and the monarch moves on when its holder loses.
- `commanderDamage` is keyed by the damaged seat and the commander card (`commanderDamageKey` in `rules/sba.ts`, `"seat:card"`), so it can hold several defenders. That the 21-point loss is checked per key with more than two seats was not read.

## What blocks it today

- `createGame` throws for anything but two seats (`rules/setup.ts`).
- `runGame` types its agents as a pair (`packages/ai/src/runner.ts`).
- `Board.tsx` draws one opponent (`view.seats.find(s => s.id !== view.viewer)`), and the web host has one `HUMAN` and one `AI_SEAT` (`apps/web/src/game/host.ts`).
- The scenario DSL assumes two seats (`testing/scenario.ts`, `testing/assemble.ts` has `(controller + 1) % 2`).
- `docs/RULES_COVERAGE.md` marks CR 800.4a and 806 "Not implemented" and lists several seat-specific limits: one defending player (annihilator), `reselectAttack` (508.7d and 508.7e), APNAP for simultaneous choices (101.4), control changes when an owner leaves.
- The AI has about 30 places that look for "the other seat" (a search for `seats.find` and similar in `packages/ai/src`), and the comments of the casual and heuristic handlers speak of "the opponent" in the singular. Not read in detail: whether `determinize` redraws the hidden hands of every other seat, which three opponents would need.

## Probe

The probe is not in the repository: it ran from a local patch that is not merged and not kept here, so a rerun needs the three changes below made again. It played whole games of the real precons (`apps/web/src/precons/snapshots/`), one agent per seat, through `runGame`, with three changes: `createGame` accepted two to four seats, `runGame` took any number of agents instead of a pair, and each agent was wrapped to record what its view shows about seats that have lost (`node tools/ai/multiplayer-probe.ts --players 3|4 --games N --agent random|casual|greedy|heuristic [--seed S] [--verbose]`).

First run: agent `random`, 10 games per seat count, first seed 1, 100 turns and 8000 actions as limits.

| | 3 seats | 4 seats |
| --- | --- | --- |
| Games ending with a winner | 10 of 10 | 6 of 10 |
| Stopped at the turn cap | 0 | 3 |
| Engine crash | 0 | 1 (`State-based actions and triggers did not settle`) |
| Actions the engine rejected | 0 | 0 |
| Average final turn | 75 | 96 |

Anomalies seen in the views of the agents (decisions in which each appeared):

| Anomaly | 3 seats | 4 seats |
| --- | --- | --- |
| A permanent stays on the battlefield under a player who has lost (CR 800.4a) | 4500 | 4629 |
| The active seat is a player who has lost (not examined: it may be a player who lost during their own turn) | 17 | 54 |
| A seat that has lost was asked for a decision | 1 | 3 |
| A stack object is controlled by a player who has lost | 2 | 0 |

Second run: agent `casual`, 10 games per seat count, first seed 1, same limits.

| | 3 seats | 4 seats |
| --- | --- | --- |
| Games ending with a winner | 7 of 10 | 7 of 10 |
| Engine crash (`State-based actions and triggers did not settle`) | 3 (seeds 2, 5, 9) | 3 (seeds 4, 6, 9) |
| Actions the engine rejected | 2 (`You cannot pay that cost`) | 0 |
| Average final turn | 38 | 45 |
| First loss seen at turn | 23 to 42 | 19 to 56 |

The same anomalies as in the first run appeared (permanents under a player who has lost: 1940 decisions with 3 seats, 5226 with 4; the active seat a player who has lost: 28 with 4 seats and none with 3; stack objects of a player who has lost: 10 with 4 seats). The casual agent eliminates players much earlier than the random one, and the crash is far more frequent: 6 of 20 games. It is not known yet whether the crash is specific to more than two seats; the same seeds were not played with two.

Third run: agent `heuristic` (the strongest agent of `packages/ai`), 10 games per seat count, first seed 1, same limits.

| | 3 seats | 4 seats |
| --- | --- | --- |
| Games ending with a winner | 8 of 10 | 9 of 10 |
| Engine crash (`State-based actions and triggers did not settle`) | 2 (seeds 1, 7) | 1 (seed 7) |
| Actions the engine rejected | 5 | 1 |
| Fallbacks recorded by the agent | 2 | 3 |
| Average final turn | 31 | 43 |
| First loss seen at turn | 16 to 39 | 21 to 40 |

The rejections the probe sampled (up to two per game) were `You cannot pay that cost` and, with 3 seats, a mana ability tried with a pool that lacked the {1} (Overflowing Basin). The same leaving-the-game anomaly appeared: permanents under a player who has lost in 1862 decisions with 3 seats and 6115 with 4; a seat that has lost was asked for a decision 3 and 6 times; the active seat a player who has lost twice with 4 seats. With a stronger agent the games end sooner and fewer crash (3 of 20), but a crash in every run, with every agent, means it is not specific to one agent. Whether it depends on the number of seats is not known: the same seed gives a different game with 3 and with 4 seats, and no game was played with two.

## Reading of the results

- The engine plays games with more opponents to the end in most games: it is closer than the docs suggested. That does not prove the rules right.
- A player who loses is not removed from the game: their permanents stay on the battlefield, and objects they control were seen on the stack. The next turn does skip a seat that has lost (`seatsInOrder`), so the lost seat seen as the active seat is probably a player who lost during their own turn; that is to be checked, not assumed. A lost seat that was asked for a decision is also unexplained. None of this is known to cause the 4-seat crash or the turn caps; only a reproduction would show it.
- With the random agent the first losses appeared late (turn 41 to 94), so it exercises the leaving-the-game paths little; the casual agent does it earlier (turn 19 to 56).

## Limits of this probe

- All three agents were run at 10 games per seat count, which is a small sample: the crash rates (1 to 3 of 10) are not comparable between agents. Decision time was not measured.
- The crash seeds are recorded above; none has been rebuilt with `replayGame` yet, and the three turn caps of the random run were not recorded.
- The fallback count of the wrapper is fixed at construction and under-counts; it is zero for the random agent anyway.
- Decision times were not measured. Runs of 10 games took on the order of minutes.
- The probe's agents are wrapped, so a failing seed must be replayed without the wrapper to confirm it.

## Risks, in order of weight

1. Rules: leaving the game (CR 800.4a), attacks with several defenders, APNAP for simultaneous choices, `'opponent'` filters (the same in 1v1, "any" or "each" in 3 and 4), commander damage per player, and every card marked supported that was only checked in 1v1 (monarch, goad, vote, annihilator, extort, the Ring).
2. AI: target and attack choice among several opponents, samples of several hidden hands, and decision time (the budget is 5 s a decision).
3. UI: a layout that is "me below, one opponent above", the arrows of combat and of the stack, a choice of which opponent, and phone width.
4. Performance: more permanents and triggers; `tools/perf/derive-bench.ts` measures only two seats.
5. Tests: the scenario DSL, the golden and derive digests, and an exhaustive soak for 3 and 4 seats.

## Board sketch

The viewer stays below. Opponents sit in a row above: two for three seats, three for four. The active player and the defender being attacked are highlighted. An opponent's strip shows life, hand count, a commander-damage matrix, the command zone and a collapsed battlefield that opens on click. On a phone the opponents become tabs or a carousel. A choice of target opponent is a clear selector when more than one target is legal. Combat arrows need a source and a defender each.

## How games would be run

1. Probe: `runGame` with one agent per seat, as above (headless, deterministic, seeds reproduce; it needs the unmerged changes described there).
2. Arena (`pnpm ai:arena`): today it is two seats with paired seeds and swapped sides. For 3 and 4 it needs a player count, a list of agents and a rotation of the seating, so each agent sits in each position.
3. App: the host keeps one agent per AI seat and runs the ones with a pending decision in turn; the menu chooses the seat count and a deck for each.
4. Tests: a scenario DSL that accepts 3 and 4 seats, rule scenarios written first, a nightly soak, and the benchmark with a seat count.

## Plan in phases

0. Investigation (this note): done so far are the probe with the random, casual and heuristic agents and the crash seeds. Open: reproducing the crash and the turn caps, an inventory of `'opponent'` and seat assumptions.
1. Engine: leaving the game (CR 800.4a), a player who loses during their own turn, several defenders, full APNAP, commander damage with several defenders. Tests first. An S-class gap needs a proposal on an issue and the human's approval (`AGENTS.md`, "Card support").
2. Cards: re-test the supported cards that depend on the number of opponents with 3 and 4 seats and reclassify those that fail.
3. AI: a target policy and several hidden-hand samples; `ai:arena` with 3 and 4 seats.
4. UI: board, arrows, target choice, commander damage and the end screen.
5. Performance, soak and the release in the menu.

## Decisions that are the owner's

- The range of influence (CR 801): off, so that everyone is in range?
- Whether `createGame` may accept more than two seats in `main` before phase 1 is finished (it does not today).
- Whether `docs/SPEC.md` section 2 (the "v2" line, 2 to 6 seats) changes (needs approval).

## Open work from the probe

- Reproduce the `did not settle` crash with `replayGame` (seeds above) and find what loops; play the same seeds with two seats to see whether it is specific to more than two seats.
- Read how the 21-point commander loss is checked with several defenders (CR 903.10a; the CR text was not available in this session).
- Look at the rejections: `You cannot pay that cost` (casual with 3 seats, heuristic with both) and the mana ability of Overflowing Basin tried with an empty pool (heuristic with 3 seats). They may be agent bugs that exist with two seats too.
- Inventory of `'opponent'` in `ast/types.ts`, `rules/select.ts`, `filter-match.ts`, `triggers.ts`, `attack-bans.ts` and the parser.
- Scenario DSL with 3 and 4 seats.
- Choose 20 to 30 cards that depend on the number of opponents and write a scenario for each.
