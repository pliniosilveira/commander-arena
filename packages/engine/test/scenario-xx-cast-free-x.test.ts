// "~ deals X damage to any target. You may cast a spell with mana value X or less from your hand without paying its mana cost." (Electrodominance shape):
// the limit of the free cast is the X announced for the spell that is resolving.
// Pins: CR 107.3a (the X of a spell is the value announced as it is cast), CR 202.3 (mana value), CR 608.2g and 118.9 (the free cast), CR 107.3b (X is 0 for
// the spell cast for free). The card is SYNTHETIC (src/cards/fixtures/synthetic-free-cast.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const BURN = 'SYNTHETIC X Burn Free Rite'; // instant {X}{R}
const BOLT = 'Lightning Bolt'; // mana value 1
const BEARS = 'Grizzly Bears'; // mana value 2
const SPIDER = 'Giant Spider'; // mana value 4

const game = (hand: readonly string[]) =>
  scenario()
    .seat(0)
    .hand(BURN, ...hand)
    .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
    .seat(1)
    .life(20)
    .build();

describe('mana value X or less, X the announced value', () => {
  test('the card is valid', () => {
    expect(validateCard(syntheticCard(BURN))).toEqual([]);
  });

  test('X = 2: the damage is dealt and the Bolt and the Bears are offered, the Spider is not', () => {
    const g = game([BOLT, BEARS, SPIDER, 'Mountain']);
    g.act(0).cast(BURN, { x: 2, targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 18);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('cast');
    expect([...d.legal].sort()).toEqual([g.id(BOLT), g.id(BEARS)].sort());
  });

  test('X = 0: only a spell of mana value 0 could be cast, so nothing is offered', () => {
    const g = game([BOLT, BEARS]);
    g.act(0).cast(BURN, { x: 0, targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 20);
    g.expect.pending('priority', 0);
  });

  test('the chosen spell is cast without paying: the Bolt hits the opponent', () => {
    const g = game([BOLT]);
    g.act(0).cast(BURN, { x: 1, targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).chooseCards(BOLT);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 16);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
  });
});
