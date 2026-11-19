// Issue 81 (The Ur-Sphinx): "Each player mills three cards. For each player, you may cast a card that player milled this way without paying its mana cost." Pins: CR 701.17a (Mill),
// CR 608.2g (casting a spell as an effect resolves), CR 118.9 (without paying the mana cost), CR 101.4 (players in turn order), CR 400.7 (a milled card is a new object). Cards are SYNTHETIC.
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const MILLER = 'SYNTHETIC Mill Caster';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';

const miller = singleFaceCard({
  name: MILLER,
  manaCost: ['U'],
  types: ['sorcery'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText:
    'Each player mills two cards. For each player, you may cast a card that player milled this way without paying its mana cost.',
  spell: {
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'mill', player: { kind: 'eachPlayer' }, count: 2 },
        { kind: 'castFree', objects: { kind: 'moved' }, perOwner: true },
      ],
    },
  },
});

function board() {
  return scenario()
    .seat(0)
    .define(miller)
    .hand(MILLER)
    .battlefield('Island')
    .library(BEARS, 'Island', 'Island')
    .seat(1)
    .library(SPIDER, 'Island', 'Island')
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

describe('For each player, cast a card that player milled this way', () => {
  test('one question for each player: a card of my own graveyard and one of the opponent', () => {
    const g = board();
    g.act(0).cast(MILLER, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(BEARS);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: SPIDER, zone: 'graveyard', seat: 1 });
    g.expect.stack([SPIDER, BEARS]);
    g.expect.invariants();
  });

  test('declining every question casts nothing', () => {
    const g = board();
    g.act(0).cast(MILLER, { pay: true });
    g.passAll();
    g.act(0).chooseCards();
    g.act(0).chooseCards();
    g.expect.stack([]);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('a player whose milled cards are all lands is not asked', () => {
    const g = scenario()
      .seat(0)
      .define(miller)
      .hand(MILLER)
      .battlefield('Island')
      .library('Island', 'Island', 'Island')
      .seat(1)
      .library(SPIDER, 'Island', 'Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(MILLER, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: SPIDER, zone: 'graveyard', seat: 1 });
    g.expect.stack([SPIDER]);
  });
});
