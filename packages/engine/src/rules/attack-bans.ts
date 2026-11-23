/**
 * "Inklings can't attack you or planeswalkers you control." (CR 508.1a, 506.3, D-647): which attack targets a creature may not be declared attacking because of the `cantAttackYou`
 * static abilities on the battlefield. The abilities are read from the derived abilities of the permanents (CR 604.1), so a permanent that lost its abilities restricts nothing; the
 * creatures are matched as filters of the battlefield read for the controller of the permanent as "you", with the permanent as the source (CR 109.4).
 */
import type { ObjectId } from '../ids';
import type { AttackTarget } from '../state/combat-types';
import { getObject } from '../state/ops';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { hasRestriction } from './restrictions';
import { matchesFilter } from './select';

/** The attack targets that `attacker` may not be declared attacking, among `targets`: the players and the planeswalkers of the controllers of the permanents that keep it off. */
export function withoutBannedTargets(
  state: GameState,
  attacker: ObjectId,
  targets: readonly AttackTarget[],
): AttackTarget[] {
  const obj = getObject(state, attacker);
  let allowed = [...targets];
  for (const id of state.battlefield) {
    if (allowed.length === 0) break;
    const source = getObject(state, id);
    for (const a of derive(state, source).abilities) {
      if (a.kind !== 'static' || a.static.kind !== 'cantAttackYou') continue;
      const protectedSeat = controllerOf(state, source);
      const ctx = { controller: protectedSeat, source: id };
      if (!matchesFilter(state, obj, { ...a.static.creatures, zone: 'battlefield' }, ctx)) continue;
      allowed = allowed.filter((t) => {
        if (t.kind === 'player') return t.seat !== protectedSeat;
        if (a.static.kind !== 'cantAttackYou' || a.static.planeswalkers !== true) return true;
        const attacked = getObject(state, t.object);
        return !(
          derive(state, attacked).types.includes('planeswalker') &&
          controllerOf(state, attacked) === protectedSeat
        );
      });
    }
  }
  // CR 508.1a, 508.6: "~ can't attack a player it has already attacked this turn": the players this creature was declared attacking earlier this turn (an attack on a planeswalker
  // or a battle is not an attack on a player, so `attackedPlayers` has none for it) are left out; planeswalkers and battles can still be attacked.
  if (hasRestriction(state, obj, 'cantAttackPlayersAlreadyAttacked')) {
    const already = state.turnLog.attackedPlayers
      .filter((a) => a.attacker === attacker)
      .map((a) => a.player);
    allowed = allowed.filter((t) => t.kind !== 'player' || !already.includes(t.seat));
  }
  // CR 508.1a, 611.2c (Chronomantic Escape): "Until your next turn, creatures can't attack you": the creatures the filter matches now may not attack that player.
  for (const e of state.continuousEffects) {
    if (e.change.kind !== 'creaturesCantAttackPlayer') continue;
    const ctx = { controller: e.change.controller, source: null };
    if (!matchesFilter(state, obj, { ...e.change.filter, zone: 'battlefield' }, ctx)) continue;
    const protectedSeat = e.change.controller;
    allowed = allowed.filter((t) => t.kind !== 'player' || t.seat !== protectedSeat);
  }
  // CR 508.1a (Promise of Loyalty): the continuous effects `cantAttackPlayer` bar their objects from the player and the planeswalkers that player controls.
  for (const e of state.continuousEffects) {
    if (e.change.kind !== 'cantAttackPlayer' || !e.objects.includes(attacker)) continue;
    const protectedSeat = e.change.seat;
    const subtype = e.change.planeswalkerSubtype;
    allowed = allowed.filter((t) => {
      if (t.kind === 'player') return subtype !== undefined || t.seat !== protectedSeat;
      const attacked = getObject(state, t.object);
      const derived = derive(state, attacked);
      return !(
        derived.types.includes('planeswalker') &&
        (subtype === undefined || derived.subtypes.includes(subtype)) &&
        controllerOf(state, attacked) === protectedSeat
      );
    });
  }
  return allowed;
}
