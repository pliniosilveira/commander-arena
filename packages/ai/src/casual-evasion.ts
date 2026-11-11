/**
 * CasualAgent and evasion (D-094): which opposing creatures could block an attacker, read from the
 * view the way the engine reads the rules (CR 509.1b): "can't block", "can't be blocked", flying and
 * reach, fear, intimidate, shadow and landwalk. The engine still decides what is legal; this only
 * lets the agent value an attack that cannot be blocked and keep "attacks each combat" creatures
 * and a "can't be blocked this turn" ability in mind.
 */
import type { ActivatedAbility, GameView, ObjectView } from '@commander-arena/engine';
import { hasKeyword, isCreature, isLand, powerOf } from './casual-view';

const artifactCreature = (o: ObjectView): boolean =>
  o.types.includes('artifact') && o.types.includes('creature');

const cannot = (o: ObjectView, restriction: string): boolean =>
  (o.restrictions ?? []).some((r) => r === restriction);

/** CR 702.14c: whether `defender` controls a land the attacker's landwalk names. */
function walksPast(view: GameView, attacker: ObjectView, defender: number): boolean {
  const types = attacker.landwalks ?? [];
  if (types.length === 0) return false;
  return view.battlefield.some(
    (land) =>
      land.controller === defender &&
      isLand(land) &&
      types.some((t) =>
        t === 'nonbasic' ? !land.supertypes.includes('basic') : land.subtypes.includes(t),
      ),
  );
}

/** Whether `blocker` could legally block `attacker` on its own, ignoring tapped status. */
export function couldBlock(view: GameView, attacker: ObjectView, blocker: ObjectView): boolean {
  if (cannot(blocker, 'cantBlock') || cannot(attacker, 'cantBeBlocked')) return false;
  if (walksPast(view, attacker, blocker.controller)) return false;
  if (hasKeyword(attacker, 'fear') && !artifactCreature(blocker) && !blocker.colors.includes('B')) {
    return false;
  }
  if (
    hasKeyword(attacker, 'intimidate') &&
    !artifactCreature(blocker) &&
    !blocker.colors.some((c) => attacker.colors.includes(c))
  ) {
    return false;
  }
  // CR 702.28b: shadow blocks and is blocked only by shadow.
  if (hasKeyword(attacker, 'shadow') !== hasKeyword(blocker, 'shadow')) return false;
  if (hasKeyword(attacker, 'flying'))
    return hasKeyword(blocker, 'flying') || hasKeyword(blocker, 'reach');
  return true;
}

/** Whether no untapped creature of the opponent could block `attacker`. */
export function isUnblockable(view: GameView, attacker: ObjectView): boolean {
  return !view.battlefield.some(
    (o) =>
      o.controller !== view.viewer && isCreature(o) && !o.tapped && couldBlock(view, attacker, o),
  );
}

/**
 * A "{cost}: Target creature can't be blocked this turn" ability: one that gives `cantBeBlocked`
 * until end of turn for mana and {T} only.
 */
export function isUnblockableAbility(ability: ActivatedAbility): boolean {
  const e = ability.effect;
  return (
    e.kind === 'restrict' &&
    e.restriction === 'cantBeBlocked' &&
    e.duration === 'untilEndOfTurn' &&
    ability.cost.every((c) => c.kind === 'mana' || c.kind === 'tap')
  );
}

/**
 * Worth activating now: in the precombat main phase, when one of our creatures could attack, has
 * power and could be blocked by something the opponent has untapped.
 */
export function wantsUnblockable(view: GameView): boolean {
  if (view.phase !== 'precombatMain' || view.activeSeat !== view.viewer) return false;
  return view.battlefield.some(
    (me) =>
      me.controller === view.viewer &&
      isCreature(me) &&
      !me.tapped &&
      !me.summoningSick &&
      powerOf(me) > 0 &&
      !hasKeyword(me, 'defender') &&
      !isUnblockable(view, me),
  );
}
