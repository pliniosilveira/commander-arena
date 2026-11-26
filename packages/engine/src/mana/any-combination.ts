/**
 * "Add X mana in any combination of colors" for the payment planner (CR 106.1b, 605.3b; issue 632). It has C(X + 4, 4) outcomes, 249,900 for X = 47, and
 * the planner weighed each one at every priority grant. What an outcome can pay depends only on how many of its mana can pay a demand that other mana
 * cannot, so against a cost the outcomes fall into a few classes and one of each is enough: the planner finds the same plan costs from them as from all.
 *
 * The five colors are grouped into kinds: colors whose mana can pay the same demands besides the demands every color can pay (generic and snow mana
 * among them, which any mana pays). Mana of a kind beyond what the demands only it can pay add up to pays nothing the rest cannot, so an outcome's class is
 * its count of each kind capped at that sum; the other mana is left over or pays the demands all colors share.
 */
import type { ManaColor } from './types';

/** The five colors in the order of the combinations of the engine (W, U, B, R, G), the colors "any combination" chooses from. */
const FIVE: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

/**
 * One combination of `count` mana for each class of outcome: `kindOfColor` is the kind of each of the five colors and `caps` the most mana of each kind
 * that can pay a demand only it can. A class holds the combinations with the same count of each kind capped at its cap; its combination is the first
 * of them in the order the engine lists all combinations (most W first, then most U, ...): each kind's counted mana in its first color, and the
 * rest in the first color whose kind is at its cap (the mana left over). The combinations come in that order, each as the list of its mana in the order
 * W, U, B, R, G.
 */
export function classCombinations(
  count: number,
  kindOfColor: readonly number[],
  caps: readonly number[],
): ManaColor[][] {
  const kinds = caps.length;
  const firstColor = caps.map((_, k) => kindOfColor.indexOf(k));
  const out: number[][] = [];
  const target = new Array<number>(kinds).fill(0);
  const visit = (k: number, used: number): void => {
    if (k === kinds) {
      const rest = count - used;
      // The mana the kinds do not count goes to a kind at its cap, which any number of mana reaches.
      const dump = kindOfColor.findIndex(
        (kind) => (target[kind] as number) === (caps[kind] as number),
      );
      if (rest > 0 && dump < 0) return;
      const counts = new Array<number>(FIVE.length).fill(0);
      for (let c = 0; c < kinds; c += 1) counts[firstColor[c] as number] = target[c] as number;
      if (rest > 0) counts[dump] = (counts[dump] as number) + rest;
      out.push(counts);
      return;
    }
    const most = Math.min(caps[k] as number, count - used);
    for (let t = 0; t <= most; t += 1) {
      target[k] = t;
      visit(k + 1, used + t);
    }
  };
  visit(0, 0);
  // Descending by count of W, then U, ...: the order of the full list.
  out.sort((a, b) => {
    for (let i = 0; i < FIVE.length; i += 1) {
      const d = (b[i] as number) - (a[i] as number);
      if (d !== 0) return d;
    }
    return 0;
  });
  return out.map((counts) =>
    FIVE.flatMap((color, i) => Array.from({ length: counts[i] as number }, () => color)),
  );
}
