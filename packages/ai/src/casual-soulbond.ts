/**
 * The partner of a soulbond creature (a `choosePermanent` with `purpose: 'soulbond'`, CR 702.95a, D-984): "you may pair this creature with another unpaired
 * creature you control". `legal` is every creature the agent may pair it with, `min` is 0 (choosing none is the "may") and `max` is 1.
 *
 * Pairing costs nothing and what a pair gives is only upside, but a creature that is paired cannot be paired again while it stands (CR 702.95d), so a poor partner
 * early can keep a better one from the bond later. The casual rule is the simple one: always pair when there is a creature to pair with, and pick the creature with the
 * most power, then the most toughness, the first of the list when they tie (the shape of `chooseRingBearer`), so the answer is deterministic. The heuristic agent
 * delegates to it; a version that weighs what the pair gives and whether a better partner is likely to come is in `docs/ROADMAP.md`. The answer is always a member
 * of `legal`, or empty when `legal` is.
 */
import type { Action, ChoosePermanentDecision, GameView } from '@commander-arena/engine';
import { findObject, isCreature, powerOf, toughnessOf } from './casual-view';

export function chooseSoulbondPartner(view: GameView, d: ChoosePermanentDecision): Action {
  let top: ChoosePermanentDecision['legal'][number] | undefined;
  let topPower = Number.NEGATIVE_INFINITY;
  let topToughness = Number.NEGATIVE_INFINITY;
  for (const id of d.legal) {
    const o = findObject(view, id);
    if (o === undefined || !isCreature(o)) continue;
    const power = powerOf(o);
    const toughness = toughnessOf(o);
    if (power > topPower || (power === topPower && toughness > topToughness)) {
      top = id;
      topPower = power;
      topToughness = toughness;
    }
  }
  // A candidate the view cannot show as a creature is still a legal answer; with none shown, the first of the list is as good as any.
  const chosen = top ?? d.legal[0];
  return { kind: 'choosePermanents', objects: chosen === undefined ? [] : [chosen] };
}
