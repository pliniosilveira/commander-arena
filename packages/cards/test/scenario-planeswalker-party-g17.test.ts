// Planeswalker Party deck (issue 132), group 17: Chandra, Torch of Defiance, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 701.13 (exile the top card), CR 608.2g (cast it as the ability resolves, paying its cost), CR 608.2c ("If you don't": declined, or it could not be cast: a land), CR 120.2 (2 damage to
// each opponent). Three seats, so each opponent is hit.
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';

const CHANDRA = real('Chandra, Torch of Defiance');
const BOLT = 'Lightning Bolt';

describe('Chandra, Torch of Defiance +1', () => {
  const build = (top: string, lands: number) => {
    const b = scenario({ seats: 3 })
      .define(CHANDRA)
      .seat(0)
      .library(top, ...Array.from({ length: 8 }, () => 'Plains'))
      .battlefield(CHANDRA.name, { counters: { loyalty: 4 } });
    for (let i = 0; i < lands; i += 1) b.battlefield('Mountain');
    b.seat(1).library(...Array.from({ length: 6 }, () => 'Plains'));
    b.seat(2).library(...Array.from({ length: 6 }, () => 'Plains'));
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };

  test('a land on top cannot be cast: each opponent is dealt 2 damage', () => {
    const g = build('Plains', 0);
    g.act(0).activate(CHANDRA.name, { ability: 0 });
    g.passAll();
    g.expect.life(1, 38);
    g.expect.life(2, 38);
  });

  test('declining the cast of a spell: each opponent is dealt 2 damage', () => {
    const g = build(BOLT, 1);
    g.act(0).activate(CHANDRA.name, { ability: 0 });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).decline();
    g.passAll();
    g.expect.life(1, 38);
    g.expect.life(2, 38);
  });

  test('casting the spell: no damage from Chandra', () => {
    const g = build(BOLT, 1);
    g.act(0).activate(CHANDRA.name, { ability: 0 });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.life(1, 40);
    g.expect.life(2, 40);
  });
});
