// Issue 89 (Silverquill Influence), "Exile the top eight cards of your library. You may cast an Aura spell from among them without paying its mana cost. Then put the rest on the
// bottom of your library in a random order." (D-655; Herald of Amity).
// Pins: CR 701.13 (exile), CR 608.2g (a spell cast during resolution: no timing, no mana cost, no priority), CR 303.4 and 601.2c (an Aura spell targets a creature as it is cast),
// CR 401.4 (cards put on the bottom of a library at once go in a random order), 614.1 not involved.
// Cards: the SYNTHETIC Rite and Aura of this file, the real Grizzly Bears, Lightning Bolt and the basic lands.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';
import { chooseCardsDecision } from './pending-helpers';

const RITE = 'SYNTHETIC Aura Rite'; // Sorcery {1}{W}: exile the top four cards; you may cast an Aura spell from among them free; put the rest on the bottom in a random order
const AURA = 'SYNTHETIC Plain Aura';
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';

const rite = singleFaceCard({
  name: RITE,
  manaCost: ['1', 'W'],
  types: ['sorcery'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText:
    'Exile the top four cards of your library. You may cast an Aura spell from among them without paying its mana cost. Then put the rest on the bottom of your library in a random order.',
  spell: {
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'exileTop', count: 4 },
        {
          kind: 'castFree',
          objects: { kind: 'moved' },
          filter: { subtypes: ['Aura'] },
        },
        {
          kind: 'moveToZone',
          objects: { kind: 'moved' },
          to: 'library',
          position: 'bottom',
          random: true,
        },
      ],
    },
  },
});

const aura = singleFaceCard({
  name: AURA,
  manaCost: ['1', 'W'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'Enchant creature',
  abilities: [{ kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } }],
});

/** Seat 0's library, top first: Bolt, Aura, Bears, Plains, then four more Plains; Bears of seat 1 on the battlefield. */
const board = () => {
  const g = scenario()
    .seat(0)
    .define(rite)
    .define(aura)
    .hand(RITE)
    .library(BOLT, AURA, BEARS, 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
    .battlefield('Plains', 'Plains')
    .seat(1)
    .library('Plains', 'Plains', 'Plains')
    .battlefield(BEARS)
    .at('precombatMain')
    .build();
  g.act(0).cast(RITE, { pay: true });
  g.passAll();
  return g;
};

describe('"you may cast an Aura spell from among them without paying its mana cost"', () => {
  test('only the Aura card is offered, among the four cards exiled', () => {
    const g = board();
    const d = chooseCardsDecision(g);
    expect(d.legal).toHaveLength(1);
    expect(d.legal).toEqual([g.id({ name: AURA, zone: 'exile', seat: 0 })]);
  });

  test('cast, it targets a creature, resolves and enchants it; the three cards left go to the bottom', () => {
    const g = board();
    g.act(0).chooseCards(AURA);
    g.act(0).chooseTargets({ name: BEARS, seat: 1 });
    g.passAll();
    g.expect.attached(AURA, { name: BEARS, seat: 1 });
    // Eight cards, four exiled: four stay on top; the three not cast are put under them.
    expect(g.state.seats[0]?.library).toHaveLength(7);
    g.expect.zone(BOLT, 'library', { seat: 0 });
    g.expect.zone(BEARS, 'library', { seat: 0 });
  });

  test("the order of the cards put on the bottom is the seeded generator's: the generator advances (CR 401.4)", () => {
    const before = scenario()
      .seat(0)
      .define(rite)
      .define(aura)
      .hand(RITE)
      .library(BOLT, AURA, BEARS, 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .battlefield('Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains', 'Plains')
      .battlefield(BEARS)
      .at('precombatMain')
      .build();
    const rngBefore = JSON.stringify(before.state.rng);
    before.act(0).cast(RITE, { pay: true });
    before.passAll();
    before.act(0).chooseCards();
    expect(JSON.stringify(before.state.rng)).not.toBe(rngBefore);
  });

  test('declining: all four cards go to the bottom, the Aura card too', () => {
    const g = board();
    g.act(0).chooseCards();
    expect(g.state.seats[0]?.library).toHaveLength(8);
    g.expect.zone(AURA, 'library', { seat: 0 });
  });
});
