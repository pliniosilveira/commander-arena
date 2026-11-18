# Engine decisions

Entries keep their old numbers (see `README.md`).

## Architecture

- **D-001 Two-phase event pipeline.** Every state change is proposed, run through the applicable replacement and prevention effects (the affected player orders them when several apply), then committed and emitted. Primitives propose, they do not mutate.
- **D-002 Priority is a decision kind.** The engine always waits on exactly one `PendingDecision` for one seat; having priority is a decision kind. Each consumer (UI, AI) handles every kind in a `Record<DecisionKind, Handler>`, so a new kind fails compilation until handled.
- **D-003 Casting is a transaction with a snapshot.** Starting a cast or activation stores a `CastingContext` and a pre-cast snapshot; cancel and rewind restore the snapshot. **D-039:** a restore keeps the current `actionCount`; tests that compare positions use `positionHash`.
- **D-004, D-038, D-283 Last-known information.** Zone changes record LKI and a moved object ceases to exist (`moveObject` deletes it, LKI goes to `lki`); trigger detection runs against the pre-event state; permanents that leave together are recorded as the event began. Resolution skips an instruction whose object is gone (CR 608.2b-c).
- **D-005 Mana objects carry restrictions.** The pool holds typed mana (color, snow, source, optional spend restriction) and the payment planner respects them.
- **D-006 Immutable state with structural sharing.** Updates share unchanged subtrees; derived characteristics are cached per state version. **D-173:** results are cached only where the answer is a pure function of values never changed in place, keyed by their identity (`WeakMap`).
- **D-014 Game end for any number of seats.** If every remaining player loses at once it is a draw; losing players leave per CR 800.4a.
- **D-025, D-026 One mutation path, replay by log.** Manual adjustments are an action kind, logged like any other. A game is its seed, decklists, settings and action log; loading replays it and a version mismatch is refused (the app offers no save, load or replay export, D-165, but `replayGame` stays).
- **D-041, D-042 Combat is validated, not enumerated; only real choices are decisions.** Attack, block and damage-assignment answers are validated by the same legality code that builds the candidates; `legalActionsForDecision` lists a representative subset. Damage the controller cannot influence is assigned automatically; an `assignDamage` decision appears only for an attacker blocked by two or more creatures or a trampler with excess (CR 510.1c, 702.19b).
- **D-059 Triggers are found in the event stream of each batch** and wait in `GameState.pendingTriggers` until they go on the stack; every call that gives priority passes its events. A batch is replayed in order over the battlefield as it was before it.
- **D-130 The engine stays one unit.** Rules interact, so they are not loaded per deck; per-deck loading applies to data (card definitions, precon snapshots, images). Revisit if the worker bundle passes 500 kB gzipped.
- **D-189 Who controls a permanent is derived.** Read it with `controllerOf(state, obj)` (layer 2), never from `GameObject.controller`; `test/control-reads.test.ts` enforces it.
- **D-277 Meld:** one permanent on the battlefield, two cards in every other zone; every read that must see both cards goes through `rules/melded.ts`. **D-285 Soulbond pairs** are a designation on two creatures read only through `rules/pairing.ts`. **D-308 Face-down permanents** are a designation (`GameObject.faceDown`) read only through `rules/face-down.ts` (layer 1b). Each has a test that fails when a rule reads the field directly.
- **D-312 Hidden information of face-down permanents.** The view masks name, commander status, support and faces for everyone but the controller; `face-down-hidden.test.ts` plays a game twice with only the hidden cards differing and requires identical views and events, and every `ObjectView` field and `GameEvent` kind must be classified there.
- **D-305 "An opponent"** means the first opponent in turn order still in the game.
- **D-288 Automatic payment** taps the least flexible mana first (sources that could have made fewer colors go first) and keeps the colors the hand needs.
- **D-221, D-222 The player chooses** the order of two replacement effects of token creation and the permanent a mana ability sacrifices when there is more than one.

## Known deviations from the CR

These are deliberate and recorded in `docs/RULES_COVERAGE.md` and `docs/ROADMAP.md`. A card whose outcome they would change must not be marked supported.

- **D-156 Replacement-effect ordering (CR 616.1)** is not built in general: the engine keeps fixed orders. Two competing replacements for one event (a doubler and an adder of counters, two numeric shields, two "would die" replacements) can give a wrong outcome.
- **D-159 Layer dependency (CR 613.8)** is partial: the keyword-reading cases a supported card reaches are handled; loops and type chains are not.
- **D-160 Look back in time (CR 603.10a)** across separate steps of one resolution is read as one run of departures, so "destroy target creature. Then destroy another" can give a watcher too much information.
