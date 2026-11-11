/**
 * The mulligan of the HeuristicAgent (M7c, SPEC 9, D-163). The decision always shows seven cards
 * (CR 103.5, London mulligan: draw seven, then put the mulligan count on the bottom); `bottomCount` is how
 * many would go if the hand is kept now. The hand is KEPT when it has 2 to 5 lands and, while no mulligan
 * has been taken, at least one spell it can cast by the curve: a nonland card whose mana value is at most
 * the lands in hand plus one (a land still to be drawn). Otherwise it is sent back while that is allowed and
 * the hand that follows would keep at least `minKeep` cards; at that size (and when `canMulligan` is
 * false) it is always kept. The free first mulligan (a game setting) changes `bottomCount`, not this
 * rule: a hand that is kept after a free mulligan is judged like any other.
 */
import type { Action, GameView, MulliganDecision } from '@commander-arena/engine';
import { findObject, isLand, manaValueOf } from './casual-view';
import type { Reason } from './reasons';

export const KEEP_MIN_LANDS = 2;
export const KEEP_MAX_LANDS = 5;

export function chooseHeuristicMulligan(
  view: GameView,
  d: MulliganDecision,
  minKeep: number,
): { action: Action; reason: Reason } {
  const cards = d.hand.flatMap((id) => findObject(view, id) ?? []);
  const lands = cards.filter(isLand).length;
  const spells = cards.filter((o) => !isLand(o));
  const castable = spells.some((o) => manaValueOf(o) <= lands + 1);
  const keepable =
    lands >= KEEP_MIN_LANDS && lands <= KEEP_MAX_LANDS && (d.bottomCount > 0 || castable);
  const keptAfterMulligan = d.hand.length - d.bottomCount - 1;
  if (!keepable && d.canMulligan && keptAfterMulligan >= minKeep) {
    return { action: { kind: 'takeMulligan' }, reason: 'mulligan' };
  }
  return { action: { kind: 'keepHand' }, reason: 'keep' };
}
