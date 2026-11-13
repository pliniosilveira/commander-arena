/**
 * The Army of an amass (a `choosePermanent` with `purpose: 'amass'`, CR 701.47a, D-370): "Choose an Army creature you control. Put N +1/+1 counters on that
 * creature", asked when the agent controls two or more Armies; `legal` is every Army it controls. The counters stay on the Army chosen and the type an Army
 * becomes is the same whichever it is, so the casual rule is the simple one: the Army with the most power (the one that already gets through), then the most
 * toughness, the first of the list when they tie (the shape of `chooseSoulbondPartner`), so the answer is deterministic. The heuristic agent delegates to it. The
 * answer is always a member of `legal`, or empty when `legal` is.
 */
import type { Action, ChoosePermanentDecision, GameView } from '@commander-arena/engine';
import { findObject, isCreature, powerOf, toughnessOf } from './casual-view';

export function chooseAmassArmy(view: GameView, d: ChoosePermanentDecision): Action {
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
  // An Army the view cannot show as a creature is still a legal answer; with none shown, the first of the list is as good as any.
  const chosen = top ?? d.legal[0];
  return { kind: 'choosePermanents', objects: chosen === undefined ? [] : [chosen] };
}
