/**
 * Turning the DSL's combat references into the engine's combat actions (CR 506-511), against the
 * current state. Attackers and blockers default to the acting seat's battlefield, the creature
 * being blocked to the opponent's.
 */
import type { SeatId } from '../ids';
import type { Action } from '../state/actions';
import type { AttackTarget, DamageAssignment, DamageRecipient } from '../state/combat-types';
import type { GameState } from '../state/types';
import { type RefContext, resolveObject } from './refs';
import {
  type ActionSpec,
  type AttackSpec,
  type AttackTargetRef,
  type BlockSpec,
  type CardRef,
  type DamageSpec,
  ScenarioError,
  type TargetRef,
} from './types';

/** The seat across the table (the engine supports exactly two seats). */
export function opponentSeat(state: GameState, seat: SeatId): SeatId {
  return (seat + 1) % state.seats.length;
}

export function attackTargetOf(
  ctx: RefContext,
  seat: SeatId,
  target: AttackTargetRef | undefined,
): AttackTarget {
  if (target === undefined) return { kind: 'player', seat: opponentSeat(ctx.state, seat) };
  if (typeof target === 'object' && 'player' in target) {
    return { kind: 'player', seat: target.player };
  }
  return { kind: 'permanent', object: resolveObject(ctx, target, { zones: ['battlefield'] }).id };
}

export function declareAttackersAction(
  ctx: RefContext,
  seat: SeatId,
  attacks: readonly AttackSpec[],
): Action {
  return {
    kind: 'declareAttackers',
    attacks: attacks.map((a) => ({
      attacker: resolveObject(ctx, a.attacker, { zones: ['battlefield'], seat }).id,
      target: attackTargetOf(ctx, seat, a.target),
    })),
  };
}

export function declareBlockersAction(
  ctx: RefContext,
  seat: SeatId,
  blocks: readonly BlockSpec[],
): Action {
  return {
    kind: 'declareBlockers',
    blocks: blocks.map((b) => ({
      blocker: resolveObject(ctx, b.blocker, { zones: ['battlefield'], seat }).id,
      attacker: resolveObject(ctx, b.attacker, {
        zones: ['battlefield'],
        seat: opponentSeat(ctx.state, seat),
      }).id,
    })),
  };
}

function recipientOf(ctx: RefContext, to: TargetRef): DamageRecipient {
  if (typeof to === 'object' && 'player' in to) return { kind: 'player', seat: to.player };
  return { kind: 'object', id: resolveObject(ctx, to, { zones: ['battlefield'] }).id };
}

export function assignDamageAction(ctx: RefContext, specs: readonly DamageSpec[]): Action {
  const assignments: DamageAssignment[] = specs.map((s) => {
    if (!Number.isInteger(s.amount) || s.amount < 0) {
      throw new ScenarioError(`Damage amount ${s.amount} is not a whole number`);
    }
    return {
      source: resolveObject(ctx, s.from, { zones: ['battlefield'] }).id,
      to: recipientOf(ctx, s.to),
      amount: s.amount,
    };
  });
  return { kind: 'assignDamage', assignments };
}

/** The attackers a `attack(...)` shorthand or a CombatPlan names, as AttackSpecs. */
export function attackSpecs(
  attackers: CardRef | readonly CardRef[] | readonly (CardRef | AttackSpec)[],
  target?: AttackTargetRef,
): AttackSpec[] {
  const list = (Array.isArray(attackers) ? attackers : [attackers]) as readonly (
    | CardRef
    | AttackSpec
  )[];
  return list.map((a) => {
    if (typeof a === 'object' && 'attacker' in a) return a;
    return target === undefined ? { attacker: a } : { attacker: a, target };
  });
}

/** The combat verbs' ActionSpecs as actions; null for the other specs. */
export function combatSpecToAction(ctx: RefContext, seat: SeatId, spec: ActionSpec): Action | null {
  if (typeof spec === 'string') return null;
  if ('declareAttackers' in spec) return declareAttackersAction(ctx, seat, spec.declareAttackers);
  if ('declareBlockers' in spec) return declareBlockersAction(ctx, seat, spec.declareBlockers);
  if ('assignDamage' in spec) return assignDamageAction(ctx, spec.assignDamage);
  return null;
}
