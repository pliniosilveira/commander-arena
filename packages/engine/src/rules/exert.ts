/**
 * Exert (CR 701.43): "You may exert ~ as it attacks" is an optional cost to attack (CR 701.43d, 508.1g). Each attacker with the `exertOnAttack` static ability
 * is asked, as the attackers are chosen and before the cost of attacking is paid (CR 508.1g-h), whether to exert it (`rules/combat-flow.ts`, a `confirmOptional`
 * of purpose 'exert'). To exert a permanent is to choose to have it not untap during its controller's next untap step (CR 701.43a): the engine records the
 * `restrict` of `doesntUntap` that ends when that step has run (`until` 'nextUntapStep', the effect of D-517), so a second exert before that step ends in the
 * same step (CR 701.43b). The `exerted` event then triggers the abilities linked to the exert ability ("When you do", CR 607.2h, 603.12).
 * The ability is read from the derived abilities of the creature (CR 604.1), so a creature that lost its abilities cannot be exerted.
 */
import type { ObjectId, SeatId } from '../ids';
import type { AttackTarget } from '../state/combat-types';
import type { GameEvent } from '../state/events';
import { allocateTimestamp, getObject } from '../state/ops';
import type { ContinuousEffect, GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';

/** One declared attacker with whether it is exerted: `undefined` until the question has been asked (CR 508.1g). */
export interface ExertAttack {
  readonly attacker: ObjectId;
  readonly target: AttackTarget;
  readonly exert?: boolean;
}

/** Whether `seat` may be asked to exert `attacker` as it attacks: a creature on the battlefield they control with the ability (CR 701.43c, 701.43d). */
export function canExert(state: GameState, seat: SeatId, attacker: ObjectId): boolean {
  const obj = state.objects[attacker];
  if (obj === undefined || obj.zone !== 'battlefield' || controllerOf(state, obj) !== seat) {
    return false;
  }
  return derive(state, obj).abilities.some(
    (a) => a.kind === 'static' && a.static.kind === 'exertOnAttack',
  );
}

/**
 * The attackers that were exerted, as the declaration is made (CR 508.1g): each does not untap during its controller's next untap step (CR 701.43a), and
 * an `exerted` event is made for each, after the declaration's own events, for the abilities linked to it (CR 607.2h).
 */
export function applyExerts(
  state: GameState,
  seat: SeatId,
  attacks: readonly ExertAttack[],
): { state: GameState; events: GameEvent[] } {
  let next = state;
  const events: GameEvent[] = [];
  for (const a of attacks) {
    if (a.exert !== true || next.objects[a.attacker]?.zone !== 'battlefield') continue;
    const [timestamp, stamped] = allocateTimestamp(next);
    const effect: ContinuousEffect = {
      id: `ce${timestamp}`,
      timestamp,
      objects: [getObject(stamped, a.attacker).id],
      until: 'nextUntapStep',
      change: { kind: 'restrict', restriction: 'doesntUntap' },
    };
    next = { ...stamped, continuousEffects: [...stamped.continuousEffects, effect] };
    events.push({ kind: 'exerted', seat, object: a.attacker });
  }
  return { state: next, events };
}
