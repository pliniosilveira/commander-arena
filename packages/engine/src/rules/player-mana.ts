/**
 * "Until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}." (CR 605.1a, 605.3a, 118.3, 119.4, 611.2, 514.2; Channel): a
 * continuous effect of the game state that gives a PLAYER a mana ability, one that belongs to no permanent. It lasts until end of turn, may be activated any number of
 * times, and does not use the stack (CR 605.3b). Its mana has the spell that gave it as its source (the object stays in `objects` as last-known information).
 *
 * The ability is addressed like a mana ability of a permanent: `source` is the spell that gave it and the ability index is `PLAYER_MANA_ABILITY` (one use). The payment
 * planner takes one source of a permanent only once, so it is offered the ability as one source for each number of uses, `PLAYER_MANA_ABILITY - (uses - 1)`: "use it k
 * times" makes k mana for k times the life. The legal actions and `payManual` reach it through the paths they already have.
 */
import type { Effect } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { PaymentSource } from '../mana';
import { addToPool } from '../mana/pool';
import type { ManaColor, ManaObject } from '../mana/types';
import type { GameEvent } from '../state/events';
import { allocateTimestamp, getSeat, loseLifeBy, patchSeat } from '../state/ops';
import type { ChosenTarget, GameState } from '../state/types';
import { lifeTotalIsLocked } from './player-lock';
import { resolvePlayers, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

type Node = Extract<Effect, { kind: 'grantPlayerManaAbility' }>;

/** The ability index of a mana ability a continuous effect gives a player. Real abilities count up from 0; the planner's several uses go below it. */
export const PLAYER_MANA_ABILITY = -1000;
export const isPlayerManaAbility = (abilityIndex: number): boolean =>
  abilityIndex <= PLAYER_MANA_ABILITY;
/** Most uses of the ability the planner offers at once. */
const MAX_PLANNED_USES = 20;

/** How many uses a planner source of the ability stands for (`playerManaSources`). */
export const usesOfPlanned = (abilityIndex: number): number =>
  PLAYER_MANA_ABILITY - abilityIndex + 1;

export interface PlayerManaGrant {
  readonly source: ObjectId;
  readonly life: number;
  readonly mana: ManaColor;
}

export function runGrantPlayerManaAbility(
  state: GameState,
  node: Node,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const seats = resolvePlayers(state, node.player, ctx, targets);
  if (seats.length === 0 || ctx.source === null) return done(state);
  const [timestamp, stamped] = allocateTimestamp(state);
  return done({
    ...stamped,
    continuousEffects: [
      ...stamped.continuousEffects,
      {
        id: `ce${timestamp}`,
        timestamp,
        objects: [],
        players: seats,
        until: 'endOfTurn',
        change: {
          kind: 'playerPayLifeForMana',
          source: ctx.source,
          life: node.life,
          mana: node.mana,
        },
      },
    ],
  });
}

/** The mana abilities that effects of this turn give the player, oldest first (CR 611.2c: the players were fixed as the effect began). */
export function playerManaGrants(state: GameState, seat: SeatId): readonly PlayerManaGrant[] {
  const out: PlayerManaGrant[] = [];
  for (const e of state.continuousEffects) {
    if (e.change.kind !== 'playerPayLifeForMana' || !(e.players ?? []).includes(seat)) continue;
    out.push({ source: e.change.source, life: e.change.life, mana: e.change.mana });
  }
  return out;
}

/** Whether the player could pay the life of the grant now (CR 118.3, 119.4: a player can't pay more life than they have; a locked life total pays none). */
export function canPayGrantLife(state: GameState, seat: SeatId, grant: PlayerManaGrant): boolean {
  return !lifeTotalIsLocked(state, seat) && getSeat(state, seat).life >= grant.life;
}

/** The grants that can be activated now, for the legal actions. */
export function activatablePlayerMana(state: GameState, seat: SeatId): readonly PlayerManaGrant[] {
  return playerManaGrants(state, seat).filter((g) => canPayGrantLife(state, seat, g));
}

/**
 * The grants as payment sources: one for each number of uses the life allows, leaving the player at 1 life at least (automatic payment never kills its own player, as
 * for the life of any mana source). The planner weighs a source that costs life like any other extra effect, so they pay only what the others cannot.
 */
export function playerManaSources(state: GameState, seat: SeatId): PaymentSource[] {
  const grants = playerManaGrants(state, seat);
  if (grants.length === 0 || lifeTotalIsLocked(state, seat)) return [];
  const out: PaymentSource[] = [];
  const spare = Math.max(0, getSeat(state, seat).life - 1);
  for (const g of grants) {
    const uses = Math.min(MAX_PLANNED_USES, Math.floor(spare / g.life));
    for (let k = 1; k <= uses; k++) {
      out.push({
        object: g.source,
        abilityIndex: PLAYER_MANA_ABILITY - (k - 1),
        produces: [Array.from({ length: k }, () => g.mana)],
        tier: 'creature',
        snow: false,
        restriction: null,
        types: [],
        lifeLoss: g.life * k,
        weighExtraByLife: true,
      });
    }
  }
  return out;
}

/** The mana a use of the grant makes, with the spell that gave the ability as its source (CR 106.4). */
export function playerManaObject(grant: PlayerManaGrant): ManaObject {
  return { color: grant.mana, snow: false, source: grant.source, restriction: null };
}

/** Pays the life of `uses` uses of a grant (CR 118.3): the new state and the life event. */
export function payGrantLife(
  state: GameState,
  seat: SeatId,
  grant: PlayerManaGrant,
  uses = 1,
): { state: GameState; events: GameEvent[] } {
  const before = getSeat(state, seat).life;
  const life = grant.life * uses;
  return {
    state: loseLifeBy(state, seat, life),
    events: [{ kind: 'lifeChanged', seat, from: before, to: before - life }],
  };
}

/**
 * Activates the mana ability a continuous effect gave the player (CR 605.3a, 605.3b): pays the life, adds the mana to the pool. Refused, with nothing changed, when no
 * such effect is on, or the life cannot be paid. It uses no stack.
 */
export function activatePlayerMana(
  state: GameState,
  seat: SeatId,
  source: ObjectId,
): { state: GameState; events: GameEvent[] } | { error: string } {
  const grant = playerManaGrants(state, seat).find((g) => g.source === source);
  if (grant === undefined) return { error: 'That mana ability cannot be activated: it is not on' };
  if (!canPayGrantLife(state, seat, grant)) {
    return {
      error: `That mana ability cannot be activated: you cannot pay ${grant.life} life`,
    };
  }
  const paid = payGrantLife(state, seat, grant);
  const next = patchSeat(paid.state, seat, {
    manaPool: addToPool(getSeat(paid.state, seat).manaPool, [playerManaObject(grant)]),
  });
  return {
    state: next,
    events: [...paid.events, { kind: 'manaAdded', seat, count: 1 }],
  };
}
