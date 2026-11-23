// Scions of Spellcraft deck, group D (Alisaie Leveilleur): "The second spell you cast each turn costs {2} less to cast."
// Pins: CR 601.2f (the total cost is determined as the spell is cast, with the spells cast before it this turn counted), CR 601.2i (a spell counts once it is cast), CR 118.7a (only
// generic mana is reduced), "you cast" (an opponent's spells are not reduced and do not count), CR 604.2 (a static ability of a permanent).
// Cards: SYNTHETIC Dualcaster ({2}{W}), the real Grizzly Bears ({1}{G}), SYNTHETIC Vanilla 3/3 and the basic lands.
import { describe, expect, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const DUALCASTER = 'SYNTHETIC Dualcaster';
const BEARS = 'Grizzly Bears';

const dualcaster = singleFaceCard({
  name: DUALCASTER,
  manaCost: ['2', 'W'],
  types: ['creature'],
  subtypes: ['Elf', 'Wizard'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 3,
  toughness: 2,
  oracleText: 'The second spell you cast each turn costs {2} less to cast.',
  abilities: [
    {
      kind: 'static',
      static: {
        kind: 'costReduction',
        spells: { controller: 'you', nthSpellThisTurn: 2 },
        amount: 2,
      },
    },
  ],
});

/** Seat 0 has `forests` Forests (and the Dualcaster, or not) with three Bears in hand: {1}{G} each. */
function board(withDualcaster: boolean, forests: number): ScenarioGame {
  return scenario()
    .seat(0)
    .define(dualcaster)
    .hand(BEARS, BEARS, BEARS)
    .battlefield(...Array<string>(forests).fill('Forest'), ...(withDualcaster ? [DUALCASTER] : []))
    .library('Forest', 'Forest', 'Forest')
    .seat(1)
    .library('Forest', 'Forest', 'Forest')
    .at('precombatMain')
    .build();
}

/** Casts the next Bears of the hand and lets it resolve. */
function castBears(g: ScenarioGame): void {
  g.act(0).cast({ name: BEARS, zone: 'hand', nth: 0 }, { pay: true });
  g.passAll();
}

describe('"The second spell you cast each turn costs {2} less to cast."', () => {
  test('the first spell is not reduced: with one Forest the Bears ({1}{G}) cannot be cast', () => {
    const g = scenario()
      .seat(0)
      .define(dualcaster)
      .hand(BEARS)
      .battlefield('Forest', DUALCASTER)
      .library('Forest', 'Forest', 'Forest')
      .seat(1)
      .library('Forest', 'Forest', 'Forest')
      .at('precombatMain')
      .build();
    expect(() => g.act(0).cast({ name: BEARS, zone: 'hand', nth: 0 }, { pay: true })).toThrow(
      /engine rejected/,
    );
  });

  test('the second spell costs {G}: two Forests pay the first Bears, and the third pays the second', () => {
    const g = board(true, 3);
    castBears(g);
    castBears(g);
    expect(g.state.seats[0]?.spellsCastThisTurn).toBe(2);
    g.expect.invariants();
  });

  test('without the Dualcaster the second spell is not reduced: one Forest left cannot pay {1}{G}', () => {
    const g = board(false, 3);
    castBears(g);
    expect(() => g.act(0).cast({ name: BEARS, zone: 'hand', nth: 0 }, { pay: true })).toThrow(
      /engine rejected/,
    );
  });

  test('the third spell is not reduced: only the second is, so one Forest cannot pay it', () => {
    const g = board(true, 4);
    castBears(g);
    castBears(g);
    // One Forest is left; reduced by {2} the third would cost {G} and be castable.
    expect(() => g.act(0).cast({ name: BEARS, zone: 'hand', nth: 0 }, { pay: true })).toThrow(
      /engine rejected/,
    );
  });
});
