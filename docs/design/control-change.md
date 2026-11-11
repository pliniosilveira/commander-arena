# Proposal: control-changing effects (layer 2), with Treasure Nabber as the first card

IMPLEMENTED in the Korvold slice 8a (D-189 engine, D-190 parser, `ENGINE_VERSION` 43, `PARSER_VERSION` 47), as the recommendation below says: the refactor first (the precon fingerprint unchanged), then the effect. Kept as the design record; where it and the code differ, the code and the decisions win. Differences, all in D-189: the trigger is a new kind, `tapsForMana`, not `tappedForMana` with `by: 'opponent'` (that one is the triggered mana ability of CR 605.1b); the AI needed no change; the stored `controller` is still the one the stack objects use.

Status before it was built: WAITING for the owner's approval. Gap class: S: the engine stores a permanent's controller as a field (`GameObject.controller`) that about 320 places in the rules read (counted on `main` at commit e011597 with `grep -rn "\.controller\b" packages/engine/src`, tests and fixtures excluded), and no effect can change it. `docs/ROADMAP.md`, "Deferred engine features, Layers", already lists layer 2 and the list of rules to revisit when control changes become possible. Source: the Korvold card list of 2026-10-29 (`docs/proposals/korvold-deck-analysis.md`); one card of the 45 (Treasure Nabber) needs it. Other decks of the owner may have more (Act of Treason and Control Magic effects are common in Commander): unmeasured here.

## What the card needs

Treasure Nabber: "Whenever an opponent taps an artifact for mana, gain control of that artifact until the end of your next turn." Two gaps: the trigger (`tappedForMana` exists only for `by: 'you'` and fixed mana, `docs/ROADMAP.md`, "Mana") and the gain-control effect with a duration. A Treasure is sacrificed as part of its cost, so the trigger can do nothing to it; it matters for artifacts such as Sol Ring.

## Rules (read with `pnpm rule`)

- CR 613.1b: layer 2, control-changing effects, applied after copy effects and before text-changing effects.
- CR 611.2b and 611.2c: a duration worded "for as long as" that is over before the effect would begin makes the effect do nothing; the set of objects a control-changing effect from a resolving ability affects is fixed when it begins.
- CR 302.6 (summoning sickness): a creature stolen cannot attack or use {T} abilities until it has been under its new controller's control since that player's most recent turn began.
- CR 110.2: the default controller of a permanent is the player under whose control it entered; an effect that puts an object onto the battlefield decides (110.2a).

## Engine design

1. A continuous effect `controlOf { objects, to, until }` stored like the existing `ContinuousEffect`s (timestamp, duration) and applied in `derive` as layer 2, before layer 4. `derive` already starts from the printed characteristics each time (CR 613.5), so the controller becomes a derived value read through one function, `controllerOf(state, object)`, instead of the stored field.
2. Replace the reads of `GameObject.controller` in the rules with that function (the large mechanical part). The stored field stays as the controller by entering (CR 110.2) and is what the stack object and the owner's checks use.
3. Durations: `untilEndOfYourNextTurn` (exists for play permissions, D-151) and `forAsLongAsYouControlThis` for this and for the Saga of There and Back Again.
4. The list in `docs/ROADMAP.md` to revisit: the Evoke sacrifice (702.74a), the Dash return (603.7d), Suspend haste, Echo's `cameUnderControlSinceLastUpkeep`, Unearth, the legend rule per controller, commander tax and the default controller of an object put onto the battlefield (110.2a). Add: summoning sickness (302.6, the `timestamp` field), triggered abilities that the old controller still has on the stack, mana abilities and `tappedForMana`, sacrifice choices, the legal attackers and blockers, the AI evaluator (a stolen permanent is not "mine" for long) and the view (a card shown on the other side).
5. The trigger: `tappedForMana` with `by: 'opponent'` and any permanent filter (extend the existing event).

## Parser

`effect.gain-control` ("gain control of that artifact until the end of your next turn", "...of target creature until end of turn", "...for as long as you control ~"), `trigger.taps-for-mana` for an opponent, and `duration.for-as-long-as`.

## AI and UI

- AI: no new decision. The evaluator and the combat code must read the derived controller (they use the view, so this follows from the engine change); the casual agent never plays an effect like this on purpose, and only the Nabber trigger reaches it.
- Web: a stolen permanent shows in the new controller's area with a "controlled by" badge; the log says "X gained control of Y"; the card preview names the duration.

## Risks

High for what is touched, not for what is added: the controller is read in a lot of places, and a wrong read is a rules bug in cards that are already supported (the nightly soak and the precon fingerprint, `tools/perf/precon-digest.ts`, are the checks that no existing game changes). The work is best done as a pure refactor first (the derived controller equals the stored one), with the precon fingerprint unchanged, and the effect added after.

## Alternatives

- Change the stored `controller` directly when the effect resolves and again when it ends: rejected, it is not layer 2 (it breaks when a copy or a second effect applies, CR 613.7 timestamps) and ending the effect needs a record anyway.
- Leave Treasure Nabber out of the deck: the cheapest option.

## What the owner has to approve

Build layer 2 for one card, or swap Treasure Nabber out. Recommendation: swap it out unless Control Magic and Act of Treason effects are wanted in other decks too (then the refactor pays for itself).
