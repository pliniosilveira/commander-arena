// Planeswalker Party deck (issue 132), group 7: Narset, Parter of Veils, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 401.2 and 701.20a (look at the top cards, reveal one), CR 205.2a (a card that is
// neither a creature nor a land), CR 606.4 (loyalty cost). The draw limit of its first ability is tested with a synthetic card in the engine (scenario-xx-draw-limit.test.ts).
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';

const NARSET = real('Narset, Parter of Veils');
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const FILLER = Array.from({ length: 6 }, () => 'Island');

describe('Narset, Parter of Veils', () => {
  test('-2: look at four cards, take a noncreature nonland card, the rest go to the bottom', () => {
    const g = scenario({ seats: 3 })
      .define(NARSET)
      .seat(0)
      .library(BEARS, 'Plains', BOLT, 'Island', ...FILLER)
      .battlefield(NARSET.name, { counters: { loyalty: 5 } })
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(NARSET.name, { ability: 1 });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(BOLT);
    g.expect.zone(BOLT, 'hand', { seat: 0 });
    g.expect.zone(BEARS, 'library', { seat: 0 });
    g.expect.handSize(0, 1);
    g.expect.librarySize(0, 9);
  });
});
