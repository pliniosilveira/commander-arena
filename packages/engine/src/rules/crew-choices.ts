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

/** Longest list of keep answers built for one decision. */
const MAX_KEEP_CHOICES = 500;

/**
 * The answers to a "choose any number ... with total power N or less" question that `legalActionsForDecision` lists (Slaughter the Strong, CR 608.2d): the sets of `legal` whose
 * total power is at most `maxTotalPower` and to which no other creature could be added without going over, the ones that keep the most creatures first. Any other set that fits is
 * accepted all the same (`validPermanentChoice`); the list is for the AI and the UI, which work from the decision alone (`powers`).
 */
export function keepChoices(d: ChoosePermanentDecision): Action[] {
  const limit = d.maxTotalPower ?? 0;
  const powers = d.powers ?? {};
  const items = d.legal.map((id) => ({ id, power: powers[id] ?? 0 }));
  // lowest[i]: the least that the items from i on can add (a negative power adds less than nothing).
  const lowest: number[] = new Array(items.length + 1).fill(0);
  for (let i = items.length - 1; i >= 0; i -= 1) {
    lowest[i] = (lowest[i + 1] ?? 0) + Math.min(0, items[i]?.power ?? 0);
  }
  const out: Action[] = [];
  const kept: ObjectId[] = [];
  const walk = (i: number, sum: number): void => {
    if (out.length >= MAX_KEEP_CHOICES) return;
    const item = items[i];
    if (item === undefined) {
      // Maximal: nothing left out could have been kept.
      const maximal = items.every((x) => kept.includes(x.id) || sum + x.power > limit);
      if (maximal) out.push({ kind: 'choosePermanents', objects: [...kept] });
      return;
    }
    // Keeping it first, so the answers that keep the most come first.
    if (sum + item.power + (lowest[i + 1] ?? 0) <= limit) {
      kept.push(item.id);
      walk(i + 1, sum + item.power);
      kept.pop();
    }
    walk(i + 1, sum);
  };
  walk(0, 0);
  const sorted = out.sort(
    (a, b) =>
      (b.kind === 'choosePermanents' ? b.objects.length : 0) -
      (a.kind === 'choosePermanents' ? a.objects.length : 0),
  );
  return sorted.length > 0 ? sorted : [{ kind: 'choosePermanents', objects: [] }];
}
