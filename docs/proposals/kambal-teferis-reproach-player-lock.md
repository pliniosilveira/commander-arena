# Proposal: Teferi's Reproach player lock and mass phasing

Status: AWAITING OWNER APPROVAL. Gap class: S — one spell combines a player-wide prohibition on life-total changes, protection from everything for a bounded duration, and phasing a group of permanents without targeting each one. Card data: issue #255's owner-provided acceptance record in `packages/cards/test/fixtures/corpus/golden.jsonl`. The local Comprehensive Rules text and Scryfall rulings were unavailable.

## What the card needs

Teferi's Reproach chooses a target opponent. Until that player's next turn, they gain protection from everything and their life total cannot change. Then all nonland permanents they control phase out. The engine already has permanent phasing, temporary continuous effects and some player-protection effects, but not the full combination or the life-total lock.

## Proposed design

1. Add a temporary player effect that gives the chosen opponent protection from everything through the beginning of their next turn, using one protection gate for targeting and damage prevention.
2. Add a player life-total lock read by every life-change path: gaining life, losing life, damage, paying life, exchanges and setting totals. A locked total stays fixed; no caller should special-case this spell.
3. Extend the phase-out effect to select all matching permanents controlled by the chosen player. Read the set as the instruction resolves and phase out all nonland permanents together, with attached permanents following the existing phasing rules.
4. Parse Teferi's exact spell text into the shared player-effect, life-lock and mass-phasing primitives. Keep target legality and the effect's resolution order explicit.

## Tests and checks

- Engine scenario: protect the chosen opponent from all targets and damage, attempt each class of life-total change, and verify nonland permanents they control phase out while lands remain.
- Duration: verify the protection and life lock remain through the opponent's preceding turn and end at the specified next-turn boundary.
- Parser and golden tests: Teferi's Reproach is fully supported; nonland permanents phase out as one effect after the target is chosen.
- Run focused tests, typecheck, lint, build and the PR test tier before opening or updating a pull request.

## Scope and risks

Protection, life-total changes and phasing have different rules paths. Their timing and scope must agree: the lock persists until the specified turn, while the mass phasing happens once on resolution. Approval requested before implementation.
