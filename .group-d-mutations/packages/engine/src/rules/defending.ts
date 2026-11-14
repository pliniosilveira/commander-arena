/**
 * The defending player (CR 508.5): for an attacking creature, the player it is attacking, the controller of
 * the planeswalker it is attacking or the protector of the battle it is attacking; once it is no longer
 * attacking, the one it was attacking before it was removed from combat.
 *
 * The combat state keeps its attackers listed after they leave the battlefield (CR 506.4: a creature that
 * left is checked against the battlefield, not removed from the list), so the answer is still there when an
 * ability of a creature that has since died resolves.
 */
import type { ObjectId, SeatId } from '../ids';
import type { AttackTarget } from '../state/combat-types';
import type { AttackerState, GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';

/**
 * Whose permanents or life an attacker is attacking, for deciding who may block it. If the attacked
 * planeswalker or battle has left the battlefield the creature stays in combat and may still be
 * blocked by its former controller or protector (CR 506.4c), found through last-known information.
 */
export function defenderOf(state: GameState, target: AttackTarget): SeatId | null {
  if (target.kind === 'player') return target.seat;
  const obj = state.objects[target.object] ?? state.lki[target.object]?.object;
  if (!obj) return null;
  return obj.protector ?? controllerOf(state, obj);
}

/**
 * The player whose creatures may block `attacker` (CR 509.1a, 508.5): the player it attacks; for a planeswalker or a battle the defending player it was declared
 * with, even after the permanent left or changed controller (CR 506.4c: the creature stays in combat and may be blocked), else the one found now.
 */
export function attackerDefender(state: GameState, attacker: AttackerState): SeatId | null {
  if (attacker.target.kind === 'player') return attacker.target.seat;
  return attacker.defender ?? defenderOf(state, attacker.target);
}

/** The `defender` field of an attacker of the permanent `target`: its controller or protector now (CR 508.5), or nothing when it is not known. */
export function defenderRecord(
  state: GameState,
  target: Extract<AttackTarget, { kind: 'permanent' }>,
): { defender?: SeatId } {
  const seat = defenderOf(state, target);
  return seat === null ? {} : { defender: seat };
}

/**
 * What the attacker is attacking now, or null when it attacks no player, planeswalker or battle any more (D-200, CR 506.4, 506.4c): its planeswalker or battle
 * left the battlefield or stopped being a planeswalker or battle (read here), or changed controller or protector (`targetGone`, set where control changes:
 * `combat-removal.ts`). Such a creature stays in combat, may be blocked, and if unblocked deals no combat damage.
 */
export function attackedTarget(state: GameState, attacker: AttackerState): AttackTarget | null {
  const target = attacker.target;
  if (target.kind === 'player') return target;
  if (attacker.targetGone === true) return null;
  const obj = state.objects[target.object];
  if (obj === undefined || obj.zone !== 'battlefield') return null;
  const types = derive(state, obj).types;
  if (!types.includes('planeswalker') && !types.includes('battle')) return null;
  return target;
}

/**
 * The defending player of the attacking creature `attacker` (CR 508.5), or null when no combat it is in is
 * on (the combat phase ended, CR 511.3) or the player it attacked has lost the game.
 */
export function defendingPlayerOf(state: GameState, attacker: ObjectId | null): SeatId | null {
  if (attacker === null) return null;
  const entry = state.combat?.attackers.find((a) => a.object === attacker);
  if (entry === undefined) return null;
  const seat = attackerDefender(state, entry);
  return seat === null || state.seats[seat]?.hasLost === true ? null : seat;
}
