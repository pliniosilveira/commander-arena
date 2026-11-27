// "During your turn, if an opponent lost life this turn, you may play lands and cast spells from among cards exiled with ~" (Theater of Horrors; CR 607.2a, 601.2a, 305.1, 119.3):
// `playFromLinkedExile` with the condition "your turn and an opponent lost life this turn". The card is SYNTHETIC (src/cards/fixtures/synthetic-life-lost-group.ts). Pins: no
// permission before an opponent lost life, the permission after, the controller's own loss does not count, and with 3 seats the loss of either opponent is enough.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const PLAYHOUSE = 'SYNTHETIC Grim Playhouse';
const DRAIN = 'SYNTHETIC Drain One';
const FILLER = Array.from({ length: 20 }, () => 'Island');

test('the card is valid', () => {
  expect(validateCard(syntheticCard(PLAYHOUSE))).toEqual([]);
});

describe('"if an opponent lost life this turn, you may play ... from among cards exiled with ~"', () => {
  const game = (top: string, seats: 2 | 3 = 2) => {
    let b = scenario({ seats })
      .seat(0)
      .battlefield(PLAYHOUSE, 'Swamp', 'Swamp', 'Forest')
      .hand(DRAIN)
      .library(top, ...FILLER);
    for (let s = 1; s < seats; s++) b = b.seat(s).library(...FILLER);
    const g = b.at('end', { active: seats === 2 ? 1 : seats - 1 }).build();
    // The upkeep trigger of the next turn exiles the top card of the library.
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.advanceTo('precombatMain');
    return g;
  };

  test('the exiled card is exiled but can’t be played while no opponent lost life', () => {
    const g = game('Mountain');
    g.expect.zone('Mountain', 'exile', { seat: 0 });
    g.expect.illegal(0, { playLand: { name: 'Mountain', zone: 'exile', seat: 0 } });
  });

  test('after an opponent lost life this turn the exiled land can be played', () => {
    const g = game('Mountain');
    g.act(0).cast(DRAIN, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.legal(0, { playLand: { name: 'Mountain', zone: 'exile', seat: 0 } });
    g.act(0).playLand({ name: 'Mountain', zone: 'exile', seat: 0 });
    g.expect.zone('Mountain', 'battlefield', { seat: 0 });
  });

  test('after an opponent lost life this turn the exiled spell can be cast', () => {
    const g = game('Grizzly Bears');
    g.act(0).cast(DRAIN, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.legal(0, { cast: { name: 'Grizzly Bears', zone: 'exile', seat: 0 } });
  });

  test('the controller losing life does not count', () => {
    const g = game('Mountain');
    g.act(0).cast(DRAIN, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.illegal(0, { playLand: { name: 'Mountain', zone: 'exile', seat: 0 } });
  });

  test('with 3 seats the loss of the third player is enough', () => {
    const g = game('Mountain', 3);
    g.act(0).cast(DRAIN, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    g.expect.legal(0, { playLand: { name: 'Mountain', zone: 'exile', seat: 0 } });
  });
});
