// Planeswalker Party deck (issue 132), group 27: Jace, Architect of Thought, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: +1 CR 603.7 and 500.1 (a delayed ability until the controller's next turn that gives each attacking creature of an opponent -1/-0 as it is declared, not the controller's own);
// -2 CR 700.3 and 401.4 (an opponent separates the revealed cards into two piles, the controller takes one into the hand and arranges the other on the bottom of the library);
// -8 CR 701.23a, 701.24 and 608.2g (the controller searches every library for a nonland card, exiles it, each owner shuffles, and each card may be cast for free). Three seats.
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';

const JACE = real('Jace, Architect of Thought');
const BEARS = 'Grizzly Bears';
const LANDS = (n: number) => Array.from({ length: n }, () => 'Plains');

describe('Jace, Architect of Thought', () => {
  test('+1: until my next turn an attacking creature of an opponent gets -1/-0', () => {
    const g = scenario({ seats: 3 })
      .define(JACE)
      .seat(0)
      .library(...LANDS(8))
      .battlefield(JACE.name, { counters: { loyalty: 4 } })
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LANDS(8))
      .battlefield(BEARS, { label: 'theirs' })
      .seat(2)
      .library(...LANDS(8))
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(JACE.name, { ability: 0 });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack('theirs', { player: 0 });
    g.passAll();
    g.expect.pt('theirs', 1, 2);
  });

  test('+1: it does not touch my own attackers', () => {
    const g = scenario({ seats: 3 })
      .define(JACE)
      .seat(0)
      .library(...LANDS(8))
      .battlefield(JACE.name, { counters: { loyalty: 4 } })
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LANDS(8))
      .seat(2)
      .library(...LANDS(8))
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(JACE.name, { ability: 0 });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack('mine', { player: 1 });
    g.passAll();
    g.expect.pt('mine', 2, 2);
  });

  test('-2: an opponent separates the top three cards, one pile is mine, the other goes to the bottom', () => {
    const g = scenario({ seats: 3 })
      .define(JACE)
      .seat(0)
      .library('Lightning Bolt', 'Sol Ring', 'Divination', ...LANDS(5))
      .battlefield(JACE.name, { counters: { loyalty: 4 } })
      .seat(1)
      .library(...LANDS(8))
      .seat(2)
      .library(...LANDS(8))
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(JACE.name, { ability: 1 });
    g.passAll();
    // With two opponents the controller chooses which one separates (CR 608.2d).
    g.act(0).chooseOption('seat:1');
    // The opponent puts Lightning Bolt in pile 1 and the other two in pile 2.
    g.act(1).chooseCards({ name: 'Lightning Bolt', seat: 0, zone: 'library' });
    g.act(0).chooseOption('pile2');
    // The pile chosen goes to the hand; the other (one card) goes to the bottom of the library.
    g.expect.zone('Sol Ring', 'hand', { seat: 0 });
    g.expect.zone('Divination', 'hand', { seat: 0 });
    g.expect.zone('Lightning Bolt', 'library', { seat: 0 });
    g.expect.librarySize(0, 6);
  });

  test('-8: each library is searched by me for a nonland card, which is exiled and may be cast free', () => {
    const g = scenario({ seats: 3 })
      .define(JACE)
      .seat(0)
      .library(BEARS, ...LANDS(5))
      .battlefield(JACE.name, { counters: { loyalty: 8 } })
      .seat(1)
      .library('Lightning Bolt', ...LANDS(5))
      .seat(2)
      .library('Sol Ring', ...LANDS(5))
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(JACE.name, { ability: 2 });
    g.passAll();
    // The controller makes every choice, library by library, in turn order.
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: BEARS, seat: 0, zone: 'library' });
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: 'Lightning Bolt', seat: 1, zone: 'library' });
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: 'Sol Ring', seat: 2, zone: 'library' });
    // Each card is exiled and its owner's library shuffled; then the controller may cast them for free.
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone('Lightning Bolt', 'exile', { seat: 1 });
    g.expect.zone('Sol Ring', 'exile', { seat: 2 });
    g.expect.librarySize(1, 5);
    g.expect.librarySize(2, 5);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: BEARS, seat: 0, zone: 'exile' });
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards();
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone('Lightning Bolt', 'exile', { seat: 1 });
  });
});
