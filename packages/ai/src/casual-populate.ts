/**
 * The creature token of a populate (a `choosePermanent` with `purpose: 'populate'`, CR 701.36a, D-625): "Choose a creature token you control and create a token that's a copy of
 * it", asked when the agent controls two or more creature tokens; `legal` is every creature token it controls. The copy is as good as the token copied, so the casual rule is the
 * simple one: the token with the most power plus toughness, then the most power, the first of the list when they tie, so the answer is deterministic. The heuristic agent
 * delegates to it. The answer is always a member of `legal`, or empty when `legal` is.
 */
import type { Action, ChoosePermanentDecision, GameView } from '@commander-arena/engine';
import { findObject, powerOf, toughnessOf } from './casual-view';

export function choosePopulateToken(view: GameView, d: ChoosePermanentDecision): Action {
  let top: ChoosePermanentDecision['legal'][number] | undefined;
  let topSize = Number.NEGATIVE_INFINITY;
  let topPower = Number.NEGATIVE_INFINITY;
  for (const id of d.legal) {
    const o = findObject(view, id);
    if (o === undefined) continue;
    const power = powerOf(o);
    const size = power + toughnessOf(o);
    if (size > topSize || (size === topSize && power > topPower)) {
      top = id;
      topSize = size;
      topPower = power;
    }
  }
  const chosen = top ?? d.legal[0];
  return { kind: 'choosePermanents', objects: chosen === undefined ? [] : [chosen] };
}
