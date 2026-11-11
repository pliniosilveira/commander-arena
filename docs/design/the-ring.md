# Proposal: the Ring tempts you (CR 701.54), with There and Back Again as the first card

Status: IMPLEMENTED in the Korvold slice 8c (D-196 engine, D-197 parser, `ENGINE_VERSION` 47, `PARSER_VERSION` 50); the owner approved all the Korvold slices and the proposals were presented to them, so the card was built, not swapped out. Gap class: S: it adds a player-level emblem that the engine has no object for, a permanent designation, a continuous legendary and evasion effect, and four levels of triggered abilities that belong to the player, not to a card. Source: the Korvold card list of 2026-10-29 (`docs/proposals/korvold-deck-analysis.md`); one card of the 45 (the Saga There and Back Again, chapter I) needs it. The value beyond this card is unmeasured here (no bulk file in the repository).

## What the card needs

There and Back Again: chapter I "Up to one target creature can't block for as long as you control this Saga. The Ring tempts you." Chapters II and III are read by the parser already except the named legendary token of III, which is a separate parser gap (the first slice of the analysis). Chapter I needs both the Ring and the duration "for as long as you control this Saga" (a continuous restriction that ends when the Saga leaves or changes controller; `docs/ROADMAP.md`, "Layers": "for as long as" durations do not exist).

## Rules (read with `pnpm rule 701.54`)

- 701.54a: each time the Ring tempts you, choose a creature you control; it becomes your Ring-bearer until another creature becomes your Ring-bearer or another player gains control of it.
- 701.54b: Ring-bearer is a designation, not a copiable value.
- 701.54c: if you have no emblem named The Ring, you get one first. The Ring has: your Ring-bearer is legendary and can't be blocked by creatures with greater power; from two times tempted, whenever your Ring-bearer attacks, draw a card, then discard a card; from three, whenever your Ring-bearer becomes blocked by a creature, that creature's controller sacrifices it at end of combat; from four, whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life.
- 701.54d: "Whenever the Ring tempts you" triggers even if the actions were impossible. 701.54e: "is your Ring-bearer" is true only for a creature on the battlefield under your control with the designation.

## Engine design

1. State: `Seat.ring: { tempted: number }` (the emblem is a record on the seat, not a command-zone object: the engine has no emblem objects, and an emblem has no characteristics that anything else reads) and `GameObject.ringBearer?: true`.
2. Effect `ringTempts` (a keyword action): increments `tempted`, then asks a `choosePermanent` decision (new purpose `ringBearer`) among the creatures the player controls (none: only the counter moves, CR 701.54d); sets the designation and clears the previous one.
3. `derive`: while the designation holds, layer 4 adds the legendary supertype and the creature cannot be blocked by creatures with greater power (the existing `cantBeBlockedBy` hook, with a power comparison against the bearer). The legend rule already applies to derived supertypes.
4. The three triggered abilities of the emblem are player-level triggers read from `seat.ring.tempted`: attack (loot), becomes blocked (sacrifice at end of combat, a delayed trigger), combat damage to a player (life loss). They reuse the trigger collection of `rules/triggers.ts` with a player source.
5. Trigger kind `ringTempted` for "Whenever the Ring tempts you".
6. Interactions to test: the bearer leaves the battlefield or changes control (control change is its own proposal, `docs/design/control-change.md`), a second tempt choosing the same creature, no creature to choose, the Ring in a copy of the game state (hash, determinize).

## Parser

`effect.ring-tempts` ("The Ring tempts you."), `trigger.ring-tempts`, `condition.ring-bearer` ("if you control your Ring-bearer" and similar), and, for the Saga, `duration.for-as-long-as-you-control-this` (shared with other cards, see the analysis).

## AI and UI

- AI: a handler for `choosePermanent` with purpose `ringBearer` (pick the creature with the best evasion value, for the casual agent the highest-power creature).
- Web: show "The Ring" as a small panel next to the player's area with the number of times tempted and the four lines turned on or off; a badge on the Ring-bearer in the battlefield and the preview; a dialog to choose the bearer; log lines.

## Risks

Medium. State and view gain a field, the legendary and evasion effects touch `derive` and block legality, and the emblem triggers need player-level sources. The designation is lost when control changes, which only matters once control-changing effects exist.

## Alternatives

- Make the Ring an object in the command zone: rejected, it needs a new object kind with no use elsewhere.
- Leave the card out of the deck: the cheapest option; this is one card and the only one in the list that needs the Ring.

## What the owner has to approve

Build the Ring for one card, or swap There and Back Again out. Recommendation: swap it out unless more Ring cards are expected in other decks.

## What was built (D-196, D-197)

The design above was followed, with these differences, all recorded in D-196: `GameObject.ringBearer` holds the player whose Ring-bearer the creature is (`SeatId`, not `true`), because the designation ends when another player gains control and must not come back with the control; the Ring's three triggered abilities are inherent abilities with no source like the monarch's (`rules/ring.ts` `findRingTriggers`, `rules/inherent.ts`), and the sacrifice of the third is an engine-only effect `delayedSacrifice` with the new `sacrifice { byController }` (the blocker's controller sacrifices it); "for as long as you control this Saga" is the duration `forAsLongAsYouControlThis` of `restrict`, on the end `whileControlling` of D-189; the condition is `controlsRingBearer` (a `ObjectFilter` field for "target Ring-bearer" was not built, no card needs it). The recommendation "swap it out" was not taken: the owner approved the slice.
