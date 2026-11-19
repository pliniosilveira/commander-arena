/**
 * Control-changing effects (CR 613.1b, 611.2, 506.4, D-189): "Gain control of target creature until end of turn", "gain control of that artifact until the
 * end of your next turn", "gain control of target creature for as long as you control this". One resolved `gainControl` makes one `ContinuousEffect` of
 * change `control` for the permanents it names; `controllerOf` (`control.ts`) reads the effects, so nothing is moved or undone when one begins or ends.
 *
 * - CR 611.2c: the set of permanents is fixed when the effect begins; a permanent that is no longer on the battlefield is skipped (CR 608.2b).
 * - CR 611.2b: "for as long as you control this" does nothing when this is not on the battlefield under the controller's control as the effect would
 *   begin. Otherwise it ends, for good, when that stops being so (`endLostControlEffects`, run with the state-based actions).
 * - CR 506.4: a permanent whose controller changes is removed from combat, as the effect begins and as one ends.
 * - CR 302.6: a creature that goes back to its controller as an effect ends has not been under their control since their turn began
 *   (`GameObject.controlChangedAt`).
 * - CR 800.4a: with two seats the game ends when a player leaves, so nothing here handles the controller of an effect having left.
 */
import type { Effect } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { allocateTimestamp, patchObject } from '../state/ops';
import type { ChosenTarget, ContinuousEffect, EffectEnd, GameState } from '../state/types';
import { removeAttackedFromCombat, removeFromCombat } from './combat-removal';
import { controllerOf } from './control';
import { resolveObjects, resolvePlayers, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

/** When an effect of this duration, begun now for `ctx.controller`, ends; null when it does nothing (CR 611.2b). */
export function endOf(
  state: GameState,
  duration: Extract<Effect, { kind: 'gainControl' }>['duration'] | 'forAsLongAsThisRemains',
  ctx: SelectContext,
): EffectEnd | null {
  switch (duration) {
    case 'untilEndOfTurn':
      return 'endOfTurn';
    case 'permanent':
      return 'permanent';
    case 'untilEndOfYourNextTurn': {
      // CR 500.1: "the end of your next turn" is the turn of the controller that comes after this moment, even when this turn is theirs.
      const taken = state.seats[ctx.controller]?.turnsTaken ?? 0;
      return { kind: 'turnEnd', seat: ctx.controller, turnsTaken: taken + 1 };
    }
    case 'forAsLongAsThisRemains': {
      // CR 611.2b (D-207): over before it begins when the permanent is not on the battlefield now.
      const source = ctx.source === null ? undefined : state.objects[ctx.source];
      if (source === undefined || source.zone !== 'battlefield') return null;
      return { kind: 'whileOnBattlefield', source: source.id };
    }
    case 'forAsLongAsYouControlThis': {
      const source = ctx.source === null ? undefined : state.objects[ctx.source];
      // CR 611.2b: the duration was over before the effect would begin: it does nothing.
      if (
        source === undefined ||
        source.zone !== 'battlefield' ||
        controllerOf(state, source) !== ctx.controller
      ) {
        return null;
      }
      return { kind: 'whileControlling', seat: ctx.controller, source: source.id };
    }
    default: {
      const unreachable: never = duration;
      return unreachable;
    }
  }
}

/** The events and state changes of permanents whose controller is not who it was (`before`): the event, the combat they leave. */
function controlChanges(
  input: GameState,
  before: ReadonlyMap<ObjectId, SeatId>,
): { state: GameState; events: GameEvent[] } {
  let state = input;
  const events: GameEvent[] = [];
  for (const [id, from] of before) {
    const obj = state.objects[id];
    if (obj === undefined || obj.zone !== 'battlefield') continue;
    const to = controllerOf(state, obj);
    if (to === from) continue;
    events.push({ kind: 'controlChanged', object: id, from, to });
    // CR 506.4: a permanent is removed from combat if its controller changes.
    const left = removeFromCombat(state, id);
    state = left.state;
    if (left.removed) events.push({ kind: 'removedFromCombat', object: id });
    // CR 506.4, 506.4c (D-200): an attacked planeswalker or battle that changes controller is removed from combat as well; it stops being attacked.
    const attacked = removeAttackedFromCombat(state, id);
    state = attacked.state;
    if (attacked.removed) events.push({ kind: 'removedFromCombat', object: id });
  }
  return { state, events };
}

/** The controllers `ids` have now, for the permanents among them on the battlefield. */
function controllersOf(state: GameState, ids: readonly ObjectId[]): Map<ObjectId, SeatId> {
  const out = new Map<ObjectId, SeatId>();
  for (const id of ids) {
    const obj = state.objects[id];
    if (obj !== undefined && obj.zone === 'battlefield') out.set(id, controllerOf(state, obj));
  }
  return out;
}

/** Runs `gainControl`: records one layer 2 effect for the permanents the selector names right now (CR 611.2c, 613.7b). */
export function runGainControl(
  state: GameState,
  node: Extract<Effect, { kind: 'gainControl' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const affected = resolveObjects(state, node.objects, ctx, targets).filter(
    (id) => state.objects[id]?.zone === 'battlefield',
  );
  if (affected.length === 0) return done(state);
  const until = endOf(state, node.duration, ctx);
  if (until === null) return done(state);
  const player =
    node.player === undefined ? [ctx.controller] : resolvePlayers(state, node.player, ctx, targets);
  if (player.length !== 1 || player[0] === undefined) return done(state);
  const before = controllersOf(state, affected);
  const [timestamp, stamped] = allocateTimestamp(state);
  const created: ContinuousEffect = {
    id: `ce${timestamp}`,
    timestamp,
    objects: affected,
    until,
    change: { kind: 'control', seat: player[0] },
  };
  const next: GameState = {
    ...stamped,
    continuousEffects: [...stamped.continuousEffects, created],
  };
  const changed = controlChanges(next, before);
  return done(changed.state, changed.events);
}

/**
 * Runs `returnControlToOwners` (CR 613.1b, 611.2a, 611.2c, D-628): "each player gains control of all creatures they own". The permanents the selector names now are grouped by
 * owner and each owner gets one layer 2 effect with no duration (CR 613.7b: each has a timestamp, made one after the other in seat order), so an earlier effect that gave a
 * permanent to someone else no longer decides who controls it, and a later one decides over this one. A permanent whose controller changed leaves combat (CR 506.4).
 */
export function runReturnControl(
  state: GameState,
  node: Extract<Effect, { kind: 'returnControlToOwners' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const affected = resolveObjects(state, node.objects, ctx, targets).filter(
    (id) => state.objects[id]?.zone === 'battlefield',
  );
  if (affected.length === 0) return done(state);
  const before = controllersOf(state, affected);
  const bySeat = new Map<SeatId, ObjectId[]>();
  for (const id of affected) {
    const owner = state.objects[id]?.owner;
    if (owner === undefined) continue;
    bySeat.set(owner, [...(bySeat.get(owner) ?? []), id]);
  }
  let next = state;
  const effects: ContinuousEffect[] = [];
  for (const seat of [...bySeat.keys()].sort((a, b) => a - b)) {
    const [timestamp, stamped] = allocateTimestamp(next);
    next = stamped;
    effects.push({
      id: `ce${timestamp}`,
      timestamp,
      objects: bySeat.get(seat) ?? [],
      until: 'permanent',
      change: { kind: 'control', seat },
    });
  }
  const changed = controlChanges(
    { ...next, continuousEffects: [...next.continuousEffects, ...effects] },
    before,
  );
  return done(changed.state, changed.events);
}

/**
 * Runs `exchangeControl` (CR 701.12a, 701.12b, 613.1b, 611.2a; Galadriel group 3): the two permanents swap controllers. The whole exchange is made or none of it: both selectors must
 * name a permanent on the battlefield, and two different players must control them (CR 701.12b: "if those permanents are controlled by the same player, the exchange effect does
 * nothing"). Each player gains control of the permanent the other controlled as the exchange begins, at the same moment: two layer 2 effects with no duration, made together (each
 * has a timestamp, CR 613.7b, and the later one decides when several give control of the same permanent). Their controllers are fixed now (CR 611.2c), so a later change of
 * control of one of them does not move the other.
 */
export function runExchangeControl(
  state: GameState,
  node: Extract<Effect, { kind: 'exchangeControl' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const named = (selector: Extract<Effect, { kind: 'exchangeControl' }>['first']) =>
    resolveObjects(state, selector, ctx, targets).filter(
      (id) => state.objects[id]?.zone === 'battlefield',
    );
  const [first, ...moreFirst] = named(node.first);
  const [second, ...moreSecond] = named(node.second);
  // CR 701.12a: if the entire exchange can't be completed, no part of it occurs.
  if (
    first === undefined ||
    second === undefined ||
    moreFirst.length > 0 ||
    moreSecond.length > 0
  ) {
    return done(state);
  }
  const a = state.objects[first];
  const b = state.objects[second];
  if (a === undefined || b === undefined || first === second) return done(state);
  const seatA = controllerOf(state, a);
  const seatB = controllerOf(state, b);
  // CR 701.12b: the same player controls both.
  if (seatA === seatB) return done(state);
  const before = controllersOf(state, [first, second]);
  const [stampA, stampedA] = allocateTimestamp(state);
  const [stampB, stampedB] = allocateTimestamp(stampedA);
  const give = (id: ObjectId, seat: SeatId, timestamp: number): ContinuousEffect => ({
    id: `ce${timestamp}`,
    timestamp,
    objects: [id],
    until: 'permanent',
    change: { kind: 'control', seat },
  });
  const next: GameState = {
    ...stampedB,
    continuousEffects: [
      ...stampedB.continuousEffects,
      give(first, seatB, stampA),
      give(second, seatA, stampB),
    ],
  };
  const changed = controlChanges(next, before);
  return done(changed.state, changed.events);
}

/**
 * Removes the continuous effects `ends` names. A permanent whose controller changes because a control effect ended goes back to who had it: it is
 * summoning sick for them again (`controlChangedAt`, CR 302.6) and leaves combat (CR 506.4). Returns the state and the events.
 */
export function dropEffects(
  state: GameState,
  ends: (e: ContinuousEffect) => boolean,
): { state: GameState; events: GameEvent[] } {
  const dropped = state.continuousEffects.filter(ends);
  if (dropped.length === 0) return { state, events: [] };
  const controlled = [
    ...new Set(dropped.filter((e) => e.change.kind === 'control').flatMap((e) => e.objects)),
  ];
  const before = controllersOf(state, controlled);
  let next: GameState = {
    ...state,
    continuousEffects: state.continuousEffects.filter((e) => !ends(e)),
  };
  if (before.size === 0) return { state: next, events: [] };
  // The permanents whose controller is not who it was have a new "under this controller's control since": a timestamp (CR 302.6).
  const back = [...before].filter(([id, from]) => {
    const obj = next.objects[id];
    return obj !== undefined && controllerOf(next, obj) !== from;
  });
  if (back.length > 0) {
    const [stamp, stamped] = allocateTimestamp(next);
    next = stamped;
    for (const [id] of back) next = patchObject(next, id, { controlChangedAt: stamp });
  }
  return controlChanges(next, before);
}

/**
 * CR 611.2b: "for as long as you control this" effects whose permanent has left the battlefield or is no longer controlled by the player who had
 * the effect end for good, as the state-based actions are checked (the duration is a state of the game, so no moment of it is missed). Returns
 * null when none ended.
 */
export function endLostControlEffects(
  state: GameState,
): { state: GameState; events: GameEvent[] } | null {
  const lost = (e: ContinuousEffect): boolean => {
    if (typeof e.until !== 'object') return false;
    // D-207: "for as long as this remains on the battlefield": the object itself, in any control.
    if (e.until.kind === 'whileOnBattlefield') {
      return state.objects[e.until.source]?.zone !== 'battlefield';
    }
    // CR 611.2b: "for as long as it has a vow counter on it": the object on the battlefield with a counter of the kind.
    if (e.until.kind === 'whileHasCounter') {
      const held = state.objects[e.until.object];
      return held?.zone !== 'battlefield' || (held.counters[e.until.counter] ?? 0) <= 0;
    }
    if (e.until.kind !== 'whileControlling') return false;
    const source = state.objects[e.until.source];
    return (
      source === undefined ||
      source.zone !== 'battlefield' ||
      controllerOf(state, source) !== e.until.seat
    );
  };
  if (!state.continuousEffects.some(lost)) return null;
  return dropEffects(state, lost);
}
