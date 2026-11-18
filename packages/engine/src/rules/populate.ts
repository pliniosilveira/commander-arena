/**
 * "Populate" (CR 701.36, issue 160, D-611): "To populate means to choose a creature token you control and create a token that's a copy of that creature token. If you control
 * no creature tokens when instructed to populate, you won't create a token."
 *
 * The creature tokens are those the controller controls now (a creature as `derive` types it, a token, whoever made it). With none nothing happens (CR 701.36b); with one it is
 * chosen; with two or more the controller is asked which (a `choosePermanent` decision of purpose 'populate', the instruction staying at the head of the queue with nothing
 * changed). The new token has the copiable values of the one chosen (CR 707.2, 707.9b) and is made through the shared token pipeline (`makeSettled`, D-221): the replacement
 * effects of its creation apply (a doubler makes more, CR 614.1a), settled with the controller's answers to the order question, as for any token that copies a permanent.
 */
import type { ObjectId } from '../ids';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { controllerOf } from './control';
import { copiableValues } from './copiable';
import { asking } from './damage-effects';
import type { OrderFlow } from './damage-order';
import { derive } from './derive';
import { done, type StepOutcome } from './step-outcome';
import { makeSettled } from './token-batch';

type Populate = Extract<Instruction, { kind: 'populate' }>;

/** The creature tokens `seat` controls, by age (CR 701.36a). */
export function creatureTokensOf(state: GameState, seat: number): ObjectId[] {
  return Object.values(state.objects)
    .filter((o) => {
      if (o.zone !== 'battlefield' || o.token === null || controllerOf(state, o) !== seat) {
        return false;
      }
      return derive(state, o).types.includes('creature');
    })
    .map((o) => o.id)
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

/** Runs `populate` for the controller of the effect (CR 701.36). */
export function runPopulate(
  state: GameState,
  res: ResolutionContext,
  ins: Populate,
  flow: OrderFlow,
): StepOutcome {
  const seat = res.controller;
  const tokens = creatureTokensOf(state, seat);
  // CR 701.36b: no creature token, no token.
  if (tokens.length === 0) return done(state);
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
        purpose: 'populate',
        min: 1,
        max: 1,
        legal: tokens,
      },
    };
  }
  const original = state.objects[picked];
  if (original === undefined) return done(state);
  const values = copiableValues(state, original);
  const made = makeSettled(
    state,
    res,
    seat,
    [
      {
        definition: { ...values.characteristics, abilities: [...values.abilities] },
        count: 1,
        original: true,
      },
    ],
    false,
    flow,
  );
  if (made.kind === 'asked') return asking(state, made);
  return { ...done(made.state, made.events, made.front), lastMoved: made.created };
}
