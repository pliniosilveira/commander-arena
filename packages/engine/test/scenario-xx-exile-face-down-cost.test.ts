// "Exile a face-down permanent you control face up: You may play that card this turn." (Primordial Mist; CR 118.3, 406.3, 708.9, 602.2b, 400.7): the cost `exilePermanent` and
// the play permission of the card it exiled. Cards are SYNTHETIC (src/cards/fixtures/synthetic-mana-turn-up.ts, synthetic-manifest.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const ALTAR = 'SYNTHETIC Unveiling Altar';
const BRUTE = 'SYNTHETIC Manifest Brute'; // {3}{G} 4/4
const LIB = Array.from({ length: 12 }, () => 'Plains');

const base = () =>
  scenario()
    .seat(0)
    .library(...LIB)
    .seat(1)
    .library(...LIB)
    .seat(0);

describe('the card is valid', () => {
  test(ALTAR, () => {
    expect(validateCard(syntheticCard(ALTAR))).toEqual([]);
  });
});

describe('exiling a face-down permanent as a cost', () => {
  test('not offered with no face-down permanent: a face-up one does not pay it', () => {
    const g = base().battlefield(ALTAR).battlefield(BRUTE).at('precombatMain').build();
    g.expect.illegal(0, { activate: ALTAR });
  });

  test('the card goes to exile face up and may be cast this turn', () => {
    const g = base()
      .battlefield(ALTAR)
      .battlefield(BRUTE, { faceDown: true })
      .battlefield('Forest', { count: 4 })
      .at('precombatMain')
      .build();
    g.act(0).activate(ALTAR);
    g.passAll();
    g.expect.zone(BRUTE, 'exile', { seat: 0 });
    g.expect.legal(0, { cast: BRUTE });
    g.act(0).cast(BRUTE, { pay: true });
    g.passAll();
    g.expect.zone(BRUTE, 'battlefield', { seat: 0 });
    g.expect.pt(BRUTE, 4, 4);
    g.expect.invariants();
  });

  test('the other players see the card once it is exiled face up (CR 708.9, 406.3)', () => {
    const g = base()
      .battlefield(ALTAR)
      .battlefield(BRUTE, { faceDown: true })
      .at('precombatMain')
      .build();
    expect(JSON.stringify(g.view(1)).includes(JSON.stringify(BRUTE))).toBe(false);
    g.act(0).activate(ALTAR);
    g.passAll();
    expect(JSON.stringify(g.view(1)).includes(JSON.stringify(BRUTE))).toBe(true);
  });

  test('a land card is played as a land', () => {
    const g = base()
      .battlefield(ALTAR)
      .battlefield('Mountain', { faceDown: true })
      .at('precombatMain')
      .build();
    g.act(0).activate(ALTAR);
    g.passAll();
    g.expect.legal(0, { playLand: 'Mountain' });
    g.act(0).playLand('Mountain');
    g.expect.zone('Mountain', 'battlefield', { seat: 0 });
  });

  test('a card that was not exiled by the cost is not playable', () => {
    const g = base()
      .battlefield(ALTAR)
      .battlefield(BRUTE, { faceDown: true })
      .hand('Mountain')
      .at('precombatMain')
      .build();
    g.act(0).activate(ALTAR);
    g.passAll();
    g.expect.zone('Mountain', 'hand', { seat: 0 });
  });
});
