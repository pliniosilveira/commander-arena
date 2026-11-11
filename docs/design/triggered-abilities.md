# Design: triggered abilities, with Korvold, Fae-Cursed King as the first card

IMPLEMENTED. Slice S2, built as D-059 to D-061 (triggers in the event stream, the `choosePermanent`, `orderTriggers` and `confirmOptional` decisions, sacrifice and tokens); `docs/MECHANICS.md`, "Triggered abilities", is the reference. Kept as the design record.

Status: APPROVED by the owner on 2026-10-21 ("approved" to the slice plan in `scaling-card-support.md`, which names this proposal as slice S2). Gap class: S (subsystem) for triggers, P (primitive) for the sacrifice choice and the sacrifice event, K for nothing (flying already runs). Source: `card-requests/done/2026-10-21-korvold-fae-cursed-king.json`, raised by the owner after importing a deck. This is the core of milestone M5; Korvold becomes its first acceptance card, ahead of the spec's scenario tests 18 to 20.

## What the card needs

Oracle text (from the request, as Scryfall sent it): "Flying / Whenever Korvold enters or attacks, sacrifice another permanent. / Whenever you sacrifice a permanent, put a +1/+1 counter on Korvold and draw a card."

| Need | Today | Gap |
| --- | --- | --- |
| Flying | runs (M2) | none |
| "Whenever ~ enters or attacks" | the AST names `entersBattlefield` and `attacks` triggers, but `SUPPORTED_FEATURES.triggerKinds` is empty and the engine has no trigger machinery | **S**: detect triggers from the event stream, queue them, put them on the stack in the right order |
| "sacrifice another permanent" (the controller chooses, may be forced to sacrifice a good permanent, may be Korvold's own other lands) | a `sacrifice` effect exists but its selector is `this` or a fixed filter | **P**: a choose-permanent decision (a new `PendingDecision` kind, so the UI and AI handlers fail to compile until they answer it) |
| "Whenever you sacrifice a permanent" | no event | **P**: a `sacrificed` event, emitted by every sacrifice (CR 701.21), and a `permanentSacrificed` trigger kind |
| "put a +1/+1 counter on ~ and draw a card" | `addCounters` and `draw` effects run | none |

## Rules to implement (read with `pnpm rule`)

- CR 603.2 (a trigger event makes the ability trigger), 603.3 and 603.3b (triggered abilities go on the stack the next time a player would receive priority; APNAP order, each player orders their own), 603.3c to 603.3d for targets, 603.4 for "intervening if" (not needed for Korvold), 603.6 (leaves-the-battlefield and enters triggers look at the object as it was, CR 603.10 and last-known information, which the engine already keeps).
- CR 701.21 (Sacrifice): moving a permanent you control to its owner's graveyard; a player cannot sacrifice what they do not control.
- CR 603.7 does not apply. Korvold's two abilities are independent triggers.

## Engine work

1. `rules/triggers.ts`: after every state change, scan the new events against the triggered abilities of objects on the battlefield (and, for enters triggers, the object that just entered, using the new object's abilities, CR 603.6a); collect `PendingTrigger { source, controller, ability, eventContext }`.
2. In `grantPriority`, before a player would receive priority (and after state-based actions, CR 117.5), put pending triggers on the stack: one `PendingDecision` of a new kind `orderTriggers` when a player controls several triggers that are not identical (A18 says identical ones are ordered automatically), then push in APNAP order. Stack objects of kind `ability` already exist in `StackData`.
3. Resolution runs the ability's effect through the existing instruction queue. `sacrifice another permanent` becomes `choosePermanent` (new decision kind), with the legal set computed by the engine (every permanent the controller controls except the source). If there is exactly one candidate it is chosen automatically, and if there is none the effect does nothing (CR 608.2d).
4. `sacrificed` events: every sacrifice, from effects and later from costs, emits `{ kind: 'sacrificed', permanent, controller }` after the zone change; the trigger `permanentSacrificed` matches it (with "you" meaning the sacrificing player).
5. `SUPPORTED_FEATURES` gains `triggerKinds: ['entersBattlefield', 'attacks', 'permanentSacrificed']` and the effect selectors it needs, in the same change that tests them (D-007).
6. UI: a dialog for `choosePermanent` (click a permanent, confirm) and for `orderTriggers`, both through `handleDecision` so nothing is forgotten; the log describes triggers and sacrifices; the stack panel already shows ability objects.
7. AI: `RandomLegalAgent` and `CasualAgent` answer the two new decisions (the casual agent sacrifices its least valuable permanent: a land it does not need, a token, then the lowest mana value).

## Grammar work (M4 framework, rules in `convert/parser/rules/`)

New rule ids: `trigger.enters-or-attacks`, `trigger.sacrifice-permanent`, `effect.sacrifice-another-permanent`, `effect.add-counter-self`, `effect.draw` and the connector "and" between effects. The two Korvold abilities must parse completely, with the diagnostics of the old text still captured in `card-requests/` as a regression. `PARSER_VERSION` goes to 2, which recomputes every cached support report.

## Tests first

1. Scenario: Korvold enters, its controller must sacrifice another permanent; with one other permanent the choice is automatic; with none, nothing happens.
2. Scenario: sacrificing a permanent puts a +1/+1 counter on Korvold and draws a card; Korvold's own enters ability sacrifices a permanent, so that sacrifice triggers the second ability (the counter and the card arrive after the first trigger resolves). The expected power and toughness come from the stored card data, not from this document.
3. Scenario: attacking triggers the sacrifice again; two Korvolds trigger each other's second ability in APNAP order (rule 603.3b scenario 18).
4. Scenario: a triggered ability on the stack can be responded to and the source leaving the battlefield does not stop it (CR 113.7a, last-known information).
5. Property and soak tests keep passing with the two new decision kinds; the 100-game tests include a deck with Korvold.
6. Parser: both abilities parse; the card goes `supported` and passes `validateCard`.

## Risks and what this does NOT include

- Triggers are the largest single piece of M5. Doing only enters, attacks and sacrificed keeps the first slice small, and the grammar and engine nodes are written so dies, landfall, upkeep and cast triggers follow without new machinery.
- Cards with triggers that need targets or "may" choices stay unsupported until those slices land.
- Not included: replacement effects, layers (needed for the +1/+1 counter display of a modified creature: counters are already applied in layer 7c by `derive`), activated abilities.
