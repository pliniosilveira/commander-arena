/**
 * "Populate" (CR 701.36a, 701.36b, D-625): "To populate means to choose a creature token you control and create a token that's a copy of that creature token. If you control no
 * creature tokens when instructed to populate, you won't create a token."
 *
 * The creature tokens the controller controls are the battlefield permanents that are tokens and creatures as `derive` types them now (a token that became a creature counts,
 * a token that stopped being one does not), under the control of the controller as `controllerOf` reads it. With none nothing happens (CR 701.36b); with one it is the
 * choice; with two or more the controller chooses (a `choosePermanent` decision of purpose 'populate'). The copy has the copiable values of the token chosen (CR 707.2,
 * 111.10: for a token that is itself a copy these are the values it copied), as `createCopies` makes them, and is made through the shared token pipeline (`makeSettled`,
 * D-221): the replacement effects of its creation apply and a question it asks as it enters is asked. The token made is what `moved` names after this effect (`lastMoved`).
 */
import type { ObjectId } from '../ids';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { controllerOf } from './control';
import { copiableValues } from './copiable';
import { asking } from './damage-effects';
import type { OrderFlow } from './damage-order';
import { derive } from './derive';
import { prepareCardOf } from './prepare';
import { done, type StepOutcome } from './step-outcome';
import { makeSettled } from './token-batch';

type Populate = Extract<Instruction, { kind: 'populate' }>;

/** The creature tokens `seat` controls, oldest first (CR 701.36a). */
export function creatureTokensOf(state: GameState, seat: number): ObjectId[] {
  return Object.values(state.objects)
    .filter(
      (o) =>
        o.zone === 'battlefield' &&
        o.token !== null &&
        controllerOf(state, o) === seat &&
        derive(state, o).types.includes('creature'),
    )
    .map((o) => o.id)
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

/** Runs `populate` for the controller of the effect (CR 701.36a). */
export function runPopulate(
  state: GameState,
  res: ResolutionContext,
  ins: Populate,
  flow: OrderFlow,
): StepOutcome {
  const seat = res.controller;
  const tokens = creatureTokensOf(state, seat);
  // CR 701.36b: no creature token to choose, no token created. The tokens `moved` names are none.
  if (tokens.length === 0) return { ...done(state), lastMoved: [] };
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
  if (original === undefined) return { ...done(state), lastMoved: [] };
  const values = copiableValues(state, original);
  const prepareOf = prepareCardOf(state, original); // CR 722.2b (D-225)
  const made = makeSettled(
    state,
    res,
    seat,
    [
      {
        definition: {
          ...values.characteristics,
          abilities: values.abilities,
          ...(prepareOf === null ? {} : { prepareOf }),
        },
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
