// "If an opponent lost 3 or more life this turn" (Sygg, River Cutthroat; CR 119.3, 102.2, 603.4): the condition `aPlayerLostLifeThisTurn` with `opponent`. The card is
// SYNTHETIC (src/cards/fixtures/synthetic-life-lost-group.ts). Pins: only the other players count (the controller's own loss does not), life lost adds up over the turn per player,
// and with 3 seats any one opponent is enough.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const WATCHER = 'SYNTHETIC Opposing Watcher';
const DRAIN4 = 'SYNTHETIC Drain Four';
const DRAIN1 = 'SYNTHETIC Drain One';
const LIBRARY = Array.from({ length: 20 }, () => 'Island');

test('the card is valid', () => {
  expect(validateCard(syntheticCard(WATCHER))).toEqual([]);
});

describe('"if an opponent lost 3 or more life this turn"', () => {
  const build = (hand: string[]) =>
    scenario({ seats: 3 })
      .seat(0)
      .library(...LIBRARY)
      .hand(...hand)
      .battlefield(WATCHER, 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('one opponent losing 4 life draws a card at the end step', () => {
    const g = build([DRAIN4]);
    g.act(0).cast(DRAIN4, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('the controller losing the life does not count', () => {
    const g = build([DRAIN4]);
    g.act(0).cast(DRAIN4, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.handSize(0, 0);
  });

  test('life lost by two different opponents is not added together', () => {
    const g = build([DRAIN1, DRAIN1]);
    g.act(0).cast(`${DRAIN1}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(`${DRAIN1}[0]`, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.handSize(0, 0);
  });

  test('the life lost on an earlier turn is forgotten (CR 514.2): the next end step draws nothing', () => {
    const g = build([DRAIN4]);
    g.act(0).cast(DRAIN4, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.handSize(0, 1);
    g.advanceTo('end', { turn: 'next' });
    g.passAll();
    g.expect.handSize(0, 1);
  });
});
