// "Look at the top seven cards of your library. You may cast an instant or sorcery spell with mana value less than or equal to this creature's power from among them
// without paying its mana cost. Put the rest on the bottom of your library in a random order." (Velomachus Lorehold shape): `lookAtTop` whose `take.to` is `castFree`.
// Pins: CR 608.2g (cast during resolution: the steps of CR 601.2a-i, no timing restriction, no player receives priority, the resolution goes on), CR 118.9 (without paying
// its mana cost), CR 202.3 (mana value), CR 701.20 / 401.4 (the cards not cast go on the bottom of the library in a random order). The card is SYNTHETIC
// (src/cards/fixtures/synthetic-free-cast.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const SCOUT = 'SYNTHETIC Lorehold Scout'; // 3/3, {T}: the look
const BOLT = 'Lightning Bolt'; // instant, mana value 1
const MURDER = 'Murder'; // instant, mana value 3
const WRATH = 'SYNTHETIC Wrath'; // sorcery, mana value 4
const BEARS = 'Grizzly Bears'; // a creature spell: not an instant or sorcery

const game = (library: readonly string[]) =>
  scenario()
    .seat(0)
    .battlefield(SCOUT)
    .library(...library, 'Island', 'Island', 'Island', 'Island', 'Island', 'Island', 'Island')
    .seat(1)
    .life(20)
    .battlefield('Typhoid Rats')
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

describe('the card is valid', () => {
  test(SCOUT, () => {
    expect(validateCard(syntheticCard(SCOUT))).toEqual([]);
  });
});

describe('the question: instants and sorceries of the top seven with mana value at most the power', () => {
  test('the Bolt and the Murder are offered, the Wrath (mana value 4) and the creature are not', () => {
    const g = game([BOLT, MURDER, WRATH, BEARS]);
    g.act(0).activate(SCOUT);
    g.passAll();
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('cast');
    expect(d.zone).toBe('library');
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    expect([...d.legal].sort()).toEqual([g.id(BOLT), g.id(MURDER)].sort());
  });

  test('a spell below the top seven is not offered', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SCOUT)
      .library('Island', 'Island', 'Island', 'Island', 'Island', 'Island', 'Island', BOLT)
      .seat(1)
      .battlefield('Typhoid Rats')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(SCOUT);
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.zone(BOLT, 'library', { seat: 0 });
  });

  test('nothing to cast: nothing is asked and the cards go to the bottom', () => {
    const g = game([BEARS, WRATH]);
    g.act(0).activate(SCOUT);
    g.passAll();
    g.expect.pending('priority', 0);
    expect(g.state.seats[0]?.library.length).toBe(9);
    expect(g.state.seats[0]?.library.slice(-7)).toContain(g.id(BEARS));
  });
});

describe('the cast (CR 608.2g): from the library, without paying, the rest on the bottom', () => {
  test('the Bolt is cast for free, hits the opponent, and the other six cards go to the bottom', () => {
    const g = game([BOLT, MURDER, BEARS]);
    g.act(0).activate(SCOUT);
    g.passAll();
    g.act(0).chooseCards(BOLT);
    g.act(0).chooseTargets({ player: 1 });
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.life(1, 17);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    // Nine cards before, one cast: eight in the library, and the six not cast are at its bottom.
    const library = g.state.seats[0]?.library ?? [];
    expect(library).toHaveLength(9);
    expect(library.slice(-6)).toContain(g.id(MURDER));
    expect(library.slice(-6)).toContain(g.id(BEARS));
  });

  test('the player may choose none: every card looked at goes to the bottom', () => {
    const g = game([BOLT, MURDER]);
    g.act(0).activate(SCOUT);
    g.passAll();
    g.act(0).chooseCards();
    g.expect.pending('priority', 0);
    g.expect.stack([]);
    const library = g.state.seats[0]?.library ?? [];
    expect(library).toHaveLength(9);
    expect(library.slice(-7)).toContain(g.id(BOLT));
    expect(library.slice(-7)).toContain(g.id(MURDER));
  });
});
