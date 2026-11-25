// Chaos Dragon: "At the beginning of combat on your turn, each player rolls a d20. If one or more opponents had the highest result, this creature can't attack those players or
// planeswalkers they control this combat." (the SYNTHETIC creature of this file has the same ability as an `eachPlayerRollsBarHighest` node).
// Pins: CR 706.1 / 706.2 (every player rolls one die; the result is the natural one), CR 508.1a (the restriction is on the declaration of attackers), CR 511.3 (it ends with the combat).
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/index';
import { highestOpponentRollers } from '../src/rules/roll-off';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const DRAGON = 'SYNTHETIC Chaos Wyrm';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const dragon = singleFaceCard({
  name: DRAGON,
  manaCost: ['1', 'R', 'R'],
  types: ['creature'],
  subtypes: ['Dragon'],
  colors: ['R'],
  colorIdentity: ['R'],
  power: 4,
  toughness: 4,
  oracleText: 'Flying, haste',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'flying' } },
    { kind: 'keyword', keyword: { kind: 'haste' } },
    {
      kind: 'triggered',
      trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
      effect: { kind: 'eachPlayerRollsBarHighest', sides: 20, creature: { kind: 'this' } },
    },
  ],
});

const build = (seed: number) =>
  scenario()
    .seed(seed)
    .seat(0)
    .define(dragon)
    .library(...LIBRARY)
    .battlefield(DRAGON)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0 })
    .build();

const roll = (seat: number, result: number) => ({ seat, result });

describe('the card is valid', () => {
  test('the node validates', () => {
    expect(validateCard(dragon)).toEqual([]);
  });
});

describe('who had the highest result (CR 706.2)', () => {
  test('opponents with the highest result, ties included; the controller alone is none', () => {
    expect(highestOpponentRollers([roll(0, 5), roll(1, 9)], 0)).toEqual([1]);
    expect(highestOpponentRollers([roll(0, 9), roll(1, 9)], 0)).toEqual([1]);
    expect(highestOpponentRollers([roll(0, 12), roll(1, 9)], 0)).toEqual([]);
    expect(highestOpponentRollers([roll(0, 3), roll(1, 17), roll(2, 17), roll(3, 8)], 0)).toEqual([
      1, 2,
    ]);
    expect(highestOpponentRollers([roll(0, 3), roll(1, 7), roll(2, 17)], 1)).toEqual([2]);
  });
});

describe('the trigger at the beginning of combat', () => {
  test.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])(
    'seed %i: both players roll; the dragon is barred from the opponent exactly when they rolled at least as high',
    (seed) => {
      const g = build(seed);
      g.advanceTo('declareAttackers', { attack: false });
      const rolls = g.events.flatMap((e) =>
        e.kind === 'dieRolled' ? [{ seat: e.seat, sides: e.sides, result: e.result }] : [],
      );
      expect(rolls.map((r) => r.seat).sort()).toEqual([0, 1]);
      expect(rolls.every((r) => r.sides === 20 && r.result >= 1 && r.result <= 20)).toBe(true);
      const mine = rolls.find((r) => r.seat === 0)?.result ?? 0;
      const theirs = rolls.find((r) => r.seat === 1)?.result ?? 0;
      const barred = g.state.continuousEffects.filter((e) => e.change.kind === 'cantAttackPlayer');
      if (theirs >= mine) {
        expect(barred).toHaveLength(1);
        expect(() =>
          g.act(0).declareAttackers([{ attacker: DRAGON, target: { player: 1 } }]),
        ).toThrow();
      } else {
        expect(barred).toHaveLength(0);
        g.act(0).declareAttackers([{ attacker: DRAGON, target: { player: 1 } }]);
        g.expect.combat({ attackers: [DRAGON] });
      }
    },
  );

  test('the restriction ends with the combat (CR 511.3)', () => {
    // Find a seed where the opponent rolled highest, then check the effect is gone after combat.
    for (let seed = 1; seed < 40; seed += 1) {
      const g = build(seed);
      g.advanceTo('declareAttackers', { attack: false });
      if (!g.state.continuousEffects.some((e) => e.change.kind === 'cantAttackPlayer')) continue;
      g.advanceTo('postcombatMain');
      expect(g.state.continuousEffects.filter((e) => e.change.kind === 'cantAttackPlayer')).toEqual(
        [],
      );
      return;
    }
    throw new Error('no seed gave the opponent the highest result');
  });
});
