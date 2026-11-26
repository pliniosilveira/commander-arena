// "Whenever you put one or more +1/+1 counters on a creature, you may gain that much life. Do this only once each turn."
// Pins: CR 122.6 (counters are put by a player; one trigger for one instance of putting, "that much" is how many), CR 119.9 (the life gained),
// CR 603.2h (only once each turn; a declined ability did not take the action). Cards are SYNTHETIC (src/cards/fixtures/synthetic-life-gain.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const HEALER = 'SYNTHETIC Counter Healer';
const BOON = 'SYNTHETIC Counter Boon'; // two +1/+1 counters on target creature
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const game = () =>
  scenario({ seats: 3 })
    .seat(0)
    .library(...LIBRARY)
    .hand(BOON, BOON)
    .battlefield(HEALER, BEARS, 'Forest', 'Forest')
    .seat(1)
    .library(...LIBRARY)
    .hand(BOON)
    .battlefield('Forest')
    .seat(2)
    .library(...LIBRARY)
    .hand(BOON)
    .battlefield('Forest')
    .build();

test('the card is valid', () => {
  expect(validateCard(syntheticCard(HEALER))).toEqual([]);
});

describe('"that much" is the counters put on', () => {
  test('two counters on my creature: gain 2 life, nobody else gains any', () => {
    const g = game();
    g.act(0).cast(`${BOON}[0]`, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.life(0, 42);
    g.expect.life(1, 40);
    g.expect.life(2, 40);
  });
});

describe('only counters you put', () => {
  test('counters an opponent puts on my creature gain me nothing', () => {
    const g = game();
    g.act(0).pass();
    g.act(1).cast(`${BOON}[0]`, { targets: [BEARS], pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    g.expect.life(0, 40);
    g.expect.life(1, 40);
    g.expect.life(2, 40);
  });
});

describe('"you may" and "Do this only once each turn" (CR 603.2h)', () => {
  test('declining gains nothing', () => {
    const g = game();
    g.act(0).cast(`${BOON}[0]`, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.life(0, 40);
  });

  test('a second putting the same turn does not trigger it after one was accepted', () => {
    const g = game();
    g.act(0).cast(`${BOON}[0]`, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.act(0).cast(`${BOON}[0]`, { targets: [BEARS], pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    g.expect.life(0, 42);
  });

  test('a declined one did not take the action: the next putting triggers again', () => {
    const g = game();
    g.act(0).cast(`${BOON}[0]`, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.act(0).cast(`${BOON}[0]`, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.life(0, 42);
  });
});
