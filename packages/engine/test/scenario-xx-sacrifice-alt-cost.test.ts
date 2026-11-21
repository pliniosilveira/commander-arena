// "You may sacrifice a nontoken black creature rather than pay this spell's mana cost" (Flare of Malice, Witch-king of Angmar deck): the alternative cost `sacrificePermanents`.
// Pins: CR 118.9 (alternative costs), CR 118.9a (only one), CR 601.2h (the cost is paid), CR 701.21a (sacrifice), CR 903.8 is not involved.
// The card is SYNTHETIC; defined here.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const SPELL = 'SYNTHETIC Sacrifice Instead';
const RATS = 'Typhoid Rats'; // black creature
const BEARS = 'Grizzly Bears'; // green creature

const CARD = singleFaceCard({
  name: SPELL,
  manaCost: ['2', 'B', 'B'],
  types: ['instant'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText:
    "You may sacrifice a nontoken black creature rather than pay this spell's mana cost. Each opponent loses 3 life.",
  alternativeCosts: [
    {
      kind: 'sacrificePermanents',
      cost: [{ kind: 'mana', symbols: ['0'] }],
      filter: { types: ['creature'], colors: ['B'], token: false },
      count: 1,
    },
  ],
  spell: {
    effect: { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 3 },
  },
});

describe('sacrifice a creature rather than pay the mana cost (CR 118.9)', () => {
  const board = (mine: readonly string[]) =>
    scenario()
      .define(CARD)
      .seat(0)
      .hand(SPELL)
      .battlefield(...mine)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();

  test('the spell is cast with no mana by sacrificing a nontoken black creature, and resolves', () => {
    const g = board([RATS, BEARS]);
    g.act(0).cast(SPELL, { alternative: 'sacrificePermanents', pay: true });
    g.passAll();
    g.expect.zone(RATS, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.life(1, 37);
    g.expect.invariants();
  });

  test('a creature that is not black cannot pay it: the alternative cannot be chosen', () => {
    const g = board([BEARS]);
    expect(g.act(0).try.cast(SPELL, { alternative: 'sacrificePermanents' }).ok).toBe(false);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });
});
