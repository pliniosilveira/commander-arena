// "Whenever an opponent loses life for the first time during each of their turns" (Valgavoth, Harrower of Souls; CR 119.3, 603.2): the trigger `lifeLost` with `firstEachTurn` and
// `duringTheirTurn`. The card is SYNTHETIC (src/cards/fixtures/synthetic-life-lost-group.ts). Pins: a loss in the opponent's own turn counts, only the first of that turn, a loss in the
// controller's turn does not, and with 3 seats each opponent's own turn counts.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const TORMENTOR = 'SYNTHETIC Patient Tormentor';
const DRAIN = 'SYNTHETIC Drain One';
const LIBRARY = Array.from({ length: 20 }, () => 'Island');

test('the card is valid', () => {
  expect(validateCard(syntheticCard(TORMENTOR))).toEqual([]);
});

describe('"for the first time during each of their turns"', () => {
  const build = (active: number, seats: 2 | 3 = 2) => {
    let b = scenario({ seats })
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TORMENTOR);
    for (let s = 1; s < seats; s++) b = b.seat(s).library(...LIBRARY);
    return b
      .seat(active)
      .hand(DRAIN, DRAIN)
      .battlefield('Swamp', 'Swamp')
      .at('precombatMain', { active })
      .build();
  };

  test('an opponent losing life in their own turn draws a card', () => {
    const g = build(1);
    g.act(1).cast(`${DRAIN}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('only the first loss of that turn counts', () => {
    const g = build(1);
    g.act(1).cast(`${DRAIN}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(1).cast(`${DRAIN}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('a loss in the controller’s turn does not count', () => {
    const g = build(0);
    g.act(0).cast(`${DRAIN}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    // The controller holds the second Drain One and drew nothing.
    g.expect.handSize(0, 1);
  });

  test('with 3 seats the third player’s own turn counts', () => {
    const g = build(2, 3);
    g.act(2).cast(`${DRAIN}[0]`, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('an opponent losing life in another opponent’s turn does not count', () => {
    const g = build(2, 3);
    g.act(2).cast(`${DRAIN}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.handSize(0, 0);
  });
});
