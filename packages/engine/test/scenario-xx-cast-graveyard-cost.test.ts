// Issue 89 (Silverquill Influence), "You may cast this card from your graveyard by paying {2}{W} rather than paying its mana cost." (D-656; Raffine's Guidance).
// Pins: CR 113.6b (a static ability that works from the graveyard), CR 118.9 (an alternative cost is paid instead of the mana cost), CR 601.2f (the total cost), CR 303.4 and 601.2c
// (an Aura spell targets a creature as it is cast), CR 400.7 (the card on the stack is a new object).
// Cards: the SYNTHETIC Aura of this file, the real Grizzly Bears and Plains.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const GUIDANCE = 'SYNTHETIC Guidance Aura'; // {3}{W}{W} Aura. Enchant creature. You may cast this card from your graveyard by paying {2}{W} rather than paying its mana cost.
const BEARS = 'Grizzly Bears';

const guidance = singleFaceCard({
  name: GUIDANCE,
  manaCost: ['3', 'W', 'W'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText:
    'Enchant creature\nYou may cast this card from your graveyard by paying {2}{W} rather than paying its mana cost.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
    {
      kind: 'static',
      static: { kind: 'castFromGraveyard', cost: [{ kind: 'mana', symbols: ['2', 'W'] }] },
    },
  ],
});

const board = (lands: number, zone: 'graveyard' | 'hand') => {
  const b = scenario().seat(0).define(guidance);
  const withCard = zone === 'graveyard' ? b.graveyard(GUIDANCE) : b.hand(GUIDANCE);
  return withCard
    .library('Plains', 'Plains')
    .battlefield(...Array.from({ length: lands }, () => 'Plains'))
    .seat(1)
    .library('Plains', 'Plains')
    .battlefield(BEARS)
    .at('precombatMain')
    .build();
};

const untapped = (g: ReturnType<typeof board>) =>
  g.find({ name: 'Plains', zone: 'battlefield', seat: 0 }).filter((o) => !o.tapped).length;

describe('"You may cast this card from your graveyard by paying {2}{W} rather than paying its mana cost."', () => {
  test('from the graveyard it costs {2}{W}: three mana, one of the four lands is left', () => {
    const g = board(4, 'graveyard');
    g.act(0).cast(GUIDANCE, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    expect(untapped(g)).toBe(1);
    g.passAll();
    g.expect.attached(GUIDANCE, { name: BEARS, seat: 1 });
  });

  test('two lands are not enough for the alternative cost', () => {
    const g = board(2, 'graveyard');
    expect(() =>
      g.act(0).cast(GUIDANCE, { targets: [{ name: BEARS, seat: 1 }], pay: true }),
    ).toThrow();
  });

  test('from the hand it costs its mana cost: three lands are not enough, five are', () => {
    const three = board(3, 'hand');
    expect(() =>
      three.act(0).cast(GUIDANCE, { targets: [{ name: BEARS, seat: 1 }], pay: true }),
    ).toThrow();
    const five = board(5, 'hand');
    five.act(0).cast(GUIDANCE, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    expect(untapped(five)).toBe(0);
  });
});
