# Adding more opponents: investigation (3 and 4 seats)

Status: phase 0, an investigation. Nothing here is a decision; the SPEC (section 1, "v2") only says that nothing in v1 may assume exactly two players. This note records what was read in the code and what the first probe found, so the next step starts from facts. Counts and timings depend on the machine and the seeds listed below.

## Question

Can the app run free-for-all Commander games with 3 and 4 seats, what would break, and what does the board look like?

## What the code already does

- `SeatId` is a `number` and `GameState.seats` is an ordered array. The SPEC forbids `players[1]`; no `seat ^ 1` or `1 - seat` pattern was found in the rules code.
- Turn passing uses `seats.length` (`rules/flow.ts`, `rules/setup.ts`). The skipped first draw (CR 103.8a) applies only with two seats. The free first mulligan (CR 103.5c) is forced on for more than two seats.
- `apnapOrder` (`rules/select.ts`) orders `eachPlayer` and `eachOpponent` effects. `loseTheGame` (`rules/lose-game.ts`) marks `hasLost` per seat, and the monarch moves on when its holder loses.
- `commanderDamage` is a record keyed by commander and seat, so it can hold several defenders.

## What blocks it today

- `createGame` throws for anything but two seats (`rules/setup.ts`).
- `runGame` types its agents as a pair (`packages/ai/src/runner.ts`).
- `Board.tsx` draws one opponent (`view.seats.find(s => s.id !== view.viewer)`), and the web host has one `HUMAN` and one `AI_SEAT` (`apps/web/src/game/host.ts`).
- The scenario DSL assumes two seats (`testing/scenario.ts`, `testing/assemble.ts` has `(controller + 1) % 2`).
- `docs/RULES_COVERAGE.md` marks CR 800.4a and 806 "Not implemented" and lists several seat-specific limits: one defending player (annihilator), `reselectAttack` (508.7d and 508.7e), APNAP for simultaneous choices (101.4), control changes when an owner leaves.
- The AI has about 30 places that look for "the other seat", and the casual and heuristic handlers are written around one opponent. Hidden information is sampled once (`determinize`), so three opponents mean three hidden hands.

## Probe

The probe is not in the repository: it ran from a local patch that is not merged. It played whole games of the real precons (`apps/web/src/precons/snapshots/`), one agent per seat, through `runGame`, with three changes: `createGame` accepted two to four seats, `runGame` took any number of agents instead of a pair, and each agent was wrapped to record what its view shows about seats that have lost (`node tools/ai/multiplayer-probe.ts --players 3|4 --games N --agent random|casual|greedy|heuristic [--seed S] [--verbose]`).

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
| The active seat is a player who has lost | 17 | 54 |
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

The same anomalies as in the first run appeared (permanents under a player who has lost: 1940 decisions with 3 seats, 5226 with 4; the active seat a player who has lost: 28 with 4 seats; stack objects of a player who has lost: 10 with 4 seats). The casual agent eliminates players much earlier than the random one, and the crash is far more frequent: 6 of 20 games. It is not known yet whether the crash is specific to more than two seats; the same seeds were not played with two.

## Reading of the results

- The engine plays games with more opponents to the end in most games: it is closer than the docs suggested. That does not prove the rules right.
- A player who loses is not removed from the game. Their permanents stay and the turn order does not skip them. These are the first things to fix, and they explain the 4-seat crash and turn caps only if a reproduction shows it.
- First losses appeared late (turn 40 to 94), because random agents rarely kill anyone. The leaving-the-game paths are exercised little by this run.

## Limits of this probe

- Only the random and casual agents were run. The heuristic agent may expose AI problems (target choice, hidden-hand samples, decision time).
- The crash seeds are recorded above; none has been rebuilt with `replayGame` yet, and the three turn caps of the random run were not recorded.
- The fallback count of the wrapper is fixed at construction and under-counts; it is zero for the random agent anyway.
- No timing was measured; a 10-game run of 3 seats takes about two minutes with the random agent.
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

1. Probe: `runGame` with one agent per seat, as above (headless, deterministic, seeds reproduce).
2. Arena (`pnpm ai:arena`): today it is two seats with paired seeds and swapped sides. For 3 and 4 it needs a player count, a list of agents and a rotation of the seating, so each agent sits in each position.
3. App: the host keeps one agent per AI seat and runs the ones with a pending decision in turn; the menu chooses the seat count and a deck for each.
4. Tests: a scenario DSL that accepts 3 and 4 seats, rule scenarios written first, a nightly soak, and the benchmark with a seat count.

## Plan in phases

0. Investigation (this note): the probe with the casual agent, the seeds of the crash and the turn caps, an inventory of `'opponent'` and seat assumptions.
1. Engine: leaving the game, skipping a player who has lost, several defenders, full APNAP, commander damage per player. Tests first. An S-class gap needs a proposal on an issue and the human's approval (`AGENTS.md`, "Card support").
2. Cards: re-test the supported cards that depend on the number of opponents with 3 and 4 seats and reclassify those that fail.
3. AI: a target policy and several hidden-hand samples; `ai:arena` with 3 and 4 seats.
4. UI: board, arrows, target choice, commander damage and the end screen.
5. Performance, soak and the release in the menu.

## Decisions that are the owner's

- The range of influence (CR 801): off, so that everyone is in range?
- Whether a game of 3 or 4 is offered as "commander damage per player" as in CR 903.10.
- Whether `createGame` may accept more than two seats in `main` before phase 1 is finished (it does not today).
- Whether `docs/SPEC.md` section 1 changes (needs approval).

## Open work from the probe

- Reproduce the `did not settle` crash with `replayGame` (seeds above) and find what loops; play the same seeds with two seats to see whether it is specific to more than two seats.
- Look at the two `You cannot pay that cost` rejections of the casual agent with 3 seats.
- Inventory of `'opponent'` in `ast/types.ts`, `rules/select.ts`, `filter-match.ts`, `triggers.ts`, `attack-bans.ts` and the parser.
- Scenario DSL with 3 and 4 seats.
- Choose 20 to 30 cards that depend on the number of opponents and write a scenario for each.
