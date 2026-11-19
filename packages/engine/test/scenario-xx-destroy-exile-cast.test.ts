// "Destroy target artifact or creature you don't control. If that permanent is destroyed this way, its controller exiles cards from the top of their library until they exile a nonland
// card, then they may cast that card without paying its mana cost." (Transforming Flourish shape): `exileUntilFound` and `castFree` of `moved`, both for the controller of the target.
// Pins: CR 701.8 (a permanent that is indestructible is not destroyed), CR 701.13 (exile from the top until a card matches), CR 608.2g and 118.9 (the player the effect names casts the
// card without paying its mana cost, whoever owns it), CR 608.2h (the target's controller is read as the target was before it was destroyed). Card: SYNTHETIC Flourish.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const FLOURISH = 'SYNTHETIC Flourish';
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';

const game = (library: readonly string[]) =>
  scenario()
    .seat(0)
    .life(20)
    .hand(FLOURISH)
    .battlefield('Mountain', 'Mountain', 'Mountain')
    .seat(1)
    .life(20)
    .battlefield(BEARS)
    .library(...library, 'Island', 'Island')
    .build();

describe('the card is valid', () => {
  test(FLOURISH, () => {
    expect(validateCard(syntheticCard(FLOURISH))).toEqual([]);
  });
});

describe('the controller of the destroyed permanent exiles until a nonland card, then may cast it', () => {
  test('lands are exiled first, the nonland card is offered to the OPPONENT (the controller of the target), who casts it for free', () => {
    const g = game(['Island', 'Island', BOLT]);
    g.act(0).cast(FLOURISH, { targets: [{ name: BEARS }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    // Two Islands and the Bolt are exiled, the library keeps the rest; the opponent is asked.
    g.expect.pending('chooseCards', 1);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('cast');
    expect(d.legal).toEqual([g.id({ name: BOLT, zone: 'exile' })]);
    g.act(1).chooseCards(BOLT);
    // Seat 1 casts the Bolt: they choose its target, and they control it.
    g.act(1).chooseTargets({ player: 0 });
    g.passAll();
    g.expect.life(0, 17);
    g.expect.life(1, 20);
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
  });

  test('declining leaves the nonland card in exile', () => {
    const g = game([BOLT]);
    g.act(0).cast(FLOURISH, { targets: [{ name: BEARS }], pay: true });
    g.passAll();
    g.act(1).chooseCards();
    g.expect.zone(BOLT, 'exile');
    g.expect.life(0, 20);
  });

  test('a permanent that is not destroyed (indestructible, CR 701.8): nothing is exiled and nobody is asked', () => {
    const g = scenario()
      .seat(0)
      .hand(FLOURISH)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .battlefield('SYNTHETIC Indestructible 2/2')
      .library(BOLT, 'Island')
      .build();
    g.act(0).cast(FLOURISH, { targets: [{ name: 'SYNTHETIC Indestructible 2/2' }], pay: true });
    g.passAll();
    g.expect.zone('SYNTHETIC Indestructible 2/2', 'battlefield', { seat: 1 });
    g.expect.pending('priority', 0);
    expect(g.state.seats[1]?.library).toHaveLength(2);
  });

  test('a library with no nonland card: everything is exiled and nothing is asked', () => {
    const g = scenario()
      .seat(0)
      .hand(FLOURISH)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .battlefield(BEARS)
      .library('Island', 'Island')
      .build();
    g.act(0).cast(FLOURISH, { targets: [{ name: BEARS }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.pending('priority', 0);
    expect(g.state.seats[1]?.library).toHaveLength(0);
  });
});
