// "You may untap all lands you control. If you do, you can't cast spells until your next turn." (issue 128, Innocuous Researcher): the validation of `may` around `untap` and of the
// duration `untilYourNextTurn` of `playerCantCastSpells`. CR 701.26a (untap), 608.2c ("if you do"), 101.2 and 611.2a (can't cast until a time), 500.1.
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/index';
import { singleFaceCard } from './dsl-helpers';

const LANDS = { kind: 'each', filter: { types: ['land'], controller: 'you' } } as const;

const card = (effect: unknown) =>
  singleFaceCard({
    name: 'SYNTHETIC May Untap',
    manaCost: ['1'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: 'SYNTHETIC',
    abilities: [
      { kind: 'triggered', trigger: { kind: 'endStep', whose: 'you' }, effect: effect as never },
    ],
  });

describe('you may untap, if you do', () => {
  const lock = {
    kind: 'playerCantCastSpells',
    player: { kind: 'you' },
    duration: 'untilYourNextTurn',
  };
  test('a group untap, then the lock, is valid', () => {
    const seq = {
      kind: 'sequence',
      effects: [
        { kind: 'may', effect: { kind: 'untap', objects: LANDS } },
        { kind: 'conditional', condition: { kind: 'didPrevious' }, effect: lock },
      ],
    };
    expect(validateCard(card(seq))).toEqual([]);
  });

  test('an untap of permanents the player chooses is refused inside a may', () => {
    const choose = { kind: 'choose', filter: { types: ['land'], controller: 'you' }, count: 2 };
    expect(
      validateCard(card({ kind: 'may', effect: { kind: 'untap', objects: choose } })).length,
    ).toBeGreaterThan(0);
  });

  test('the lock lasts until end of turn or until the controller’s next turn, nothing else', () => {
    expect(validateCard(card(lock))).toEqual([]);
    expect(validateCard(card({ ...lock, duration: 'untilEndOfTurn' }))).toEqual([]);
    expect(validateCard(card({ ...lock, duration: 'untilNextTurn' })).length).toBeGreaterThan(0);
  });
});
