# Adding more opponents: investigation (3 and 4 seats)

Status: phases 0 to 2 are in progress (see "Where we are"); the UI is left for later. Nothing here is a decision; the SPEC (section 2, "v2") only says that nothing in v1 may assume exactly two players. This note records what was read in the code and what the first probe found, so the next step starts from facts. Counts and timings depend on the machine and the seeds listed below.

## Where we are

Engine work (phases 1 and 2) is well advanced; the AI, `ai:arena`, performance and the UI are not started.

Done: the N-seat harness (#362), leaving the game (#336, CR 800.4a; the `did not settle` crash is gone), the audit (#363), several defending players declaring blockers (#414), the battle protector chosen by its controller (#415), "choose an opponent" effects asking which one (#416), "an opponent has N life" ignoring players who left (#417), a battle whose protector left the game getting a new one (#432, CR 704.5y), and part 1 of #418 (a discard by several players collects every choice first).

Open, in order of work:

1. #421: 3-seat tests for annihilator, `reselectAttack`, goad and commander damage (tests only; the cheapest, and the one most likely to find a bug).
2. #418, parts 2 and 3: `exileOwnGraveyardCard` and `playersMay`, then `search` (CR 701.23i).
3. #419: Myriad with 3 or more seats (three cards wait for it, see the last table).
4. #420: 3-seat scenarios for 20 to 30 supported cards; a card that fails is reclassified as unsupported.
5. #452: audit of the AI for 3 and 4 seats (phase 3), read-only first.
6. #453: probe follow-ups (turn caps, rejected actions, CR 800.4j).
7. #422: latent single-opponent sites, low priority; #363 closes when its children do.

Not audited: the AI and the view code. `ai:arena` still plays two seats, and `tools/perf/derive-bench.ts` measures only two. The probe tables above are from before #414 to #418; rerun them when the open engine issues close.

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

The rejections the probe sampled (up to two per game) were `You cannot pay that cost` and, with 3 seats, a mana ability tried with a pool that lacked the {1} (Overflowing Basin). The same leaving-the-game anomaly appeared: permanents under a player who has lost in 1862 decisions with 3 seats and 6115 with 4; a seat that has lost was asked for a decision 3 and 6 times; the active seat a player who has lost twice with 4 seats. With a stronger agent the games end sooner and fewer crash (3 of 20), but a crash in every run, with every agent, means it is not specific to one agent. The cause is below.

## Cause of the `did not settle` crash

Reproduced with seed 7, 3 seats, agent `heuristic` (decks, in seat order: Grave Danger, Prismari Artistry, Temur Roar), by adding to the error of `settle` (`rules/settle.ts`) the last events and the waiting triggers. At the crash seat 0 had lost (`hasLost`) and it was seat 2's declare attackers step. One triggered ability was waiting: the "attacks the enchanted player" trigger of a permanent controlled by seat 0 (`controller: 0`, an Aura of Grave Danger that enchants a player).

`putTriggersOnStack` (`rules/trigger-stack.ts`) walks `seatsInOrder`, which skips seats that have lost, so no seat ever puts that trigger on the stack and nothing removes it. `settle` then repeats a round that changes nothing until its guard of 10,000 rounds throws. The loop produced no events.

CR 800.4d says it outright: "If a triggered ability that would be controlled by a player who has left the game would be put onto the stack, it isn't put on the stack." The engine neither drops such a trigger nor lets it wait harmlessly. So the crash comes from the same gap as the permanents that stay after their owner loses (CR 800.4a): the triggers, and the objects, of a player who left the game are not removed. It needs more than two seats by its mechanism: with two seats the game ends when a player loses, so no trigger of a player who has lost can be waiting. The same three decks with seats 0 and 1 only (a different game, since the shuffles differ) ended at turn 18 with a win and no crash. The other seven crash seeds of the casual and heuristic runs were played again with the same extended error, and all end the same way: at the crash every waiting trigger belongs to a seat that has lost.

| Run | Waiting triggers (kind) | Controller | Seats that have lost |
| --- | --- | --- | --- |
| heuristic, 3 seats, seed 1 | cast a spell | seat 1 | seat 1 |
| casual, 3 seats, seed 2 | leaves the battlefield | seat 1 | seat 1 |
| casual, 3 seats, seed 5 | attack batch | seat 1 | seat 1 |
| casual, 3 seats, seed 9 | dies, leaves the battlefield | seat 0 | seat 0 |
| casual, 4 seats, seed 4 | dies | seat 1 | seat 1 |
| casual, 4 seats, seed 6 | attack batch, attacks | seat 2 | seats 0 and 2 |
| casual, 4 seats, seed 9 | dies, leaves the battlefield (twice) | seat 0 | seat 0 |

The crash seeds of the random run were not examined. A game is reproduced from its seed and seat count alone, so the wrapper of the probe is not needed to replay it.

## Reading of the results

- The engine plays games with more opponents to the end in most games: it is closer than the docs suggested. That does not prove the rules right.
- A player who loses is not removed from the game: their permanents stay on the battlefield, and objects they control were seen on the stack. The next turn does skip a seat that has lost (`seatsInOrder`), so the lost seat seen as the active seat is a player who lost during their own turn. CR 800.4j says that turn goes on to its end without an active player and that the next player in turn order receives the priority the active player would have had; the engine keeps the seat as the active one, which is a difference to check, not yet a known defect. A lost seat that was asked for a decision is also unexplained. The crash is traced to the same gap (above). The turn caps of the random run are not explained.
- With the random agent the first losses appeared late (turn 41 to 94), so it exercises the leaving-the-game paths little; the casual agent does it earlier (turn 19 to 56).

## Rerun after leaving the game (step 2)

Step 1 (#371) put the probe in the repository and step 2 (#377, CR 800.4a) made a player who loses leave a game that goes on. The three runs were played again with `node tools/ai/multiplayer-probe.ts --players 3|4 --games 10 --agent random|casual|heuristic --precons`, seed 1, 100 turns and 8000 actions as limits.

| Agent, seats | Games ending with a winner | Engine crash | Rejected actions | Average final turn |
| --- | --- | --- | --- | --- |
| random, 3 | 9 of 10 (seed 8 at the turn cap) | 0 | 0 | 68 |
| random, 4 | 7 of 10 (seeds 1, 7, 9 at the turn cap) | 0 | 0 | 89 |
| casual, 3 | 10 of 10 | 0 | 0 | 30 |
| casual, 4 | 10 of 10 | 0 | 0 | 46 |
| heuristic, 3 | 10 of 10 | 0 | 0 | 28 |
| heuristic, 4 | 10 of 10 | 0 | 0 | 44 |

In all six runs no permanent stayed under a player who had lost, no seat that had lost was asked for a decision and no stack object was controlled by one. The crash is gone (9 of 60 games before, 0 now) and so are the rejected actions, which were probably a result of the broken state. The lost seat as the active seat still appears (random 30 and 42 decisions with 3 and 4 seats, heuristic 24 with 4 seats): a player who leaves on their own turn stays the active seat until it ends and is asked nothing, the smaller option of point 3 of #336. The four games at the turn cap are all with the random agent; seed 8 with 3 seats is new, and none of the four was examined.

## Limits of this probe

- All three agents were run at 10 games per seat count, which is a small sample: the crash rates (1 to 3 of 10) are not comparable between agents. Decision time was not measured.
- The crash seeds are recorded above; eight were reproduced, not with `replayGame` but by running the same seed again with the error of `settle` extended (a scratch change, not kept). The three turn caps of the random run were not recorded.
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

0. Investigation (this note): done so far are the probe with the random, casual and heuristic agents and the crash seeds. Open: reproducing the crash and the turn caps, the inventory of `'opponent'` and seat assumptions is done (see "Audit of the one-opponent assumptions").
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

- The turn caps of the random run and the active seat that left (CR 800.4j): #453.
- Read how the 21-point commander loss is checked with several defenders (CR 903.10a and 104.3j: 21 or more combat damage from the same commander; the key `"seat:card"` is per defender in `lossReasons`, read but not yet covered by a 3 or 4 seat test: #421).
- The rejected actions (`You cannot pay that cost`, Overflowing Basin with an empty pool): #453.
- The AI for 3 and 4 seats: #452.
- Inventory of `'opponent'`: done for the rules; the parser is left as card-pipeline limits (see "Audit of the one-opponent assumptions").
- Scenario DSL with 3 and 4 seats.
- Choose 20 to 30 cards that depend on the number of opponents and write a scenario for each: #420.

## Audit of the one-opponent assumptions (step 3, #363)

Read-only audit of `packages/engine/src/rules/`. The selector layer is already correct for N seats (`resolvePlayers` returns every living opponent in turn order, and sacrifice, clash, vote, control changes, gift, encore, crime, speed, the Ring and the monarch handle N). What is wrong with 3 or 4 seats, and the issue that fixes it:

| Finding | Where | Issue |
| --- | --- | --- |
| Each-player search, exile and "may" act after each choice, not after all (CR 101.4, 701.23i); discard waits for the last choice now (first of the three pull requests of #418) | `effects.ts` | #418 |
| Myriad is a no-op with 3 or more seats | `ast/features.ts:1587` | #419 |
| Latent `resolvePlayers(...)[0]` and `[0]` sites, none reachable from real card text | `amounts.ts`, `effects.ts`, `legality.ts`, `control-effects.ts` | #422 |

A battle's protector is now chosen by its controller among their living opponents (CR 310.9a, 310.12a; #415), and so is the opponent in "an opponent separates, chooses or copies" (Demonstrate, piles, Coin of Fate; #416, CR 608.2d, 801.5b), each asked only with more than one. "An opponent has N or less life" now ignores opponents who left the game (CR 800.4a; #417).

The combat data model already supports several defenders (each attacker stores its own target and defender, and `defending.ts` derives the defending player per creature, CR 508.5a); the defending players now declare blockers one after the other, each against the attackers aimed at them (CR 802.4; #414). Tests for annihilator, `reselectAttack`, goad and commander damage with 3 seats: #421. Not audited: the AI, the UI and the view code.

## Cards not supported for more than one opponent

Support is one flag per card today, so a card here is marked supported in the golden corpus and is known not to work with 3 or 4 seats. 1v1 support is unchanged. Add a card with what fails and the issue that fixes it; delete the row when the fix is merged. The 3-seat re-test that fills this list is #420.

| Card | What fails with 3 or more seats | Issue |
| --- | --- | --- |
| Goldlust Triad | Myriad does nothing | #419 |
| Hammers of Moradin | Myriad does nothing | #419 |
| Legion Loyalty | Myriad does nothing | #419 |
