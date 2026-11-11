# Proposal: damage redirection (CR 614.9) and damage that stays, with Ancient Adamantoise as the first card

Status: APPROVED by the owner on 2026-11-02 (the order of a redirection and a prevention shield: follow CR 616.1, the player chooses; see below) and BUILT: the order in D-191, the redirect, `keepsDamage` and the parser lines in D-192 and D-193 (`ENGINE_VERSION` 45, `PARSER_VERSION` 48, branch `m59-adamantoise`). Gap class: P (a new replacement effect and a new static ability; no new decision kind, no new flow), but it is written as a proposal because it changes the one function through which all damage passes (`rules/damage.ts`, `dealDamage`), because the owner asked for the subtle rules of this card to be spelled out, and because it needs a rule for the order of a redirection and a prevention shield, which `docs/DECISIONS.md` D-156 left unbuilt (CR 616.1). Source: the Korvold card list of 2026-10-29 (`docs/proposals/korvold-deck-analysis.md`); one card of the 45 needs it.

## What the card needs

Ancient Adamantoise: "Damage isn't removed from this creature during cleanup steps." and "All damage that would be dealt to you and other permanents you control is dealt to this creature instead." (and Vigilance, ward {3} and a dies trigger that exile it and make ten tapped Treasure tokens, which the parser reads). The pipeline reports both lines `unrecognised`, closest rule `none`.

## Rules (read with `pnpm rule`)

- CR 614.9: redirection effects replace damage dealt to one battle, creature, planeswalker or player with the same damage dealt to another. If a permanent involved is no longer on the battlefield, or is no longer a creature (and so on) when the damage would be redirected, the effect does nothing; likewise for a player who left the game.
- CR 614.1a: an effect that says "instead" is a replacement effect; CR 614.5: a replacement effect doesn't invoke itself repeatedly; it gets only one opportunity to affect an event or the modified events that replace it. That is what stops two such creatures from redirecting the same damage forever.
- CR 616.1: if several replacement and/or prevention effects try to modify the same event, the affected object's controller (here: the player, or the controller of the permanent) chooses the order. D-156 says the engine never asks this; it orders "would die" replacements oldest first and shields oldest first after "prevent all".
- CR 120.3 and 120.3a to 120.3g: the results of damage depend on the recipient and on the source. So redirected damage is dealt by the same source (deathtouch, lifelink, wither, infect and toxic of the source apply) to the new recipient (marked damage or -1/-1 counters on the Adamantoise, not life loss or poison for the player).
- CR 510.2: combat damage that has been assigned is dealt simultaneously; the assignment (trample, lethal damage to blockers, CR 702.19b) is made for the original recipients, the redirect happens as the damage is dealt.
- CR 514.2: at cleanup, simultaneously, all damage marked on permanents is removed and all "until end of turn" and "this turn" effects end. The static ability of the card only stops the first part for this creature.
- CR 903.10a: commander damage counts damage dealt to a player by a commander; redirected damage is not dealt to the player, so it does not count.

## Owner decision (2026-11-02): follow CR 616.1 and let the player choose the order

