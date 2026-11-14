/**
 * Fight (CR 701.14, D-145): the `fight` effect and its pairing of creatures. "Target creature you control fights target creature you don't
 * control" is one fight (`fightOnce`); "Each of those tokens fights a different one of those creatures" is run as the instruction `fightPairs`:
 * for each creature that fights, in order, the controller of the effect chooses a creature of the group no earlier fighter took
 * (a `choosePermanent` decision, purpose 'fight', unless only one is left), and when every fighter has a partner the fights are made one
 * after the other.
 *
 * CR 701.14a: each of the two creatures deals damage equal to its power to the other. CR 701.14b: if either is no longer a creature on the
 * battlefield, no damage is dealt. The damage is dealt by the creatures themselves (CR 120.3), all at once: both powers are read before
 * either creature is dealt damage, and a prevention effect, lifelink, deathtouch and the rest apply to each part as they do to any damage.
 */
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { dealDamageAsking } from './damage';
import type { Asked, OrderFlow } from './damage-order';
import { derive } from './derive';
import { done, type StepOutcome } from './step-outcome';

type FightPairs = Extract<Instruction, { kind: 'fightPairs' }>;

/** Whether the object is a creature on the battlefield now (CR 701.14b). */
export function isFightingCreature(state: GameState, id: ObjectId): boolean {
  const obj = state.objects[id];
  return obj?.zone === 'battlefield' && derive(state, obj).types.includes('creature');
}

/**
 * One fight (CR 701.14a, 701.14b): nothing happens unless both are creatures on the battlefield. The two damage events may ask the
 * affected players which prevention effect to apply first (`flow`, D-191), in which case the question is returned and nothing was dealt.
 */
export function fightOnce(
  state: GameState,
  a: ObjectId,
  b: ObjectId,
  flow: OrderFlow,
): { state: GameState; events: GameEvent[]; fought: boolean } | Asked {
  if (a === b || !isFightingCreature(state, a) || !isFightingCreature(state, b)) {
    return { state, events: [], fought: false };
  }
  // CR 701.14a: both amounts are the powers the creatures have as the fight begins.
  const [objA, objB] = [state.objects[a], state.objects[b]];
  if (objA === undefined || objB === undefined) return { state, events: [], fought: false };
  const powerA = derive(state, objA).power ?? 0;
  const powerB = derive(state, objB).power ?? 0;
  const events: GameEvent[] = [{ kind: 'fought', objects: [a, b] }];
  const first = dealDamageAsking(state, a, { kind: 'object', id: b }, powerA, false, flow);
  if (first.kind === 'asked') return first;
  events.push(...first.events);
  const second = dealDamageAsking(first.state, b, { kind: 'object', id: a }, powerB, false, flow);
  if (second.kind === 'asked') return second;
  events.push(...second.events);
  return { state: second.state, events, fought: true };
}

/** One stage of the pairing: choose a partner for the first fighter, or, with every fighter placed, make the fights. */
export function runFightPairs(
  state: GameState,
  res: ResolutionContext,
  ins: FightPairs,
  flow: OrderFlow,
): StepOutcome {
  const [fighter, ...rest] = ins.fighters;
  if (fighter === undefined) return makeFights(state, ins.pairs, flow);
  const taken = ins.pairs.map(([, partner]) => partner);
  const left = ins.pool.filter((id) => !taken.includes(id) && isFightingCreature(state, id));
  // A fighter that is gone, or that has nothing left to fight, fights nothing (CR 701.14b).
  if (!isFightingCreature(state, fighter) || left.length === 0) {
    return done(state, [], [{ ...ins, fighters: rest, chosen: null }]);
  }
  const partner = ins.chosen?.[0] ?? (left.length === 1 ? left[0] : undefined);
  if (partner !== undefined) {
    const events: GameEvent[] =
      ins.chosen === null
        ? [
            {
              kind: 'permanentsChosen',
              seat: res.controller,
              source: res.object,
              objects: [partner],
              purpose: 'fight',
              automatic: true,
              subject: fighter,
            },
          ]
        : [
            {
              kind: 'permanentsChosen',
              seat: res.controller,
              source: res.object,
              objects: [partner],
              purpose: 'fight',
              automatic: false,
              subject: fighter,
            },
          ];
    return done(state, events, [
      { ...ins, fighters: rest, pairs: [...ins.pairs, [fighter, partner]], chosen: null },
    ]);
  }
  return {
    state,
    events: [],
    front: [],
    needs: {
      kind: 'choosePermanent',
      seat: res.controller,
      source: res.object,
      purpose: 'fight',
      subject: fighter,
      min: 1,
      max: 1,
      legal: left,
    },
  };
}

/** The fights of the pairs, one after the other; a question stops them all, with none made (the instruction runs again with the answer). */
function makeFights(
  state: GameState,
  pairs: readonly (readonly [ObjectId, ObjectId])[],
  flow: OrderFlow,
): StepOutcome {
  let next = state;
  const events: GameEvent[] = [];
  let fights = 0;
  for (const [a, b] of pairs) {
    const r = fightOnce(next, a, b, flow);
    if ('decision' in r) return { state, events: [], front: [], needs: r.decision };
    next = r.state;
    events.push(...r.events);
    if (r.fought) fights += 1;
  }
  return { ...done(next, events), performed: fights };
}
