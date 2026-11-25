// "Switch target creature's power and toughness until end of turn" (CR 613.4d, layer 7d): the switch applies after
// base values, whatever the timestamps; a second switch switches back; it ends at cleanup (CR 514.2).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-pt.ts).
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';

const FLIP = 'SYNTHETIC Flip Over';
const SPIDER = 'Giant Spider'; // 2/4

describe('switching power and toughness (CR 613.4d)', () => {
  test('a 2/4 becomes a 4/2', () => {
    const g = scenario()
      .seat(0)
      .hand(FLIP)
      .battlefield('Island', SPIDER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(FLIP, { targets: [SPIDER], pay: true });
    g.passAll();
    g.expect.pt(SPIDER, 4, 2);
    g.expect.invariants();
  });

  test('two switches switch back', () => {
    const g = scenario()
      .seat(0)
      .hand(FLIP, FLIP)
      .battlefield('Island', 'Island', SPIDER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(`${FLIP}[1]`, { targets: [SPIDER], pay: true });
    g.passAll();
    g.act(0).cast(FLIP, { targets: [SPIDER], pay: true });
    g.passAll();
    g.expect.pt(SPIDER, 2, 4);
  });

  test('it ends at the cleanup step (CR 514.2)', () => {
    const g = scenario()
      .seat(0)
      .hand(FLIP)
      .battlefield('Island', SPIDER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(FLIP, { targets: [SPIDER], pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt(SPIDER, 2, 4);
  });
});
