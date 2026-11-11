/**
 * The answers to a crew question that `legalActionsForDecision` lists (CR 702.122a). The engine
 * accepts every subset of `legal` whose total power reaches `minTotalPower`, but they cannot all be
 * listed, so the list holds the subsets that are enough as soon as their last creature is added,
 * taking the most powerful creatures first: the answers that tap the fewest creatures come first.
 * It works from the decision alone (`powers` says what each creature's power is), like every other
 * decision's list, so the AI and the UI need no state to build it.
 */
import type { ObjectId } from '../ids';
import type { Action } from '../state/actions';
import type { ChoosePermanentDecision } from '../state/decisions';

/** Longest list of crew answers built for one decision. */
const MAX_CREW_CHOICES = 500;

/** Subsets of the creatures in `d.legal` that have enough total power, as `choosePermanents` actions. */
export function crewChoices(d: ChoosePermanentDecision): Action[] {
  const need = d.minTotalPower ?? 0;
  const powers = d.powers ?? {};
  // A creature with no power never helps reach the total, so it is not part of a listed answer.
  const items = d.legal
    .map((id, index) => ({ id, index, power: powers[id] ?? 0 }))
    .filter((item) => item.power > 0)
    .sort((a, b) => b.power - a.power || a.index - b.index);
  // reachable[i]: the most power the items from i on can add.
  const reachable: number[] = new Array(items.length + 1).fill(0);
  for (let i = items.length - 1; i >= 0; i -= 1) {
    reachable[i] = (reachable[i + 1] ?? 0) + (items[i]?.power ?? 0);
  }
  const out: Action[] = [];
  const chosen: { id: ObjectId; index: number }[] = [];
  const walk = (start: number, sum: number): void => {
    if (sum >= need && chosen.length > 0) {
      const objects = [...chosen].sort((a, b) => a.index - b.index).map((c) => c.id);
      out.push({ kind: 'choosePermanents', objects });
      return;
    }
    for (let i = start; i < items.length; i += 1) {
      const item = items[i];
      if (item === undefined || sum + (reachable[i] ?? 0) < need) return;
      chosen.push({ id: item.id, index: item.index });
      walk(i + 1, sum + item.power);
      chosen.pop();
      if (out.length >= MAX_CREW_CHOICES) return;
    }
  };
  walk(0, 0);
  return out;
}
