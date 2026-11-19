// "When this creature enters, if you cast it, counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard, then you may
// cast it without paying its mana cost." (Transcendent Dragon shape): `counter` with `exileInstead`, then `castFree` of `moved`, behind the intervening "if" `wasCast`.
// Pins: CR 701.6a (a countered spell is put into its owner's graveyard: here exiled instead, CR 614.1a), CR 603.4 (the intervening "if" is checked as the creature enters and again as
// the ability resolves), CR 601.2a (a permanent remembers it was cast), CR 608.2g and 118.9 (the exiled card is cast for free), CR 101.2 (a spell that can't be countered stays).
// Cards: SYNTHETIC Thief Dragon (src/cards/fixtures/synthetic-free-cast.ts) and real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const DRAGON = 'SYNTHETIC Thief Dragon'; // {2}{U} flash 2/2
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';

/** Seat 1 casts the Bolt at seat 0 (life 20); seat 0 holds the Dragon with three Islands. */
const respond = () => {
  const g = scenario()
    .seat(0)
    .life(20)
    .hand(DRAGON)
    .battlefield('Island', 'Island', 'Island')
    .seat(1)
    .life(20)
    .hand(BOLT)
    .battlefield('Mountain')
    .at('precombatMain', { active: 1, turn: 2 })
    .build();
  g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
  g.act(1).pass();
  return g;
};

describe('the card is valid', () => {
  test(DRAGON, () => {
    expect(validateCard(syntheticCard(DRAGON))).toEqual([]);
  });
});

describe('cast: the spell is countered, exiled, and may be cast for free by the Dragon controller', () => {
  test('the Bolt is exiled instead of going to its owner graveyard, then cast at the Dragon controller choice of target', () => {
    const g = respond();
    g.act(0).cast(DRAGON, { pay: true });
    // The enters trigger has one legal target, the Bolt, which it takes.
    g.passAll();
    g.expect.zone(BOLT, 'exile');
    expect(chooseCardsDecision(g).legal).toEqual([g.id({ name: BOLT, zone: 'exile' })]);
    g.act(0).chooseCards({ name: BOLT, zone: 'exile', seat: 1 });
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 17);
    g.expect.life(0, 20);
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
  });

  test('declining the free cast leaves the spell in exile, not in its owner graveyard', () => {
    const g = respond();
    g.act(0).cast(DRAGON, { pay: true });
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone(BOLT, 'exile');
    g.expect.life(0, 20);
    g.expect.life(1, 20);
  });
});

describe('not cast: the intervening "if" does not hold', () => {
  test('a Dragon put onto the battlefield by an effect does not trigger (nothing to target, nothing asked)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(DRAGON)
      .seat(1)
      .hand(BEARS)
      .battlefield('Forest', 'Forest')
      .build();
    g.expect.zone(DRAGON, 'battlefield', { seat: 0 });
    g.expect.pending('priority', 0);
  });
});
