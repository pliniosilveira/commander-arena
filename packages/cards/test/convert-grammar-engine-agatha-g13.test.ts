// Agatha deck (issue 345), group 13: Svella, Ice Shaper.
// "{3}, {T}: Create a colorless snow artifact token named Icy Manalith with \"{T}: Add one mana of any color.\"" (CR 111.4, 205.4 snow, 605.1a) and "{6}{R}{G}, {T}: Look at the
// top four cards of your library. You may cast a spell from among them without paying its mana cost. Put the rest on the bottom of your library in a random order." (CR 608.2g,
// 118.9, 401.4).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const SVELLA = real('Svella, Ice Shaper');
const BOLT = 'Lightning Bolt';

describe('Svella, Ice Shaper: Icy Manalith', () => {
  const game = () =>
    scenario()
      .define(SVELLA)
      .seat(0)
      .battlefield(SVELLA.name)
      .battlefield('Forest', 'Forest', 'Forest')
      .seat(1)
      .library('Forest')
      .build();

  test('creates a colorless snow artifact token named Icy Manalith', () => {
    const g = game();
    g.act(0).activate(SVELLA.name, { ability: 0 }).pay();
    g.passAll();
    g.expect.zone('Icy Manalith', 'battlefield', { seat: 0 });
    g.expect.derived('Icy Manalith', {
      types: ['artifact'],
      supertypes: ['snow'],
      subtypes: [],
      colors: [],
    });
    g.expect.invariants();
  });

  test('the token taps for one mana of any color', () => {
    const g = game();
    g.act(0).activate(SVELLA.name, { ability: 0 }).pay();
    g.passAll();
    g.act(0).tapForMana('Icy Manalith', { color: 'R' } as never);
    g.expect.pool(0, { R: 1 });
  });
});

describe('Svella, Ice Shaper: the free cast', () => {
  const game = () =>
    scenario()
      .define(SVELLA)
      .seat(0)
      .battlefield(SVELLA.name)
      .battlefield('Mountain', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .library('Grizzly Bears', BOLT, 'Plains', 'Island', 'Swamp')
      .seat(1)
      .library('Forest')
      .build();

  test('casts a spell from the top four for free and puts the rest on the bottom', () => {
    const g = game();
    g.act(0).activate(SVELLA.name, { ability: 1 }).pay();
    g.passAll();
    g.act(0).chooseCards(BOLT);
    g.act(0).chooseTargets({ player: 1 } as never);
    g.passAll();
    g.expect.life(1, 37);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    // The three cards that were not cast went to the bottom: the card that was not looked at is now on top.
    expect(g.view(0).seats[0]?.libraryCount).toBe(4);
    g.expect.invariants();
  });
});