The owner chose the rules-exact behaviour for the order of a redirection and a prevention shield: when several replacement or prevention effects apply to the same damage, the affected player chooses the order (CR 616.1), and the engine asks. If a fixed default is ever needed (the AI's answer, a test), prevention first and then the redirection ("prevent first makes more sense"). This lifts the hold of D-156 for damage events: the damage pipeline gets a general "order the replacement and prevention effects" decision, asked only when two or more effects apply to one event and their order can change the result (one applicable effect, or effects that commute, ask nothing). It is built generically so that the other pipelines that apply replacement effects in a fixed order today (the "would die" replacements) can use it later without a new design; moving them is not part of the Adamantoise slice. The design below (section "Engine design", point 3) is replaced by this decision; the detailed design (which effects are collected and when the question is skipped, the `chooseOption` purpose `'replacement'`, the pause before damage is dealt, the AI answers, the web dialog, replay, the migration of D-156 and the steps) is `docs/proposals/damage-replacement-order.md`.

## Engine design

1. `Replacement` gets `redirectDamage { recipients, to: 'this' }`: `recipients` names the controller (the player "you") and a filter of the permanents ("other permanents you control"). It is a static ability of a permanent on the battlefield, read from derived abilities.
2. `dealDamage` (the one function for all damage): before `applyShields`, look for redirect effects whose recipients match `to`; apply the oldest first, each at most once per damage event (CR 614.5), skipping one whose new recipient is the original recipient or is not a creature on the battlefield (CR 614.9). Then call the rest of the function with the new recipient, so shields on the new recipient, lifelink, deathtouch and the results of CR 120.3 are those of the Adamantoise. A `damageRedirected` event names source, original and new recipient and amount.
3. Order against prevention shields on the original recipient: **decided by the owner (2026-11-02): CR 616.1, the affected player chooses, see `docs/proposals/damage-replacement-order.md`.** The options that were weighed: The deterministic options: (a) redirect first, then the shields of the new recipient apply (a shield "prevent the next 3 damage to you" never sees the damage), or (b) shields on the original recipient first, then the remainder is redirected. CR 616.1 gives the choice to the affected player, who would pick whichever is better for them; neither fixed order is always that choice. Recommendation: (a), recorded in a `D-` entry and on the known-deviations row of D-156.
4. A static ability `keepsDamage` ("damage isn't removed from this creature during cleanup steps"), read in `afterDiscard` (`rules/flow.ts`): damage and the deathtouch flag stay on the creature, the "until end of turn" effects still end.
5. `validateCard` accepts the replacement only on a battlefield permanent and only with `to: 'this'`; features are added to `SUPPORTED_FEATURES`.
6. What it does not cover (stays refused): redirection to another player's creature, "the next time damage would be dealt" shields (CR 615.8), a redirect of damage to a planeswalker (the engine has none).

## Parser

`replacement.redirect-damage` ("All damage that would be dealt to you and other permanents you control is dealt to ~ instead."), `static.keeps-damage` ("Damage isn't removed from ~ during cleanup steps."). Both lines are specific; the rules are general over the recipients filter and the subject, with `examples` and `rejects`.

## AI and UI

- AI: no new decision. The heuristic agent's attack evaluation reads whether an attack kills a blocker or deals damage to a player; with a redirect in play it overrates attacks at the player. A small rule (an attack at a player with a redirect in play counts as an attack at the redirect creature) is the first-version answer; the agent plays forward on the real state, so what it simulates is right.
- Web: a log line "N damage to X redirected to Y" (`apps/web/src/game/describe.ts` has an exhaustive switch on events), the damage marked on the Adamantoise shown across turns (the view already shows marked damage).

## Risks

- The single damage function makes the hook easy to place; the risk is in what calls it before the recipient is known (combat assignment, `dealDamageWithExcess`, divided damage, fights): each must be tested with a redirect in play.
- Rules subtlety: two redirect creatures, a redirect plus a prevention shield, damage to the Adamantoise itself (no redirect, "other"), damage from deathtouch sources, infect sources, a commander's damage, damage after the Adamantoise left the battlefield in response, lethal damage accumulating over turns. Each needs a scenario test; the CR text above is what to test against, and Scryfall rulings (owner-side, the sandbox cannot reach Scryfall) should be checked for the points CR 614.9 leaves open.
- Honesty: until the order against shields is decided, a card must stay unsupported rather than guess.

## Alternatives

- Treat the redirect as a prevention shield plus a second damage event: rejected, prevention is not replacement and the "dealt by the same source" results would differ.
- Leave Ancient Adamantoise out of the deck (the owner may swap it).

## What the owner has to approve

(1) That this card is worth the damage-function change, or swap it out. (2) The order of a redirection and a prevention shield: decided (3. above); the design of the question is `docs/proposals/damage-replacement-order.md`, whose open questions need answers. Recommendation: do it after the cheaper slices, or swap it.
