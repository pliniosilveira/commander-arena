/**
 * "Inklings can't attack you or planeswalkers you control." (CR 508.1a, 506.3, D-647): which attack targets a creature may not be declared attacking because of the `cantAttackYou`
 * static abilities on the battlefield. The abilities are read from the derived abilities of the permanents (CR 604.1), so a permanent that lost its abilities restricts nothing; the
 * creatures are matched as filters of the battlefield read for the controller of the permanent as "you", with the permanent as the source (CR 109.4).
 */
import type { Effect } from '../ast/types';
import type { ObjectId } from '../ids';
import type { AttackTarget } from '../state/combat-types';
import { allocateTimestamp, getObject } from '../state/ops';
import type { ChosenTarget, ContinuousEffect, GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { matchesFilter, resolveObjects, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

/**
 * "Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it." (CR 508.1a, 506.3, 611.2b, 611.2c): one continuous effect for each creature
 * the selector names on the battlefield as the effect resolves that has the counter now (a "for as long as" duration that is over before the effect would begin does nothing, CR 611.2b),
 * for the controller of the effect. It ends for that creature, for good, as it has no such counter (`endLostControlEffects`).
 */
export function runCantAttackController(
  state: GameState,
  effect: Extract<Effect, { kind: 'cantAttackController' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  let next = state;
  const made: ContinuousEffect[] = [];
  for (const id of resolveObjects(state, effect.objects, ctx, targets)) {
    const obj = state.objects[id];
    if (obj === undefined || obj.zone !== 'battlefield') continue;
    if ((obj.counters[effect.whileCounter] ?? 0) <= 0) continue;
    const [timestamp, stamped] = allocateTimestamp(next);
    next = stamped;
    made.push({
      id: `ce${timestamp}`,
      timestamp,
      objects: [id],
      until: { kind: 'whileCounter', object: id, counter: effect.whileCounter },
      change: {
        kind: 'cantAttackSeat',
        seat: ctx.controller,
        ...(effect.planeswalkers === true ? { planeswalkers: true as const } : {}),
      },
    });
  }
  if (made.length === 0) return done(state);
  return done({ ...next, continuousEffects: [...next.continuousEffects, ...made] });
}

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
  // CR 508.1a, 506.3, 611.2: the continuous effects of "can't attack you or planeswalkers you control" (`cantAttackController`) on this creature.
  for (const e of state.continuousEffects) {
    if (e.change.kind !== 'cantAttackSeat' || !e.objects.includes(attacker)) continue;
    const { seat, planeswalkers } = e.change;
    allowed = allowed.filter((t) => {
      if (t.kind === 'player') return t.seat !== seat;
      if (planeswalkers !== true) return true;
      const attacked = getObject(state, t.object);
      return !(
        derive(state, attacked).types.includes('planeswalker') &&
        controllerOf(state, attacked) === seat
      );
    });
  }
  return allowed;
}
