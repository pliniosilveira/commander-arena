/**
 * The parts of a `Condition` that read nothing but the state: a player's life total (CR 119.1) and whether a player controls
 * a commander (CR 903.3, 903.3d). `conditions.ts` (an intervening "if", "activate only if", a replacement's "unless") and
 * `static-conditions.ts` (the "as long as" of a static ability, read while `derive` is at work) both use them, so the two
 * cannot disagree. It imports no `derive`.
 */
import type { Condition } from '../ast/types';
import type { SeatId } from '../ids';
import { getObject, getSeat, objectsInZone, opponentsOf } from '../state/ops';
import type { GameState } from '../state/types';
import { controllerOf } from './control';

type LifeCondition = Extract<Condition, { kind: 'lifeTotal' }>;
type EnteredCondition = Extract<Condition, { kind: 'enteredThisTurn' }>;
type DamageCondition = Extract<Condition, { kind: 'playerDealtDamage' }>;
type CommanderCondition = Extract<Condition, { kind: 'controlCommander' }>;

/** CR 404.1 (D-229): the number of cards in `seat`'s graveyard meets the comparison ("fewer than eight" is at most 7). */
export function cardsInGraveyardHolds(
  state: GameState,
  seat: SeatId,
  compare: Extract<Condition, { kind: 'cardsInGraveyard' }>['compare'],
): boolean {
  const n = getSeat(state, seat).graveyard.length;
  if (compare.cmp === 'atLeast') return n >= compare.value;
  if (compare.cmp === 'atMost') return n <= compare.value;
  return n === compare.value;
}

/**
 * CR 119.1, 903.7 (D-133): whether `seat`'s life total, or its difference from the life total the players started with, meets
 * the comparison.
 */
export function lifeTotalHolds(state: GameState, seat: SeatId, condition: LifeCondition): boolean {
  const life = getSeat(state, seat).life;
  const n = condition.aboveStarting === true ? life - state.settings.startingLife : life;
  const { cmp, value } = condition.compare;
  if (cmp === 'atLeast') return n >= value;
  if (cmp === 'atMost') return n <= value;
  return n === value;
}

/**
 * CR 903.3d: `seat` controls a permanent on the battlefield that is a commander (a card designated as one, CR 903.3: a token,
 * or a permanent copying a commander, is not). With `yours` (D-133) it is also one of `seat`'s own commanders: a card they own.
 */
export function controlsCommander(
  state: GameState,
  seat: SeatId,
  condition: CommanderCondition,
): boolean {
  return objectsInZone(state, 'battlefield').some((id) => {
    const obj = getObject(state, id);
    return (
      controllerOf(state, obj) === seat &&
      obj.card !== null &&
      state.cards[obj.card]?.isCommander === true &&
      (condition.yours !== true || obj.owner === seat)
    );
  });
}

/**
 * D-151 (Celebration): at least `count` permanents entered the battlefield under `seat`'s control this turn that match the condition's card
 * types and kind (token or card). Read from the turn log, so a permanent that has left still counts as it entered.
 */
export function enteredThisTurnHolds(
  state: GameState,
  seat: SeatId,
  condition: EnteredCondition,
): boolean {
  let n = 0;
  for (const e of state.turnLog.entered) {
    if (e.controller !== seat) continue;
    if (condition.types?.some((t) => !e.types.includes(t))) continue;
    if (condition.notTypes?.some((t) => e.types.includes(t))) continue;
    if (condition.token !== undefined && e.token !== condition.token) continue;
    n += 1;
  }
  return n >= condition.count;
}

/**
 * D-151, CR 120.3: `seat` was dealt at least `atLeast` damage this turn (`you`), or some one opponent of `seat` still in the game was
 * (`opponent`), read from the turn log.
 */
export function playerDealtDamageHolds(
  state: GameState,
  seat: SeatId,
  condition: DamageCondition,
): boolean {
  const taken = (s: SeatId): number => state.turnLog.damageTaken[s] ?? 0;
  return condition.player === 'you'
    ? taken(seat) >= condition.atLeast
    : opponentsOf(state, seat).some((o) => taken(o) >= condition.atLeast);
}

/** D-252, CR 119.3: `seat` gained at least `atLeast` life in all this turn, read from the turn log. */
export function lifeGainedThisTurnHolds(
  state: GameState,
  seat: SeatId,
  condition: Extract<Condition, { kind: 'lifeGainedThisTurn' }>,
): boolean {
  return (state.turnLog.lifeGainedTotal[seat] ?? 0) >= condition.atLeast;
}

/**
 * The conditions of a static ability that changes types or colors (D-151): the ones that read nothing `derive` works out, so that layers 4 and
 * 5 can read them without the layers they are part of (CR 613.8): a life total, a commander, what entered or what damage was dealt this turn,
 * and combinations. `validateCard` allows no other (`ast/validate-static-condition.ts`); any other kind never holds here.
 */
export function plainConditionHolds(
  state: GameState,
  condition: Condition,
  controller: SeatId,
): boolean {
  switch (condition.kind) {
    case 'lifeTotal':
      return lifeTotalHolds(state, controller, condition);
    case 'controlCommander':
      return controlsCommander(state, controller, condition);
    case 'enteredThisTurn':
      return enteredThisTurnHolds(state, controller, condition);
    case 'playerDealtDamage':
      return playerDealtDamageHolds(state, controller, condition);
    case 'lifeGainedThisTurn':
      return lifeGainedThisTurnHolds(state, controller, condition);
    case 'cardsInGraveyard':
      return cardsInGraveyardHolds(state, controller, condition.compare);
    case 'ownTurnNumber': {
      if (state.turn.activeSeat !== controller) return false;
      const turns = getSeat(state, controller).turnsTaken;
      const { cmp, value } = condition.compare;
      return cmp === 'atLeast'
        ? turns >= value
        : cmp === 'atMost'
          ? turns <= value
          : turns === value;
    }
    case 'and':
      return condition.terms.every((t) => plainConditionHolds(state, t, controller));
    case 'or':
      return condition.terms.some((t) => plainConditionHolds(state, t, controller));
    case 'not':
      return !plainConditionHolds(state, condition.term, controller);
    default:
      return false;
  }
}
