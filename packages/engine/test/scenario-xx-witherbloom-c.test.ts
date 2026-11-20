// Witherbloom Witchcraft group C (issue 190): "Destroy each nonland permanent with mana value X or less" (a sweeper that reads the X announced for the spell).
// Pins: CR 107.3a (the controller announces X as the spell is cast), CR 202.3 (mana value of a permanent: the X of a cost counts 0 off the stack, CR 202.3e), CR 701.8 (destroy).
// Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const GAZE = 'SYNTHETIC Granite Gaze C';
const eachAtMostX = {
  kind: 'destroy',
  objects: {
    kind: 'each',
    filter: { notTypes: ['land'], manaValueAtMost: { kind: 'x' } },
  },
} as const;
const gaze = singleFace({
  name: GAZE,
  manaCost: ['X', 'B', 'B', 'G'],
  types: ['sorcery'],
  colors: ['B', 'G'],
  colorIdentity: ['B', 'G'],
  oracleText: 'Destroy each nonland permanent with mana value X or less.',
  spell: { x: true, effect: eachAtMostX },
});

describe('"Destroy each nonland permanent with mana value X or less" (CR 107.3a, 202.3, 701.8)', () => {
  test('the card is valid; the same effect with no X to read is not', () => {
    expect(validateCard(gaze)).toEqual([]);
    const noX = singleFace({
      name: 'SYNTHETIC Granite Gaze C No X',
      manaCost: ['B'],
      types: ['sorcery'],
      colors: ['B'],
      colorIdentity: ['B'],
      oracleText: 'Destroy each nonland permanent with mana value X or less.',
      spell: { effect: eachAtMostX },
    });
    expect(validateCard(noX).length).toBeGreaterThan(0);
  });

  const game = (x: number) => {
    const g = scenario()
      .define(gaze)
      .seat(0)
      .hand(GAZE)
      .battlefield('Swamp', { count: 4 })
      .battlefield('Forest', { count: 4 })
      .battlefield('Grizzly Bears')
      .seat(1)
      .battlefield('Giant Spider')
      .battlefield('Grizzly Bears')
      .battlefield('Plains')
      .build();
    g.act(0).cast(GAZE, { x, pay: true });
    g.passAll();
    return g;
  };

  test('X = 2 destroys every nonland permanent of mana value 2 or less, whoever controls it, and keeps lands and larger ones', () => {
    const g = game(2);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.zone('Giant Spider', 'battlefield', { seat: 1 });
    g.expect.zone('Plains', 'battlefield', { seat: 1 });
  });

  test('X = 4 destroys the Spider too; X = 0 destroys neither creature', () => {
    const big = game(4);
    big.expect.zone('Giant Spider', 'graveyard', { seat: 1 });
    big.expect.zone('Plains', 'battlefield', { seat: 1 });
    const none = game(0);
    none.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    none.expect.zone('Giant Spider', 'battlefield', { seat: 1 });
  });
});
