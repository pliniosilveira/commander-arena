// The Squirreled Away deck, group 1: the two replacement effects of the creation of tokens (CR 614.1a, 111.10, 614.5), the Blood token (CR 111.10) and "a token you
// control" as the subject of a trigger (CR 111.1, 603.6c). The lines are the real Oracle text of the acceptance cards of the golden corpus, read through the whole
// pipeline; the others are near misses the grammar must not read. The engine runs what is lowered in packages/engine/test/scenario-xx-squirrel-g1-tokens.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, read, readAll } from './parser-p5-helpers';

const SQUIRREL = {
  kind: 'custom',
  definition: {
    name: 'Squirrel',
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: ['Squirrel'],
    colors: ['G'],
    power: 1,
    toughness: 1,
    loyalty: null,
    defense: null,
    oracleText: '',
    abilities: [],
  },
};

describe('"If you would create a Clue, Food, or Treasure token, instead create one of each."', () => {
  test('the real line: tokensInstead in eachOf mode, naming the three predefined tokens', () => {
    expect(
      readAll(
        'If you would create a Clue, Food, or Treasure token, instead create one of each.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'replacement',
        replacement: {
          kind: 'tokensInstead',
          what: {
            token: true,
            anyOf: [{ subtypes: ['Clue'] }, { subtypes: ['Food'] }, { subtypes: ['Treasure'] }],
          },
          mode: 'eachOf',
          tokens: ['Clue', 'Food', 'Treasure'],
        },
      },
    ]);
  });

  test('near misses are dropped, never half read', () => {
    for (const text of [
      'If you would create a Clue or Food token, instead create one of each.',
      'If you would create a Clue, Food, or Treasure token, instead create two of each.',
      'If an opponent would create a Clue, Food, or Treasure token, instead they create one of each.',
    ]) {
      expect(read(text, 'creature').abilities, text).toEqual([]);
      expect(dropped(text, 'creature'), text).toBeDefined();
    }
  });
});

describe('"If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead."', () => {
  test('the real line: tokensInstead in plusThatMany mode, naming every token and the Squirrel', () => {
    expect(
      readAll(
        'If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'replacement',
        replacement: {
          kind: 'tokensInstead',
          what: { token: true },
          mode: 'plusThatMany',
          token: SQUIRREL,
        },
      },
    ]);
  });

  test('"an additional" is the other rule, and creature tokens only are not read here', () => {
    for (const text of [
      'If one or more tokens would be created under your control, those tokens plus two 1/1 green Squirrel creature tokens are created instead.',
      'If one or more creature tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.',
    ]) {
      expect(read(text, 'creature').abilities, text).toEqual([]);
      expect(dropped(text, 'creature'), text).toBeDefined();
    }
  });
});

describe('"Whenever a creature an opponent controls dies, you create a Blood token."', () => {
  test('the Blood token is a predefined token', () => {
    expect(
      readAll(
        'Whenever a creature an opponent controls dies, you create a Blood token.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { types: ['creature'], controller: 'opponent' } },
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Blood' }, count: 1 },
      },
    ]);
  });
});

describe('"Whenever a token you control leaves the battlefield, ..."', () => {
  test('a token you control is the subject of a leaves trigger', () => {
    expect(
      readAll(
        'Whenever a token you control leaves the battlefield, each opponent loses 1 life and you gain 1 life.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'leavesBattlefield', what: { token: true, controller: 'you' } },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 },
            { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
          ],
        },
      },
    ]);
  });

  test('an opponent’s token: the controller is the opponent', () => {
    const [ability] = readAll(
      'Whenever a token an opponent controls leaves the battlefield, you gain 1 life.',
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'leavesBattlefield', what: { token: true, controller: 'opponent' } },
    });
  });
});
