# Life-gain replacement ordering

Status: approved by the owner and implemented as D-588.

## Context

Issue #255 includes Rhox Faithmender and The Wind Crystal. Both replace a life-gain event with twice that much life. The engine currently supports a life-gain replacement that adds a fixed amount (`lifeGainBonus`; D-149). An additive replacement and a doubling replacement do not commute, so applying both in a fixed engine order can produce the wrong result.

The Comprehensive Rules source text was not attached in this session, so the exact applicable rule text could not be checked. The existing code and docs identify replacement-effect ordering as CR 616.1; no new rule text was copied.

## Proposed design

Treat a life-gain event as a replacement sequence. Find the applicable effects, let the affected player choose which one to apply when more than one applies and the choice changes the event, apply the selected effect once, then recompute applicability against the modified event. Continue until no replacement applies, then commit one gain event. The sequence must preserve current `cantGainLife` behavior and current additive replacement behavior.

This requires an interruptible engine flow: the current `gainLife` helper is synchronous, while the ordering question must be represented as a pending decision and resumed through the ordinary action path. The UI and both AI decision handlers need the new purpose, and replay/state hashing must preserve it deterministically. No parser-only representation or fixed ordering is sufficient.

## Verification

- One additive replacement and one doubling replacement on the same player; each possible order produces its correct total.
- Multiple effects with the same result do not ask for a meaningless choice.
- Each replacement applies at most once to the event, including when its own result still matches.
- A forbidden life gain produces no replacement choice and no life-gain event.
- Human UI and both AI policies handle the pending choice; lifelink combat resumes after the choice.
- Focused checks: `pnpm test:focus -- packages/engine/test/scenario-xx-life-gain.test.ts packages/engine/test/scenario-xx-combat-lifelink.test.ts packages/cards/test/convert-grammar-engine-life-gain-double.test.ts packages/cards/test/parser-registry.test.ts packages/ai/test/damage-order-agents.test.ts apps/web/test/damage-order-render.test.tsx packages/cards/test/golden.test.ts`.

## Scope

The change unlocks the two life-doubling replacements in issue #255 and provides the general ordering primitive for other life-gain replacements. It does not add card-name-specific behavior. No implementation or rule citation is committed before approval and CR verification.
