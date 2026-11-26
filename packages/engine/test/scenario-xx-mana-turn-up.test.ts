// "Spend this mana only to turn permanents face up." (CR 106.6, 701.40b; Overgrown Zealot): restricted mana that pays only the cost of the special action of turning a
// face-down permanent face up. Cards are SYNTHETIC (src/cards/fixtures/synthetic-mana-turn-up.ts, synthetic-manifest.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const ROCK = 'SYNTHETIC Unmasking Rock'; // {T}: {G}{G}{G}{G}, only to turn permanents face up
const SORCERY = 'SYNTHETIC Green Sorcery'; // {G}: gain 2
const BRUTE = 'SYNTHETIC Manifest Brute'; // {3}{G} 4/4 when face up
const LORD = 'SYNTHETIC Manifest Lord'; // {1}{W}{W}
const LIB = Array.from({ length: 12 }, () => 'Plains');

const base = () =>
  scenario()
    .seat(0)
    .library(...LIB)
    .seat(1)
    .library(...LIB)
    .seat(0);

describe('the cards are valid', () => {
  test(ROCK, () => {
    expect(validateCard(syntheticCard(ROCK))).toEqual([]);
  });

  test('turnFaceUp stands alone: with another restriction it is refused', () => {
    const card = syntheticCard(ROCK);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const abilities = face.abilities.map((a) =>
      a.kind === 'mana' ? { ...a, spendOnly: { turnFaceUp: true, xCost: true } } : a,
    );
    expect(validateCard({ ...card, faces: [{ ...face, abilities }] } as never)).not.toEqual([]);
  });
});

describe('spendOnly.turnFaceUp (CR 106.6, 701.40b)', () => {
  test('the mana waits in the pool, restricted', () => {
    const g = base().battlefield(ROCK).at('precombatMain').build();
    g.act(0).tapForMana(ROCK);
    g.expect.pool(0, 'GGGG');
    expect(g.state.seats[0]?.manaPool.every((m) => m.restriction?.kind === 'turnFaceUp')).toBe(
      true,
    );
  });

  test('it pays the cost of turning a permanent face up, with no other source', () => {
    const g = base()
      .battlefield(BRUTE, { faceDown: true })
      .battlefield(ROCK)
      .at('precombatMain')
      .build();
    g.expect.legal(0, { turnFaceUp: BRUTE });
    g.act(0).turnFaceUp(BRUTE, { pay: true });
    g.expect.pt(BRUTE, 4, 4);
    g.expect.tapped(ROCK);
    g.expect.pool(0, '');
  });

  test('mana already in the pool pays it too', () => {
    const g = base()
      .battlefield(BRUTE, { faceDown: true })
      .battlefield(ROCK)
      .at('precombatMain')
      .build();
    g.act(0).tapForMana(ROCK);
    g.act(0).turnFaceUp(BRUTE, { pay: true });
    g.expect.pt(BRUTE, 4, 4);
    g.expect.pool(0, '');
  });

  test('it does not pay a spell, tapped or not', () => {
    const g = base().hand(SORCERY).battlefield(ROCK).at('precombatMain').build();
    g.expect.illegal(0, { cast: SORCERY });
    g.act(0).tapForMana(ROCK);
    g.expect.illegal(0, { cast: SORCERY });
  });

  test('a cost it cannot cover is not offered: the rock makes green only', () => {
    const g = base().battlefield(LORD, { faceDown: true }).battlefield(ROCK).at('precombatMain').build();
    g.expect.illegal(0, { turnFaceUp: LORD });
  });
});
