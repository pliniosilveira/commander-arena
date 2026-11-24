// The validator of the vote results (CR 701.38a): the conditions `voteMost` and `voteTied`, the effect `repeat`, `forEachPlayer` with `runsAs`, the object `ringBearer` and the condition
// `enteredThisTurn` with `other`.
import { describe, expect, test } from 'vitest';
import type { Ability, Condition, Effect } from '../src/ast/types';
import { SUPPORTED_FEATURES, syntheticCard, validateCard } from '../src/index';

const SORCERY = 'SYNTHETIC Ballot Rite';
const CREATURE = 'SYNTHETIC Token Cheerer';

const withEffect = (effect: Effect) => {
  const card = syntheticCard(SORCERY);
  const face = card.faces[0];
  if (face === undefined) throw new Error('no face');
  return { ...card, faces: [{ ...face, spell: { effect } }] } as never;
};
const withAbility = (ability: Ability) => {
  const card = syntheticCard(CREATURE);
  const face = card.faces[0];
  if (face === undefined) throw new Error('no face');
  return { ...card, faces: [{ ...face, abilities: [ability] }] } as never;
};
const vote: Effect = { kind: 'vote', options: ['gold', 'iron'], startingWith: 'you' };
const draw: Effect = { kind: 'draw', player: { kind: 'you' }, count: 1 };
const when = (condition: Condition): Effect => ({ kind: 'conditional', condition, effect: draw });
const sequence = (...effects: Effect[]): Effect => ({ kind: 'sequence', effects });
const messages = (effect: Effect) => validateCard(withEffect(effect)).map((i) => i.message);

describe('the supported features', () => {
  test('the conditions, the effect and the object are listed', () => {
    expect(SUPPORTED_FEATURES.conditionKinds).toContain('voteMost');
    expect(SUPPORTED_FEATURES.conditionKinds).toContain('voteTied');
    expect(SUPPORTED_FEATURES.effectKinds).toContain('repeat');
  });
});

describe('voteMost and voteTied', () => {
  test('after a vote that offers the option they are valid, alone and in an or', () => {
    expect(messages(sequence(vote, when({ kind: 'voteMost', option: 'gold' })))).toEqual([]);
    expect(messages(sequence(vote, when({ kind: 'voteTied' })))).toEqual([]);
    expect(
      messages(
        sequence(
          vote,
          when({ kind: 'or', terms: [{ kind: 'voteMost', option: 'iron' }, { kind: 'voteTied' }] }),
        ),
      ),
    ).toEqual([]);
  });

  test('without a vote before them they are refused', () => {
    expect(messages(sequence(when({ kind: 'voteMost', option: 'gold' }))).join()).toMatch(
      /needs a vote effect before it/,
    );
    expect(messages(sequence(when({ kind: 'voteTied' }), vote)).join()).toMatch(
      /needs a vote effect before it/,
    );
  });

  test('an option the vote does not offer, and one with no words, are refused', () => {
    expect(messages(sequence(vote, when({ kind: 'voteMost', option: 'copper' }))).join()).toMatch(
      /"copper" is not an option of the vote/,
    );
    expect(messages(sequence(vote, when({ kind: 'voteMost', option: ' ' }))).join()).toMatch(
      /names the option/,
    );
  });

  test('outside a conditional effect they are refused (a trigger condition cannot read a vote)', () => {
    const ability: Ability = {
      kind: 'triggered',
      trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
      interveningIf: { kind: 'voteTied' },
      effect: draw,
    };
    expect(
      validateCard(withAbility(ability))
        .map((i) => i.message)
        .join(),
    ).toMatch(/only valid in a conditional effect after a vote/);
  });
});

describe('repeat', () => {
  const repeat = (times: unknown): Effect => ({ kind: 'repeat', times, effect: draw }) as never;

  test('a tally of a vote before it is a valid number of times, a plain number too', () => {
    expect(messages(sequence(vote, repeat({ kind: 'votesFor', option: 'gold' })))).toEqual([]);
    expect(messages(repeat(3))).toEqual([]);
  });

  test('a tally with no vote before it is refused: the amount says so', () => {
    expect(messages(repeat({ kind: 'votesFor', option: 'gold' })).join()).toMatch(
      /needs a vote effect before it/,
    );
  });

  test('the effect it repeats is checked', () => {
    const bad: Effect = { kind: 'repeat', times: 2, effect: { kind: 'draw', count: 1 } as never };
    expect(messages(bad).length).toBeGreaterThan(0);
  });
});

describe('forEachPlayer with runsAs', () => {
  const each = (runsAs: unknown): Effect =>
    ({ kind: 'forEachPlayer', players: { kind: 'eachPlayer' }, runsAs, effect: draw }) as never;

  test("'each' is valid and anything else is refused", () => {
    expect(messages(each('each'))).toEqual([]);
    expect(messages(each(undefined))).toEqual([]);
    expect(messages(each('chooser')).join()).toMatch(/runsAs is 'each'/);
  });
});

describe('the object ringBearer', () => {
  test('counters can be put on it', () => {
    const put: Effect = {
      kind: 'addCounters',
      objects: { kind: 'ringBearer' },
      counter: '+1/+1',
      count: 1,
    };
    expect(messages(put)).toEqual([]);
  });
});

describe('enteredThisTurn with other', () => {
  const entered = (other: unknown): Condition =>
    ({ kind: 'enteredThisTurn', count: 1, subtypes: ['Elf'], other }) as never;

  test('a triggered ability may read it; other is true when present', () => {
    const trigger = (other: unknown): Ability => ({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
      interveningIf: entered(other),
      effect: draw,
    });
    expect(validateCard(withAbility(trigger(true)))).toEqual([]);
    expect(
      validateCard(withAbility(trigger(false)))
        .map((i) => i.message)
        .join(),
    ).toMatch(/other must be true/);
  });

  test('a static ability may not: it has no permanent to leave out in layers 4 and 5', () => {
    const ability: Ability = {
      kind: 'static',
      static: {
        kind: 'setPt',
        subject: { kind: 'this' },
        power: 5,
        toughness: 5,
      },
      condition: entered(true),
    };
    expect(
      validateCard(withAbility(ability))
        .map((i) => i.message)
        .join(),
    ).toMatch(/does not read 'another' permanent/);
    expect(
      validateCard(withAbility({ ...ability, condition: entered(undefined) } as Ability)),
    ).toEqual([]);
  });
});
