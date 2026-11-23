// "This mana can't be spent to pay generic mana costs." (CR 106.6; Jegantha, the Wellspring): a mana ability whose mana pays colored symbols and never generic mana, through the
// engine (legality of a cast, auto-payment, the pool, validation). Cards are SYNTHETIC (src/cards/fixtures/synthetic-mana-not-generic.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const ROCK = 'SYNTHETIC Prism Rock'; // {T}: {W}{U}{B}{R}{G}, never generic
const RAINBOW = 'SYNTHETIC Rainbow Sorcery'; // {W}{U}{B}{R}{G}: gain 5
const COLORLESS = 'SYNTHETIC Colorless Sorcery'; // {5}: gain 2
const MIXED = 'SYNTHETIC Mixed Sorcery'; // {2}{R}: gain 3
const TWOBRID = 'SYNTHETIC Twobrid Sorcery'; // {2/W}{2/U}{2/B}{2/R}{2/G}: gain 4
const LIB = Array.from({ length: 12 }, () => 'Plains');

const base = () =>
  scenario()
    .seat(0)
    .library(...LIB)
    .seat(1)
    .library(...LIB)
    .seat(0);

describe('the cards are valid', () => {
  test.each([ROCK, RAINBOW, COLORLESS, MIXED, TWOBRID])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('notGeneric stands alone: with another restriction it is refused', () => {
    const card = syntheticCard(ROCK);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const abilities = face.abilities.map((a) =>
      a.kind === 'mana' ? { ...a, spendOnly: { notGeneric: true, xCost: true } } : a,
    );
    expect(validateCard({ ...card, faces: [{ ...face, abilities }] } as never)).not.toEqual([]);
    const bad = face.abilities.map((a) =>
      a.kind === 'mana' ? { ...a, spendOnly: { notGeneric: false } } : a,
    );
    expect(validateCard({ ...card, faces: [{ ...face, abilities: bad }] } as never)).not.toEqual(
      [],
    );
  });
});

describe('spendOnly.notGeneric (CR 106.6)', () => {
  test('the mana waits in the pool, restricted, after the rock is tapped', () => {
    const g = base().battlefield(ROCK).at('precombatMain').build();
    g.act(0).tapForMana(ROCK);
    g.expect.pool(0, 'WUBRG');
    expect(g.state.seats[0]?.manaPool.every((m) => m.restriction?.kind === 'notGeneric')).toBe(
      true,
    );
  });

  test('it pays a cost of five colored symbols', () => {
    const g = base().hand(RAINBOW).battlefield(ROCK).at('precombatMain').build();
    g.expect.legal(0, { cast: RAINBOW });
    g.act(0).cast(RAINBOW, { pay: true });
    g.passAll();
    g.expect.life(0, 45);
    g.expect.tapped(ROCK);
  });

  test('it never pays a generic cost: the rock alone does not make {5} castable', () => {
    const g = base().hand(COLORLESS).battlefield(ROCK).at('precombatMain').build();
    g.expect.illegal(0, { cast: COLORLESS });
  });

  test('five other lands pay {5}, and the rock is left untapped', () => {
    const g = base()
      .hand(COLORLESS)
      .battlefield(ROCK, 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .at('precombatMain')
      .build();
    g.act(0).cast(COLORLESS, { pay: true });
    g.passAll();
    g.expect.life(0, 42);
    g.expect.tapped(ROCK, false);
  });

  test('a mixed cost {2}{R}: the rock alone cannot, with two more lands it can', () => {
    const alone = base().hand(MIXED).battlefield(ROCK).at('precombatMain').build();
    alone.expect.illegal(0, { cast: MIXED });
    const g = base().hand(MIXED).battlefield(ROCK, 'Forest', 'Forest').at('precombatMain').build();
    g.expect.legal(0, { cast: MIXED });
  });

  test('the colored side of every {2/C} symbol: the rock pays all five, the generic sides it cannot', () => {
    const g = base().hand(TWOBRID).battlefield(ROCK).at('precombatMain').build();
    g.act(0).cast(TWOBRID, { pay: true });
    g.passAll();
    g.expect.life(0, 44);
  });

  test('the pool mana is not spent on the generic part either', () => {
    const g = base().hand(MIXED).battlefield(ROCK).at('precombatMain').build();
    g.act(0).tapForMana(ROCK);
    // WUBRG is in the pool: {2}{R} needs two generic mana, which this mana cannot pay.
    g.expect.illegal(0, { cast: MIXED });
  });
});
