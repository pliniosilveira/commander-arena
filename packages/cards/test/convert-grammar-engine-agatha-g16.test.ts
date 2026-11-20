// Agatha deck (issue 345), group 16: Tavern Brawler, "Commander creatures you own have \"At the beginning of your upkeep, exile the top card of your library. ~ gets +X/+0 until end
// of turn, where X is that card's mana value. You may play that card this turn.\""
// Pins: CR 903.3 (commander), CR 108.3 (owner), CR 613.1f (an ability granted in layer 6), CR 503.1 (upkeep trigger), CR 406.3 / 608.2h (the card exiled and its mana value), CR 611.2a.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const BRAWLER = real('Tavern Brawler');
const BEARS = 'Grizzly Bears';

const game = (commander: boolean) =>
  scenario()
    .define(BRAWLER)
    .seat(0)
    .battlefield(BRAWLER.name)
    .battlefield('Serra Angel', commander ? { commander: true } : {})
    .battlefield('Forest', 'Forest')
    .library(BEARS, 'Forest', 'Forest')
    .seat(1)
    .library('Forest', 'Forest')
    .at('end', { active: 1, turn: 2 })
    .build();

/** Passes priority from the end of the opponent's turn into the upkeep of seat 0, with its trigger on the stack. */
const toUpkeep = (g: ReturnType<typeof game>) => {
  g.advanceTo('upkeep');
  return g;
};

describe('Tavern Brawler', () => {
  test('a commander creature you own exiles the top card at your upkeep and gets +X/+0', () => {
    const g = toUpkeep(game(true));
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    // Serra Angel is 4/4; Grizzly Bears has mana value 2.
    g.expect.pt('Serra Angel', 6, 4);
    g.expect.invariants();
  });

  test('the player may play the exiled card this turn', () => {
    const g = toUpkeep(game(true));
    g.passAll();
    g.advanceTo('precombatMain');
    expect(g.legalActions(0).some((a) => a.kind === 'castSpell' && a.object === g.id(BEARS))).toBe(
      true,
    );
  });

  test('a creature that is not a commander gets nothing', () => {
    const g = toUpkeep(game(false));
    g.passAll();
    // The card was drawn in the draw step, not exiled.
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.noObject(BEARS, { zone: 'exile' });
    g.expect.pt('Serra Angel', 4, 4);
  });

  test('the +X/+0 ends with the turn', () => {
    const g = toUpkeep(game(true));
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt('Serra Angel', 4, 4);
  });
});
