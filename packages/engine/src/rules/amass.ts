/**
 * "Amass Zombies N" (CR 701.47a, D-1120, D-1121): "If you don't control an Army creature, create a 0/0 black [subtype] Army creature token. Choose an Army creature you
 * control. Put N +1/+1 counters on that creature. If it isn't a [subtype], it becomes a [subtype] in addition to its other types."
 *
 * Everything happens as one effect resolves, so no state-based action sees the 0/0 token before it has its counters (CR 704.3: they are checked when a player would
 * receive priority). The token is made through the shared token pipeline (`makeSettled`, D-221): the replacement effects of its creation apply (a doubler makes more
 * Armies, CR 614.1a), settled with the controller's answers to the order question; the question returns with nothing changed and the instruction runs again with the
 * answer. The tokens are made first and the instruction then comes again (`made`), so with two or more Armies the controller is asked which one gets the counters (a
 * `choosePermanent` decision of purpose 'amass') with every Army, the new tokens too, on the battlefield for the question to name; with one it is chosen. "An Army
 * creature" is a creature with the subtype Army as `derive` types it now, a token or a card, whoever made it. The type the Army becomes is a permanent continuous
 * effect of layer 4 (CR 611.2a, 205.1b, 613.1d), kept for as long as the object stays on the battlefield (CR 400.7).
 */
import type { TokenDefinition } from '../ast/types';
import type { Subtype } from '../characteristics';
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import { allocateTimestamp, patchObject } from '../state/ops';
import type { ContinuousEffect, GameState, Instruction, ResolutionContext } from '../state/types';
import { controllerOf } from './control';
import { asking } from './damage-effects';
import type { OrderFlow } from './damage-order';
import { derive } from './derive';
import { done, type StepOutcome } from './step-outcome';
import { makeSettled } from './token-batch';

type Amass = Extract<Instruction, { kind: 'amass' }>;

/** The creature type every Army has (CR 205.3m). */
const ARMY = 'Army';

/** The Army creatures `seat` controls, by age (CR 701.47a). */
export function armiesOf(state: GameState, seat: number): ObjectId[] {
  return Object.values(state.objects)
    .filter((o) => {
      if (o.zone !== 'battlefield' || controllerOf(state, o) !== seat) return false;
      const d = derive(state, o);
      return d.types.includes('creature') && d.subtypes.includes(ARMY);
    })
    .map((o) => o.id)
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

/** "A 0/0 black [subtype] Army creature token" (CR 701.47a). A token with no name of its own is named for its subtypes (CR 111.4). */
export function armyToken(subtype: Subtype): TokenDefinition {
  const subtypes = subtype === ARMY ? [ARMY] : [subtype, ARMY];
  return {
    name: subtypes.join(' '),
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes,
    colors: ['B'],
    power: 0,
    toughness: 0,
    loyalty: null,
    defense: null,
    oracleText: '',
    abilities: [],
  };
}

/**
 * Runs `amass` for the controller of the effect (CR 701.47a). The first run makes the token when the controller has no Army and puts the instruction back with
 * `made` set (so a token that asks its own question is made first, and the Armies the controller chooses among are on the battlefield for the question to name);
 * the next run chooses the Army and puts the counters on it.
 */
export function runAmass(
  state: GameState,
  res: ResolutionContext,
  ins: Amass,
  flow: OrderFlow,
): StepOutcome {
  const seat = res.controller;
  if (ins.made !== true && armiesOf(state, seat).length === 0) {
    const made = makeSettled(
      state,
      res,
      seat,
      [{ definition: armyToken(ins.subtype), count: 1, original: true }],
      false,
      flow,
    );
    if (made.kind === 'asked') return asking(state, made);
    return done(made.state, made.events, [...made.front, { ...ins, made: true }]);
  }
  const events: GameEvent[] = [];
  let next = state;
  const armies = armiesOf(next, seat);
  const picked = ins.chosen?.[0] ?? (armies.length === 1 ? armies[0] : undefined);
  if (picked === undefined && armies.length > 1) {
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'choosePermanent',
        seat,
        source: res.object,
        purpose: 'amass',
        min: 1,
        max: 1,
        legal: armies,
      },
    };
  }
  const obj = picked === undefined ? undefined : next.objects[picked];
  // CR 701.47b: the player amassed even when nothing could be done (a replacement made no Army token, the chosen Army left).
  if (picked === undefined || obj === undefined) return done(next, events);
  if (ins.amount > 0) {
    next = patchObject(next, picked, {
      counters: { ...obj.counters, '+1/+1': (obj.counters['+1/+1'] ?? 0) + ins.amount },
    });
    events.push({
      kind: 'counterAdded',
      object: picked,
      counter: '+1/+1',
      count: ins.amount,
      by: seat,
    });
  }
  // "If it isn't a [subtype], it becomes a [subtype] in addition to its other types."
  if (!derive(next, obj).subtypes.includes(ins.subtype)) {
    const [timestamp, stamped] = allocateTimestamp(next);
    const becomes: ContinuousEffect = {
      id: `ce${timestamp}`,
      timestamp,
      objects: [picked],
      until: 'permanent',
      change: { kind: 'setTypes', subtypes: [ins.subtype], additive: true },
    };
    next = { ...stamped, continuousEffects: [...stamped.continuousEffects, becomes] };
  }
  return done(next, events);
}
