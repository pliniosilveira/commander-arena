/**
 * One creature against another, read from the view (M7c, PRIOR_ART 7.2 heuristic 2, D-163): who dies
 * when `blocker` blocks `attacker`. This is only used to GENERATE candidate blocks and to judge what an
 * opponent would block with; every candidate the agent actually chooses between is scored by playing it
 * on a sample with the engine (`heuristic-sim.ts`), so the engine, not this file, decides first strike,
 * deathtouch and the rest when it matters.
 *
 * Rules read (CR 510.1 damage, 702.2 deathtouch, 702.4 double strike, 702.7 first strike, 702.12
 * indestructible): damage already marked counts against toughness; damage from a deathtouch source is
 * lethal; an indestructible creature is not destroyed by damage; a creature with first strike or double
 * strike deals damage in the first step, and a creature without it that is killed there deals none.
 */
import type { ObjectView } from '@commander-arena/engine';
import { hasKeyword, powerOf, toughnessOf } from './casual-view';

export const strikesFirst = (o: ObjectView): boolean =>
  hasKeyword(o, 'firstStrike') || hasKeyword(o, 'doubleStrike');

/** Damage `o` deals over a whole combat: double strike deals its power twice. */
export const dealtOver = (o: ObjectView): number =>
  powerOf(o) * (hasKeyword(o, 'doubleStrike') ? 2 : 1);

export const remainingToughness = (o: ObjectView): number => toughnessOf(o) - o.damage;

/** Whether `dmg` damage from `source` destroys `target`. */
export function lethalTo(source: ObjectView, dmg: number, target: ObjectView): boolean {
  if (hasKeyword(target, 'indestructible') || dmg <= 0) return false;
  return hasKeyword(source, 'deathtouch') || dmg >= remainingToughness(target);
}

export interface Duel {
  readonly attackerDies: boolean;
  readonly blockerDies: boolean;
}

/** The outcome of `blocker` alone blocking `attacker`. */
export function duel(attacker: ObjectView, blocker: ObjectView): Duel {
  const aFirst = strikesFirst(attacker);
  const bFirst = strikesFirst(blocker);
  // The creature that strikes first kills the other before it deals damage (a double striker
  // also deals damage in the regular step, which only matters when the other survived).
  if (aFirst && !bFirst && lethalTo(attacker, powerOf(attacker), blocker)) {
    return { attackerDies: false, blockerDies: true };
  }
  if (bFirst && !aFirst && lethalTo(blocker, powerOf(blocker), attacker)) {
    return { attackerDies: true, blockerDies: false };
  }
  return {
    attackerDies: lethalTo(blocker, dealtOver(blocker), attacker),
    blockerDies: lethalTo(attacker, dealtOver(attacker), blocker),
  };
}

/**
 * Whether two blockers together kill `attacker` and the attacker can kill at most one of them: the
 * gang block that wins a creature for the price of at most one (the attacker picks which, so the cost
 * is the dearer of the two).
 */
export function gangWins(attacker: ObjectView, a: ObjectView, b: ObjectView): boolean {
  if (hasKeyword(attacker, 'indestructible')) return false;
  const killsIt =
    (hasKeyword(a, 'deathtouch') && powerOf(a) > 0) ||
    (hasKeyword(b, 'deathtouch') && powerOf(b) > 0) ||
    dealtOver(a) + dealtOver(b) >= remainingToughness(attacker);
  if (!killsIt) return false;
  const [x, y] = [
    lethalTo(attacker, powerOf(attacker), a),
    lethalTo(attacker, powerOf(attacker), b),
  ];
  if (!x || !y) return true;
  // It can kill either alone: it kills both only when its damage can be split that way.
  if (hasKeyword(attacker, 'deathtouch')) return powerOf(attacker) < 2;
  return powerOf(attacker) < remainingToughness(a) + remainingToughness(b);
}
