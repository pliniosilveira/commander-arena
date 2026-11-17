# Proposal: Activated abilities of emblems (Ob Nixilis of the Black Oath)

Status: APPROVED. Gap class: S — emblems already work from the command zone for static and triggered abilities, but activating an ability from a nonpermanent command-zone object changes shared activation legality, costs, and stack behavior. Card data: issue #255's owner-provided acceptance record in `packages/cards/test/fixtures/corpus/golden.jsonl`. The local Comprehensive Rules text and Scryfall rulings were unavailable.

## What the card needs

Ob Nixilis's ultimate gives its controller an emblem with “{1}{B}, Sacrifice a creature: You gain X life and draw X cards, where X is the sacrificed creature's power.” The engine already represents emblems in the command zone, keeps their abilities, and reads `sacrificedCost` values from last-known information. The missing path is activation of an emblem's granted ability.

## Proposed design

1. Permit a supported activated ability carried by an emblem in the command zone to be activated by that emblem's controller. The emblem remains the source; no permanent or card object is created or moved.
2. Reuse ordinary activation legality, mana payment, sacrifice choice, stack resolution and event ordering. The emblem's command-zone source is exempt from battlefield-source checks, while the sacrifice cost still requires a creature the activator controls.
3. Parse the emblem's quoted activated ability using the ordinary activated-ability grammar. Preserve the sacrificed creature as `sacrificedCost` so both life gained and cards drawn use its last-known power after it leaves the battlefield.
4. Keep static and triggered emblem abilities on their existing paths. Unsupported activated cost or effect forms remain unsupported.

## Tests and checks

- Engine scenario: create the emblem, activate with a mana source and multiple creature choices, verify the chosen creature is sacrificed, then gain and draw equal to its power.
- Edge cases: no eligible creature, insufficient mana, cancellation, a creature whose power changes before resolution, and the emblem remaining in the command zone.
- Parser and golden tests: Ob Nixilis's entire text parses; the emblem's ability is activated, not interpreted as an ability of the planeswalker.
- Run focused tests, typecheck, lint, build and the PR test tier before opening or updating a pull request.

## Scope and risks

The activation source is a command-zone object with no card id and no permanent characteristics. The implementation must keep controller, source identity, response timing, sacrifice legality, and the saved last-known power consistent across that nonpermanent source path. Approval requested before implementation.
