/**
 * "Empower Jace N" (CR 701.71a, D-201): "If you don't control a Jace planeswalker token, create a blue Jace planeswalker token with 0 loyalty, '[-1]:
 * Surveil 1,' and '[-3]: Draw a card.' Choose a Jace planeswalker token you control. Put N loyalty counters on it."
 *
 * The token is the engine's own (`JACE_TOKEN`). Everything happens as one effect resolves, so no state-based action sees the token with 0
 * loyalty (CR 704.3: they are checked when a player would receive priority). With two or more Jace tokens the controller is asked which one
 * gets the counters (a `choosePermanent` decision of purpose 'empowerJace'; the instruction stays at the head of the queue and nothing has
 * changed yet), with one it is chosen. "A Jace planeswalker token" is a token that is a planeswalker with the subtype Jace, which a
 * non-Jace planeswalker (a token copy of a card) is not.
 */
import { JACE_TOKEN } from '../cards/tokens';
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import { patchObject } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { controllerOf } from './control';
import { counterBlocked } from './counter-prevention';
import { derive } from './derive';
import { done, type StepOutcome } from './step-outcome';
import { createTokens } from './tokens';

type EmpowerJace = Extract<Instruction, { kind: 'empowerJace' }>;

/** The Jace planeswalker tokens `seat` controls, by age (CR 701.71a). */
export function jaceTokensOf(state: GameState, seat: number): ObjectId[] {
  return Object.values(state.objects)
    .filter((o) => {
      if (o.zone !== 'battlefield' || o.token === null || controllerOf(state, o) !== seat) {
        return false;
      }
      const d = derive(state, o);
      return d.types.includes('planeswalker') && d.subtypes.includes('Jace');
    })
    .map((o) => o.id)
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

/** Runs `empowerJace` for the controller of the effect (CR 701.71a). */
export function runEmpowerJace(
  state: GameState,
  res: ResolutionContext,
  ins: EmpowerJace,
): StepOutcome {
  const seat = res.controller;
  const events: GameEvent[] = [];
  let next = state;
  let tokens = jaceTokensOf(next, seat);
  if (tokens.length === 0) {
    const made = createTokens(next, seat, JACE_TOKEN, 1);
    next = made.state;
    events.push(...made.events);
    tokens = jaceTokensOf(next, seat);
  }
  const picked = ins.chosen?.[0] ?? (tokens.length === 1 ? tokens[0] : undefined);
  if (picked === undefined) {
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'choosePermanent',
        seat,
        source: res.object,
        purpose: 'empowerJace',
        min: 1,
        max: 1,
        legal: tokens,
      },
    };
  }
  const obj = next.objects[picked];
  // D-1152 (CR 122.6, 101.2): a permanent that can't have loyalty counters is given none.
  if (obj === undefined || counterBlocked(next, obj, 'loyalty')) return done(next, events);
  next = patchObject(next, picked, {
    counters: { ...obj.counters, loyalty: (obj.counters.loyalty ?? 0) + ins.amount },
  });
  events.push({
    kind: 'counterAdded',
    object: picked,
    counter: 'loyalty',
    count: ins.amount,
    by: seat,
  });
  return done(next, events);
}
