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
  // CR 508.1a (Promise of Loyalty): the continuous effects `cantAttackPlayer` bar their objects from the player and the planeswalkers that player controls.
  for (const e of state.continuousEffects) {
    if (e.change.kind !== 'cantAttackPlayer' || !e.objects.includes(attacker)) continue;
    const protectedSeat = e.change.seat;
    allowed = allowed.filter((t) => {
      if (t.kind === 'player') return t.seat !== protectedSeat;
      const attacked = getObject(state, t.object);
      return !(
        derive(state, attacked).types.includes('planeswalker') &&
        controllerOf(state, attacked) === protectedSeat
      );
    });
  }
  return allowed;
}
