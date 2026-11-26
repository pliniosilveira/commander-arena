// "During each opponent's end step, you may cast spells as though they had flash." (the permission of the Revenant Recon deck's Final-Word Phantom): `castAsThoughFlash` of a
// permanent with the condition `opponentsEndStep`.
// Pins: CR 601.3b (an effect may let a player cast a spell at a time they could not), CR 117.1a (sorcery timing), CR 513.1 (the end step), CR 611.3a (a condition of a static
// ability), and that the condition names an opponent in any seat count: the end step of any other player's turn. The card is SYNTHETIC, defined in this file.
import { describe, expect, test } from 'vitest';
import { type Action, getLegalActions, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const WATCHER = 'SYNTHETIC End Step Watcher';
const BEARS = 'Grizzly Bears';

const watcher = singleFaceCard({
  name: WATCHER,
  manaCost: ['2', 'U'],
  types: ['creature'],
  subtypes: ['Spirit'],
  colors: ['U'],
  colorIdentity: ['U'],
  power: 1,
  toughness: 4,
  oracleText: "During each opponent's end step, you may cast spells as though they had flash.",
  abilities: [
    {
      kind: 'static',
      static: { kind: 'castAsThoughFlash', spells: { controller: 'you' } },
      condition: { kind: 'opponentsEndStep' },
    },
  ],
});

const castable = (g: ScenarioGame, seat: number, name: string): boolean => {
  const id = g.id({ name, zone: 'hand', seat });
  return getLegalActions(g.state, seat).some(
    (a: Action) => a.kind === 'castSpell' && a.object === id,
  );
};

/** Seat 0 has the watcher, a Bear in hand and mana; `active` is the seat whose turn it is, in `step`, with priority to seat 0. */
function board(step: 'end' | 'upkeep' | 'postcombatMain', active: 0 | 1 | 2) {
  const b = scenario({ seats: 3 })
    .define(watcher)
    .seat(0)
    .hand(BEARS)
    .battlefield(WATCHER)
    .battlefield('Forest', { count: 4 })
    .seat(1)
    .seat(2);
  return b.at(step, { active, priority: 0 }).build();
}

describe('the card is valid', () => {
  test('the permission with the condition is accepted; another condition is not', () => {
    expect(validateCard(watcher)).toEqual([]);
    const face = watcher.faces[0];
    const ability = face?.abilities[0];
    if (face === undefined || ability === undefined) throw new Error('no ability');
    const other = {
      ...watcher,
      faces: [{ ...face, abilities: [{ ...ability, condition: { kind: 'yourTurn' } }] }],
    };
    expect(validateCard(other as never).length).toBeGreaterThan(0);
  });
});

describe('"During each opponent\'s end step, you may cast spells as though they had flash"', () => {
  test('in the end step of an opponent a creature spell may be cast', () => {
    expect(castable(board('end', 1), 0, BEARS)).toBe(true);
  });

  test('in the end step of every opponent, with three seats', () => {
    expect(castable(board('end', 2), 0, BEARS)).toBe(true);
  });

  test('not in the end step of its controller (a creature spell needs sorcery timing)', () => {
    expect(castable(board('end', 0), 0, BEARS)).toBe(false);
  });

  test('not in another step of an opponent: the permission is for the end step only', () => {
    expect(castable(board('upkeep', 1), 0, BEARS)).toBe(false);
    expect(castable(board('postcombatMain', 1), 0, BEARS)).toBe(false);
  });

  test('the spell is cast and resolves in the opponent end step', () => {
    const g = board('end', 1);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('without the permanent nobody gets the permission', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS)
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .at('end', { active: 1, priority: 0 })
      .build();
    expect(castable(g, 0, BEARS)).toBe(false);
  });
});
