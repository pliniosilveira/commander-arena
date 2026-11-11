/**
 * The web side of D-189 (the Korvold slice 8a) as pure models, no DOM: the words of "Whenever an opponent taps an artifact for mana" and of "gain control
 * of ..." with each duration, the log line of a permanent that changed controller, and the line of the card preview that says whose a taken permanent is and
 * for how long. The cards are the engine's SYNTHETIC fixtures (`synthetic-control.ts`).
 */
import type { Ability, CardDefinition, ObjectView, StackAbility } from '@commander-arena/engine';
import { syntheticCard } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';
import { controlDurationText, controlFact } from '../src/game/korvold-text';
import { triggerCondition, triggerGist } from '../src/ui/decisions/ability-label';

const faceOf = (card: CardDefinition) => {
  const face = card.faces[0];
  if (face === undefined) throw new Error(`${card.name} has no face`);
  return face;
};

const NABBER = syntheticCard('SYNTHETIC Treasure Nabber');
const LEASH = syntheticCard('SYNTHETIC Mind Leash');

const triggered = (card: CardDefinition) => {
  const ability = faceOf(card).abilities[0];
  if (ability?.kind !== 'triggered') throw new Error('no triggered ability');
  return ability as Ability & { kind: 'triggered' };
};

test('Treasure Nabber is said in the words of the card', () => {
  const ability = triggered(NABBER);
  const source = { subtypes: faceOf(NABBER).subtypes, oracleText: faceOf(NABBER).oracleText };
  expect(triggerCondition(ability as unknown as StackAbility, NABBER.name, source as never)).toBe(
    'Whenever an opponent taps an artifact for mana',
  );
  expect(
    triggerGist(ability as unknown as StackAbility, { types: faceOf(NABBER).types } as never),
  ).toBe('Gain control of it until the end of your next turn');
});

test('the other players and the other durations', () => {
  const nabber = triggered(NABBER);
  const say = (trigger: unknown) =>
    triggerCondition({ ...nabber, trigger } as unknown as StackAbility, NABBER.name, {
      subtypes: [],
      oracleText: '',
    } as never);
  expect(say({ kind: 'tapsForMana', who: 'you', what: { types: ['land'] } })).toBe(
    'Whenever you tap a land for mana',
  );
  expect(say({ kind: 'tapsForMana', who: 'any', what: { types: ['artifact'] } })).toBe(
    'Whenever a player taps an artifact for mana',
  );
  expect(controlDurationText('untilEndOfTurn', 'creature')).toBe(' until end of turn');
  expect(controlDurationText('permanent', 'creature')).toBe('');
  expect(controlDurationText('forAsLongAsYouControlThis', 'creature')).toBe(
    ' for as long as you control this creature',
  );
});

test('Mind Leash: a target and a duration that names the permanent itself', () => {
  const ability = triggered(LEASH);
  expect(
    triggerGist(ability as unknown as StackAbility, { types: faceOf(LEASH).types } as never),
  ).toBe('Gain control of target creature for as long as you control this creature');
});

test('the log says who gained control of what, and the tap itself is not said twice', () => {
  const state = {
    objects: { o1: { id: 'o1', owner: 1, token: { characteristics: { name: 'Sol Ring' } } } },
    lki: {},
    pending: null,
  } as never;
  const gained = describeEvent(
    { kind: 'controlChanged', object: 'o1', from: 1, to: 0 } as never,
    state,
    state,
    0,
  );
  expect(gained?.text).toMatch(/^You gain control of /);
  expect(gained?.rule).toBe('CR 613.1b');
  expect(
    describeEvent(
      { kind: 'controlChanged', object: 'o1', from: 0, to: 1 } as never,
      state,
      state,
      0,
    )?.text,
  ).toMatch(/^Opponent gains control of /);
  expect(
    describeEvent({ kind: 'tappedForMana', object: 'o1', seat: 1 } as never, state, state, 0),
  ).toBeNull();
});

test('the preview of a taken permanent says whose it is and for how long', () => {
  const ctx = (activeSeat: 0 | 1) => ({
    viewer: 0 as const,
    activeSeat,
    nameOf: (id: string) => (id === 'o9' ? 'Mind Leash' : null),
  });
  const taken = (controlEnds: ObjectView['controlEnds'], owner: 0 | 1 = 1) =>
    ({ owner, controlEnds }) as Pick<ObjectView, 'owner' | 'controlEnds'>;
  expect(controlFact({ owner: 1 } as never, ctx(0))).toBeNull();
  expect(controlFact(taken('endOfTurn'), ctx(0))).toBe(
    "Taken from its owner (the opponent's) until end of turn",
  );
  expect(controlFact(taken('never'), ctx(0))).toBe(
    "Taken from its owner (the opponent's) with no end stated",
  );
  expect(controlFact(taken({ endOfTurnOf: 0 }), ctx(1))).toBe(
    "Taken from its owner (the opponent's) until the end of your next turn",
  );
  expect(controlFact(taken({ endOfTurnOf: 0 }), ctx(0))).toBe(
    "Taken from its owner (the opponent's) until the end of your turn",
  );
  expect(controlFact(taken({ endOfTurnOf: 1 }, 0), ctx(0))).toBe(
    "Taken from its owner (yours) until the end of the opponent's next turn",
  );
  expect(controlFact(taken({ whileControlling: 'o9' as never }), ctx(0))).toBe(
    "Taken from its owner (the opponent's) for as long as Mind Leash stays under that player's control",
  );
});
