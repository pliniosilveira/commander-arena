# Adding more opponents: investigation (3 and 4 seats)

Status: the engine, the cards and the AI work with two to four seats and no issue of the `more-opponents` label is open. What stops a 3 or 4 seat game in the app is the app: its host, its menu flow and its board still have one opponent (see "What still blocks it"). Nothing here is a decision; the SPEC (section 2, "v2") only says that nothing in v1 may assume exactly two players. This note records what was read in the code and what the probes found, so the next step starts from facts. Counts and timings depend on the machine and the seeds listed below.

## Where we are

The engine (phase 1), the audit of the cards (phase 2) and the AI fixes (phase 3) are done. `createGame` takes two to four seats (#500) and `pnpm ai:arena --seats 3|4` plays tables (#502). The app does not play them yet: the menu has a number-of-opponents toggle and a deck dialog for each opponent (#519, #523), but the flow ends on an empty board and no game starts for 2 or 3 opponents. The board plan (#499) is written and none of its steps is built. Performance and soak (phase 5) are not started.

Done: the N-seat harness (#362), the audit of the AI (#452; its fixes are #479 to #483), `ai:arena` for 3 and 4 seats (#482), leaving the game (#336, CR 800.4a; the `did not settle` crash is gone), the audit (#363), several defending players declaring blockers (#414), the battle protector chosen by its controller (#415), "choose an opponent" effects asking which one (#416), "an opponent has N life" ignoring players who left (#417), 3-seat tests of annihilator, reselecting an attack, "attacks you" triggers, goad, the random opponent, attack bans and commander damage (#421: all pass, no bug found), Myriad with 3 or 4 seats (#419), 3-seat scenarios for 26 real cards (#420: all pass; the list at the end got its first rows from the phase 2 audit), a battle whose protector left the game getting a new one (#432, CR 704.5y), #418 (a discard, an exile from a graveyard, a "may" or a search by several players collects every choice or answer first), the AI fixes #481 and #483 (their pull requests are #503 and #504; the casual agent's must-differ target slots are #501), a crash when a seat loses in the same check as its permanent dies (#475), the probe follow-ups (#453, see "Rerun on current main"), the latent single-opponent sites (#422), and the audit of about 380 more cards ("Phase 2 audit" below; its one failure was #506).

Open: no issue. The audit left three rulings, and all are settled: #507 (a goad that never ended when its goader left the game) by CR 800.4m (#522), #508 (Mindblade Render with two opponents hit in one combat) by the official ruling of the card (#524) and #509 (Tasigur asked the first opponent only) by #520. What is left is work nobody has opened an issue for yet, listed in "What still blocks it" and "Plan in phases".

Not audited: the view code and the host of the app. `tools/perf/derive-bench.ts` and `ai:arena --precons` play two seats only, and the decision time of the AI with several opponents has not been measured. The probe tables of the first sections are from before #414 to #418; "Rerun on current main" is the latest.

## Question

Can the app run free-for-all Commander games with 3 and 4 seats, what would break, and what does the board look like?

## What the code already does

- `SeatId` is a `number` and `GameState.seats` is an ordered array. The SPEC forbids `players[1]`; no `seat ^ 1` or `1 - seat` pattern was found in the rules code.
- The next turn goes to the next seat that has not lost (`startNextTurn` in `rules/flow.ts` through `seatsInOrder` in `state/ops.ts`, which skips seats with `hasLost`). The skipped first draw (CR 103.8a) applies only with two seats. The free first mulligan (CR 103.5c) is forced on for more than two seats, and the order of the mulligans uses `seats.length` (`rules/setup.ts`).
- `apnapOrder` (`rules/select.ts`) orders `eachPlayer` and `eachOpponent` effects. `loseTheGame` (`rules/lose-game.ts`) marks `hasLost` per seat, and the monarch moves on when its holder loses.
- `commanderDamage` is keyed by the damaged seat and the commander card (`commanderDamageKey` in `rules/sba.ts`, `"seat:card"`), so it can hold several defenders. That the 21-point loss is checked per key with more than two seats was not read.

## What still blocks it

- The host: `AI_SEAT` is one constant (`game/protocol.ts`), used in `host.ts` (the AI's turn loop, its emblems and `determinize`) and `slow-opponent.ts`. The app has one human (seat 0) and one AI seat with one agent; `createGame` is called with two decks.
- The menu: the number-of-opponents toggle and the deck dialog per opponent exist (#519, #523), but nothing starts the game and the screen that follows is empty. The text of #523 says the engine still plays two seats; since #500 it does not.
- The board: `Board.tsx` and `Versus.tsx` pick "the" opponent with `view.seats.find(s => s.id !== view.viewer)`, and `seatLabel`, `commanderDamageTaken`, `game-over-model.ts`, `TurnTracker.tsx`, `priority.ts` and `LibraryTop` speak of one opponent. `Board.tsx` is not going to change in this phase; the new board of "Board plan" is unbuilt.
- Tools: `tools/perf/derive-bench.ts` replays two-seat games, `ai:arena --precons` and `--pairing` are for two seats (tables use the arena decks), and there is no soak for three or four seats.
- Rules not built (`docs/RULES_COVERAGE.md`, `docs/ROADMAP.md`): CR 800.4c, 800.4e to 800.4i and 800.4k, 806, effects that last until a point of the next turn of a player who left (`turnEnd`, `endStep`), and the active seat of a turn in which its player left (CR 800.4j: the engine passes the priority on, but the seat stays active until the turn ends). The range of influence (CR 801) is an owner decision (below).

## Probe

The first runs below came from a local patch; the probe is in the repository now (`tools/ai/multiplayer-probe.ts`, #371), `createGame` takes two to four seats (#500) and `runGame` takes any number of agents. It played whole games of the real precons (`apps/web/src/precons/snapshots/`), one agent per seat, through `runGame`, with three changes: `createGame` accepted two to four seats, `runGame` took any number of agents instead of a pair, and each agent was wrapped to record what its view shows about seats that have lost (`node tools/ai/multiplayer-probe.ts --players 3|4 --games N --agent random|casual|greedy|heuristic [--seed S] [--verbose]`).

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

In all six runs no permanent stayed under a player who had lost, no seat that had lost was asked for a decision and no stack object was controlled by one. The crash is gone (9 of 60 games before, 0 now) and so are the rejected actions, which were probably a result of the broken state. The lost seat as the active seat still appears (random 30 and 42 decisions with 3 and 4 seats, heuristic 24 with 4 seats): a player who leaves on their own turn stays the active seat until it ends and is asked nothing, the smaller option of point 3 of #336. The four games at the turn cap are all with the random agent; seed 8 with 3 seats is new. None of the four was examined at the time; the next section did.

## Rerun on current main (#453)

`node tools/ai/multiplayer-probe.ts --precons --games 10 --agent random|casual|heuristic` on `main` after the AI fixes. The seed-to-deck pairing differs from the first runs, so the old seeds cannot be replayed.

- Turn caps: with the random agent 6 of 10 games with 4 seats reach the 100-turn cap (seeds 2, 3, 4, 5, 7, 10) and none with 3 seats; with 2 seats the same agent leaves 1 of 20 unfinished. At the cap the games are not stalled (4000 to 5000 of 8000 actions used, libraries still at 38 to 67 cards, life totals spread out, some seats already lost): a weak agent, since random seats rarely attack well and more seats mean more life to remove. Not an engine defect.
- Rejected actions: none with the random agent, and none with casual or heuristic with 3 or 4 seats (10 of 10 games won). The two `You cannot pay that cost` rejections and the Overflowing Basin one did not recur, so they were a result of the broken state before #377. One new rejection of the casual agent with 4 seats (`Choose 1 to 1 targets for t2`, Incremental Blight) was fixed by #501.
- Seats that have lost: no permanent under them, no decision asked of them, no stack object controlled by them. The only counter left is the active seat that left on its own turn (CR 800.4j), which showed in 2 decisions of one game and changed no outcome. The engine now passes the priority to the next seat when the seat that left held it (`api.ts`, `leave-game.test.ts`); the seat stays active until the turn ends, a limit listed in ROADMAP.

## Limits of this probe

- All three agents were run at 10 games per seat count, which is a small sample: the crash rates (1 to 3 of 10) are not comparable between agents. Decision time was not measured.
- The crash seeds are recorded above; eight were reproduced, not with `replayGame` but by running the same seed again with the error of `settle` extended (a scratch change, not kept). The three turn caps of the random run were not recorded.
- The fallback count of the wrapper is fixed at construction and under-counts; it is zero for the random agent anyway.
- Decision times were not measured. Runs of 10 games took on the order of minutes.
- The probe's agents are wrapped, so a failing seed must be replayed without the wrapper to confirm it.

## Remaining risks, in order of weight

1. App: the host and the protocol have one AI seat, the current board draws one opponent (a separate board for three or more players is planned), and the table screen starts no game. Until they change, everything built so far cannot be played.
2. Performance: more permanents and triggers; the decision time of the AI with three opponents (the budget is 5 s a decision) and the speed of `getView`, `getLegalActions` and `applyAction` with more seats have not been measured, because `derive-bench` and `ai:arena --precons` play two seats.
3. Tests: no soak for three or four seats, and the scenarios of the phase 2 audit were not kept (a card of the corpus is not guaranteed to have its own 3-seat test).
4. Rules: the CR sections listed under "What still blocks it", and cards that were checked only with the text the parser reads (the audit says which were read and not run).
5. UI: arrows of combat and of the stack with three opponents, a choice of which opponent, and phone width (left out of the board plan).

## Board plan: a separate board for three or more players (phase 4)

The board for three or more players (two or more opponents) starts as a board of its own, next to today's. The current board (`Board.tsx`, the screen of `Game` in `App.tsx`) is not touched in this phase: it stays as it is for 1v1. The app already has a separate screen for a table (`screen === 'table'`, `EmptyTable` in `App.tsx`, #523), so the new board goes there and `Game` is left alone. The new board composes the components that exist (`Field`, `PlayerStrip`, `HandBacks`, the turn box, the stack, the decision dock) and does not edit them where it can avoid it. Whether the two boards become one is a later decision, after the new one works. The screen is a grid:

```
3 opponents                 2 opponents                 1 opponent
| opp 1 | opp 2 | opp 3 |   | opp 1     | opp 2     |   today's board,
| you           | flow  |   | you           | flow  |   not touched
```

Opponents share the top row equally. You get the bottom left (4 of 6 columns). The flow cell (2 of 6) holds what floats today at the right edge and top left: the decision dock, the stack and the turn box. The template is a pure function of the opponent count (`tableAreas`, unit tested like `layout.ts`), so adding a seat count adds a row to a table, not a component.

### The mockup (owner, three opponents)

![Mockup of the board with three opponents: the opponents in a row on top, you at the bottom left, and the flow cell at the bottom right](images/more-opponents-board-mockup.png)

The mockup is about where the players sit, not a design of the strips. It fixes:

- The opponents share the top row in equal columns, one cell each (zone 1), up to three.
- You are at the bottom left, about two thirds of the bottom row, with your hand under your battlefield (zone 2).
- The flow cell is at the bottom right, the rest of the bottom row (zone 3): the turn, the stack and your decision.
- The log, the settings and "Report issue" stay at the bottom left as in 1v1 (`LogDock`, `SettingsDock` and `ReportDock` in `App.tsx`, outside the board). The flow cell has no log.

Everything else in the picture (the colour of each seat, the chips, the wheel of seats, the compact strip, the highlighted borders and the Portuguese labels) is illustrative and not a requirement. The first version reuses today's components and they are adjusted afterwards ("Later adjustments").

### What is reused as it is

By composition: the new board imports these and does not change them.

| Today | In the new board |
| --- | --- |
| `Field` and `BattlefieldRow` | One per seat, unchanged. Rows measure their own cell (`useMeasure`) and pick tile height, grouping and scrolling from it, so a narrower cell is not a new code path. `ROW_ORDER_OPP` already mirrors the opponent. |
| `PlayerStrip` and its parts (`CommandBox`, `ManaPool`, `CommanderChip`, `LibraryTop`) | Unchanged at first, one for each seat. A compact density is added only if the strip does not fit its cell (decided with the screenshots of step 2). |
| `HandBacks` | One per opponent. |
| `BlockArrows`, `StackArrows` | Measure tiles from the DOM by `data-object-id` (`panels/arrows.ts`), so they do not care where a cell is. To confirm with a test at 3 opponents. |
| `DecisionLayer`, `DockSlotContext`, `StackPanel` | In `Game` the dock slot is in `aside.turn-panel`; the new board gives the same slot to its flow cell. |
| `ix.clickableSeats`, `ix.onSeat`, `AttackTargetDialog` | Already keyed by seat id and by `player:<seat>` options. They only need names. |
| `TurnTracker` | It floats at the top left in `Game`; in the new board it sits in the flow cell, as it is. A turn-order wheel is a later adjustment. |
| `LogDock`, `SettingsDock`, `ReportDock` | Unchanged and outside the board: the bottom left, as in 1v1. The flow cell has no log. |

### What has to change in the first version

These are about being correct with several opponents, not about looks. The current board is not edited: what the new board needs is new code beside it, and a shared module changes only in a way that leaves the 1v1 output exactly as it is (the tests of the 1v1 strings stay).

- `seatLabel` says "Opponent" for everyone, so three opponents cannot be told apart. The new board uses its own label that numbers the opponents ("Opponent 2"); the two copies of `seatLabel` (`ui/board/resolve.ts` and `ui/decisions/lookup.ts`) are left for later.
- `commanderDamageTaken` names the source only when there is one source (`resolve.ts`). The new board maps each `"seat:card"` key to its owner and shows "from Opponent 2", or it would show a wrong total.
- Words that say "the opponent" in the singular and are shared by both screens: `Versus.tsx`, `game-over-model.ts` (who won, with three opponents), `TurnTracker.tsx` (`stopSide`; the two stop settings stay, "opponent" meaning any opponent), `priority.ts`, `LibraryTop`. They change by adding what several opponents need, with the 1v1 text unchanged.
- A seat that left the game keeps its strip with `has-lost` (it exists already); what it owned has left the game (CR 800.4a), so its field is empty.
- New rules go in a new `table.css`, with class names of their own (`table-`), so the e2e tests of the 1v1 board are not affected; `board.css` is already over 2000 lines.
- Not part of the board: `host.ts` has one `HUMAN` and one `AI_SEAT`, and the table screen starts no game. Those belong to #526.

### Later adjustments

Not planned as pull requests until the board is playable; each becomes an issue when wanted: merging the two boards into one, a colour for each seat, the turn-order wheel in the flow cell, a compact strip, a badge for the monarch and the commander damage chips on the strips, widening the column of the seat that attacks or targets you (UI state, never engine state), a collapsed strip for a seat that left, opponents stacked below about 1100 px wide, and phone width.

### Developing it

`createGame` takes two to four seats now (#500), but the host of the app does not start such a game, so the UI cannot wait for it. Render the new board from synthetic `GameView` fixtures (marked `SYNTHETIC`) in a component test and in one e2e page, with 2 and 3 opponents, a seat that left, and an attack on you. Because `Board.tsx` and `Game` are not edited, the 1v1 game is unaffected by construction, and the existing e2e tests stay the check of that.

### Steps

None is built. Each is a pull request, and none edits the current board. Steps 1 to 3 do not need the host (#526), and the numbers of #527 decide whether the board is built for four seats or three.

1. Pure parts with tests, nothing imports them yet: `tableAreas` (the positions of the mockup as a function of the opponent count) and the label that numbers the opponents.
2. `TableBoard` (`ui/board/TableBoard.tsx`, `table.css`): the three zones with the existing `Field`, `PlayerStrip`, `HandBacks` and your hand, adjusting only what does not fit. Reachable only from a synthetic e2e page and component tests; screenshots at 1440, 1280 and 1024 wide decide whether the strip needs a compact density.
3. The flow cell: the existing turn box, stack and decision dock placed in it, with the log, settings and report docks where they are.
4. What must be right with several opponents: commander damage by source, arrows of combat and of the stack (to read first: `CombatEffects`, `combat-order` and `pair-focus` may assume one defender), the attack target dialog and the choices of target naming the opponent, the singular wording of the decisions, and the end screen.
5. The table screen shows `TableBoard` instead of the empty board, the menu starts the game with the host of #526, and one e2e game has three opponents.

### Open choices

- When, if ever, the two boards become one (not before the new board works).
- The narrowest window width the board must support.

## How games would be run

1. Probe: `runGame` with one agent per seat, as above (headless, deterministic, seeds reproduce; `tools/ai/multiplayer-probe.ts`). Done.
2. Arena (`pnpm ai:arena`): two seats play paired seeds with swapped sides; `--seats 3|4 --agents ...` plays a table with the agents rotated through the seats (#482; arena decks only). Done.
3. App: the host keeps one agent per AI seat and runs the ones with a pending decision in turn; the menu chooses the seat count and a deck for each. The menu part is built up to the empty board (#519, #523); the host is not.
4. Tests: a scenario DSL that accepts 3 and 4 seats and the rule scenarios written first are done (#362, phase 2); a nightly soak and the benchmark with a seat count are not.

## Plan in phases

0. Investigation (this note): done.
1. Engine: leaving the game, a player who loses during their own turn (priority only), several defenders, APNAP, commander damage with several defenders: done (#336, #414 to #419, #432), with the rules of "What still blocks it" left out.
2. Cards: the supported cards that depend on the number of opponents were re-tested with 3 and 4 seats (#420, "Phase 2 audit"): done; the table of cards not supported for several opponents is empty.
3. AI: a target policy, lethal checks, defenses and several hidden-hand samples (#452 and its fixes), and `ai:arena` with 3 and 4 seats (#482): done; its decision time is not measured.
4. UI: the board plan (#499) and the menu flow up to the empty board (#519, #523) are done; the host, the board, arrows, target choice, commander damage and the end screen are not.
5. Performance, soak and the release in the menu: not started.

## Decisions that are the owner's

- The range of influence (CR 801): off, so that everyone is in range?
- Whether `docs/SPEC.md` section 2 (the "v2" line, 2 to 6 seats) changes: the engine takes two to four (needs approval).

## Open work from the probe

- The turn caps of the random run, the rejected actions and the views of seats that have lost: answered in "Rerun on current main" (#453); the active seat that left (CR 800.4j) stays a limit in ROADMAP.
- The 21-point commander loss with several defenders: the key `"seat:card"` is per defender in `lossReasons` (CR 903.10a, 104.3j) and 3-seat tests cover it (#421).
- The AI for 3 and 4 seats: audited in #452; the fixes are #479 to #483, #501, #503 and #504.
- Inventory of `'opponent'`: done for the rules; the parser is left as card-pipeline limits (see "Audit of the one-opponent assumptions").
- The scenario DSL plays 3 and 4 seats (`scenario({ seats })`), with limits seen in the phase 2 audit: `expect.canBlock` and the default attack target throw with more than two seats (`testing/expect-combat.ts`, `testing/combat-refs.ts`), `concede()` works only while that seat holds the decision, and a second concede with the default invariant check fails with "card cN has 0 objects".

## Audit of the one-opponent assumptions (step 3, #363)

Read-only audit of `packages/engine/src/rules/`. The selector layer is already correct for N seats (`resolvePlayers` returns every living opponent in turn order, and sacrifice, clash, vote, control changes, gift, encore, crime, speed, the Ring and the monarch handle N). What is wrong with 3 or 4 seats, and the issue that fixes it:

| Finding | Where | Issue |
| --- | --- | --- |
| Latent `resolvePlayers(...)[0]` and `[0]` sites, none reachable from real card text | `amounts.ts`, `effects.ts`, `legality.ts`, `control-effects.ts` | #422 |

A battle's protector is now chosen by its controller among their living opponents (CR 310.9a, 310.12a; #415), and so is the opponent in "an opponent separates, chooses or copies" (Demonstrate, piles, Coin of Fate; #416, CR 608.2d, 801.5b), each asked only with more than one. "An opponent has N or less life" now ignores opponents who left the game (CR 800.4a; #417).

The combat data model already supports several defenders (each attacker stores its own target and defender, and `defending.ts` derives the defending player per creature, CR 508.5a); the defending players now declare blockers one after the other, each against the attackers aimed at them (CR 802.4; #414). Tests for annihilator, `reselectAttack`, goad and commander damage with 3 seats: #421. The AI was audited afterwards (next section); the UI and the view code were not.

## Audit of the AI (phase 3, #452)

About 40 places in `packages/ai/src` look up another seat. Wrong with several opponents (fix issue): the attack target is always the lowest-numbered living opponent and a lethal attack on another is missed, reproduced with the casual, greedy and heuristic agents (#479); the lethal checks mix the life of the weakest opponent with the poison and commander damage of the first (#480); player-targeted spells go to the first opponent (#481); the crack-back penalty and the block model assume one opponent (#483). The same with N: `evaluate`, `simAction`/`playOut`, `determinize` (it redeals the hidden cards of every other seat; `packages/ai/test/determinize-three-seats.test.ts`) and the answers of the vote, Ring, search and pile decisions. Not measured yet: the decision time with more permanents; `ai:arena --seats 3|4` (#482, arena decks only) is the tool for it.

## Phase 2 audit: the cards with 3 and 4 seats

The inventory ran the parser over the golden corpus and the precon snapshots (2,210 distinct cards, 2,169 supported). 483 supported cards have text that reads opponents or players (opponent, each player, monarch, vote, goad, myriad and similar); 104 were already in a 3-seat test, and the other 379 were grouped by the engine primitive they depend on and played with 3 and 4 seats, with a 1v1 control. Support is proven per primitive, so each group has one scenario per primitive and names the cards it stands for.

Result: one failure and three rulings, all settled since (#507, #508, #509).

- Failure, fixed (#506, #510): "each other opponent" also damaged the opponent the event was about, because `readsTriggerPlayer` did not know `eachOtherOpponent`. It happened with two seats as well.
- Needs a ruling (#507, #508, #509): the CR text was not available in the audit, so every rule number in it was UNVERIFIED. #507 was settled afterwards with the text of CR 800.4m (an effect that lasts until the next turn of a player who left lasts until that turn would have begun); #508 with the official rulings of Mindblade Render (Scryfall, source wotc, 2018-06-08), which the CR does not decide; #509 was fixed in #520.
- Passed: monarch, goad by Aura and by spell, "defending player", "target opponent" with two opponents, "for each opponent", opponent counts, each-opponent drain and damage, APNAP order of sacrifices, discards and "may" choices, tempting offers, gifts, myriad, encore, annihilator, emblems, and the opponents who left the game.
- Limits: part of the cards of each group were not in the corpus and ran with SYNTHETIC cost and power or toughness; a primitive that was read but not run (for instance a card whose text only repeats a tested primitive) counts as covered by reading, not by a test. The per-primitive notes and the scratch tests were not kept in the repository, so a card of the corpus is not guaranteed to have its own test.

## Cards not supported for more than one opponent

Support is one flag per card today, so a card here is marked supported in the golden corpus and is known not to work with 3 or 4 seats. 1v1 support is unchanged. Add a card with what fails and the issue that fixes it; delete the row when the fix is merged. The 3-seat re-test that fills this list is #420.

| Card | What fails with 3 or more seats | Issue |
| --- | --- | --- |
