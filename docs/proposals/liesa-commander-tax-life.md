# Proposal: Liesa, Shroud of Dusk replaces commander tax with life

Status: APPROVED by the owner on 2026-11-17. Gap class: S — this changes the command-zone casting cost and life payment path, which is shared by every commander spell. Card data: issue #255's owner-provided acceptance record in `packages/cards/test/fixtures/corpus/golden.jsonl`. The local Comprehensive Rules text and Scryfall rulings were unavailable; this proposal uses the existing engine model and cites only the rules already referenced by repository code.

## What the card needs

Liesa, Shroud of Dusk says: “Rather than pay {2} for each previous time you've cast this spell from the command zone this game, pay 2 life that many times.” Her other abilities already parse. When she is the designated commander and is cast from the command zone, this replaces the usual {2} per prior command-zone cast with 2 life per prior cast. It does not replace her printed mana cost or other additional costs.

## Existing engine behavior

- `GameState.commanderCasts` tracks command-zone casts per physical card.
- `spellCost` in `packages/engine/src/rules/cast-cost.ts` currently adds two generic mana symbols for each prior command-zone cast.
- `toPayment` in `packages/engine/src/rules/cast.ts` already pays life costs at the total-cost step and restores the casting snapshot if the cast is cancelled.
- The card view exposes a mana-only `commanderTax` value, so replacing tax also needs a clear UI and view representation.

## Proposed design

1. Store the parsed replacement amount as `CardFace.commanderTaxLife`. Apply it only when that card is a designated commander and is cast from the command zone. Do not match the card name in engine code.
2. At total-cost determination, use the tracked prior-cast count once: omit the corresponding {2} commander-tax symbols and add 2 life for each prior cast to the spell's existing life cost.
3. Preserve all other cost components and order: printed or alternative mana cost, additional costs, reductions, and the existing cost-payment stages. If the player cannot pay the life, the spell is not cast.
4. Show both the remaining commander-tax mana and replacement life amount in the cast-cost view and prompt. At zero previous casts, neither cost is added.
5. Parse the exact “Rather than pay {2} for each previous time ... pay 2 life that many times” wording and reject changes in zone, subject or amount.

## Tests and checks

- Cost tests: zero prior casts; one and multiple prior casts; insufficient life; other additional life costs; cost reductions do not reduce the life replacement; the card is not the designated commander; the card is cast from another zone.
- Scenario test: cast Liesa from the command zone with a prior cast, verify life is paid instead of tax mana, then verify the cast count increments only after the cast completes.
- Parser and golden tests: the exact real card is fully supported, while near misses are rejected.
- View and web tests: the cast prompt names the life amount and any remaining mana cost clearly.
- Run focused tests, typecheck, lint, build and the PR test tier before opening or updating a pull request.

## Scope and risks

This is more than a parser grammar rule: the generic command-tax calculation, cost state, cast view and user-facing payment description must agree. A wrong implementation could charge both costs, let cost reductions modify the life payment, or lose the replacement when the cast is cancelled. The implementation must remain deterministic and use the existing `commanderCasts` record as the sole count.

Approved for implementation. The implementation records the life replacement separately from mana tax so the view, payment prompt, and cast event can report it clearly.
