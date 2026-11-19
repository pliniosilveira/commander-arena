// Death Toll deck, group D: "At the beginning of your upkeep, you may mill three cards. Then if there are twenty or more cards in your graveyard, you may play the exiled card without
// paying its mana cost." (CR 701.17a, 608.2c, 608.2d, 702.75a, 608.2g). The wording is that of Cemetery Tampering, with its Hideaway; every card name starts with "SYNTHETIC".
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';
const FILLER = ['Island', 'Plains', 'Swamp', 'Forest'] as const;

const tampering = parsed(
  'SYNTHETIC Parsed Tampering',
  'Enchantment',
  'Hideaway 5\nAt the beginning of your upkeep, you may mill three cards. Then if there are twenty or more cards in your graveyard, you may play the exiled card without paying its mana cost.',
  { manaCost: '{B}', colors: ['B'] },
);

/** The permanent in play with the Bears exiled under it, seat 0's graveyard holding `graveyard` cards, and the game at the upkeep of seat 0's next turn. */
function upkeep(graveyard: number) {
  const g = scenario()
    .define(tampering)
    .seat(0)
    .hand(tampering.name)
    .battlefield('Swamp')
    .library(BEARS, ...FILLER, ...FILLER, ...FILLER)
    .graveyard('Island', { count: graveyard })
    .seat(1)
    .library(...FILLER, ...FILLER, ...FILLER)
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).cast(tampering.name, { pay: true });
  g.passAll();
  expect(g.state.pending?.kind).toBe('chooseCards');
  g.act(0).chooseCards(BEARS);
  g.expect.zone(BEARS, 'exile', { seat: 0 });
  g.advanceTo('upkeep', { turn: 5 });
  return g;
}

describe('"you may mill three cards. Then if there are twenty or more cards in your graveyard, you may play the exiled card without paying its mana cost"', () => {
  test('milled to twenty: the exiled card is played free (the two offers are separate questions)', () => {
    const g = upkeep(17);
    g.passAll();
    g.act(0).accept();
    expect(g.state.seats[0]?.graveyard).toHaveLength(20);
    const offer = g.state.pending;
    expect(offer?.kind).toBe('chooseCards');
    g.act(0).chooseCards(BEARS);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('milling is optional: declined, the graveyard stays at nineteen and the Then-if test fails, so nothing is offered', () => {
    const g = upkeep(19);
    g.passAll();
    g.act(0).decline();
    expect(g.state.seats[0]?.graveyard).toHaveLength(19);
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    g.expect.zone(BEARS, 'exile', { seat: 0 });
  });

  test('the test is on the graveyard as it is after the mill: nineteen and a mill of three is twenty-two, but sixteen and three is nineteen: not offered', () => {
    const g = upkeep(16);
    g.passAll();
    g.act(0).accept();
    expect(g.state.seats[0]?.graveyard).toHaveLength(19);
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    g.expect.zone(BEARS, 'exile', { seat: 0 });
  });

  test('already at twenty or more without milling: the free play is still offered after a declined mill', () => {
    const g = upkeep(20);
    g.passAll();
    g.act(0).decline();
    expect(g.state.pending?.kind).toBe('chooseCards');
  });
});
