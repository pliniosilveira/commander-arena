// Agatha deck (issue 345), group 7: Vivien's Grizzly, "{3}{G}: Look at the top card of your library. If it's a creature or planeswalker card, you may reveal it and put it into
// your hand. If you don't put the card into your hand, put it on the bottom of your library."
// Pins: CR 401.2 (looking at the top card), CR 701.20a (reveal), CR 608.2c (the later sentences read what the earlier ones did), CR 401.4-style bottom of the library.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const GRIZZLY = real("Vivien's Grizzly");
const BEARS = 'Grizzly Bears';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';

const game = (...library: string[]) =>
  scenario()
    .define(GRIZZLY)
    .seat(0)
    .battlefield(GRIZZLY.name)
    .battlefield('Forest', 'Forest', 'Forest', 'Forest')
    .library(...library)
    .seat(1)
    .library('Forest')
    .build();

const bottom = (g: ReturnType<typeof game>) => {
  const seat = g.state.seats[0];
  const id = seat?.library[seat.library.length - 1];
  return id === undefined ? undefined : g.object(id).id;
};

describe("Vivien's Grizzly", () => {
  test('a creature card on top may be revealed and put into the hand', () => {
    const g = game(BEARS, 'Mountain');
    g.act(0).activate(GRIZZLY.name).pay();
    g.passAll();
    g.act(0).chooseCards(BEARS);
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.librarySize(0, 1);
    g.expect.invariants();
  });

  test('declining puts the creature card on the bottom of the library', () => {
    const g = game(BEARS, 'Mountain');
    g.act(0).activate(GRIZZLY.name).pay();
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone(BEARS, 'library', { seat: 0 });
    expect(bottom(g)).toBe(g.id(BEARS));
    g.expect.librarySize(0, 2);
    g.expect.invariants();
  });

  test('a planeswalker card on top may be taken too', () => {
    const g = game(WALKER, 'Mountain');
    g.act(0).activate(GRIZZLY.name).pay();
    g.passAll();
    g.act(0).chooseCards(WALKER);
    g.expect.zone(WALKER, 'hand', { seat: 0 });
  });

  test('a card that is neither goes to the bottom without a question', () => {
    const g = game('Mountain', BEARS);
    g.act(0).activate(GRIZZLY.name).pay();
    g.passAll();
    g.expect.zone('Mountain', 'library', { seat: 0 });
    expect(bottom(g)).toBe(g.id('Mountain'));
    g.expect.handSize(0, 0);
    g.expect.pending('priority', 0);
  });

  test('an empty library does nothing', () => {
    const g = game();
    g.act(0).activate(GRIZZLY.name).pay();
    g.passAll();
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });
});
