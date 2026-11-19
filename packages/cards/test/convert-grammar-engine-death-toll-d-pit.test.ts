// Death Toll deck, group D: "You may cast spells from the top of your library by sacrificing a nonland permanent in addition to paying their other costs." (CR 601.2b, 601.2f, 118.8, 601.3,
// 401.5). The wording is that of Into the Pit; every card name starts with "SYNTHETIC". Rulings 2024-09-20: all costs and timing rules of a spell cast from the top of the library still apply.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears'; // {1}{G}, 2/2
const FILLER = ['Island', 'Plains', 'Swamp'] as const;

const pit = parsed(
  'SYNTHETIC Parsed Pit',
  'Enchantment',
  'You may look at the top card of your library any time.\nYou may cast spells from the top of your library by sacrificing a nonland permanent in addition to paying their other costs.',
  { manaCost: '{2}{B}', colors: ['B'] },
);
const trinket = parsed('SYNTHETIC Parsed Trinket', 'Artifact', 'Flash', { manaCost: '{1}' });

const board = (top: readonly string[], lands = 2) =>
  scenario()
    .define(pit)
    .define(trinket)
    .seat(0)
    .library(...top, ...FILLER)
    .hand(BEARS)
    .battlefield(pit.name)
    .battlefield(trinket.name)
    .battlefield('Forest', { count: lands })
    .seat(1)
    .library(...FILLER)
    .battlefield(trinket.name)
    .at('precombatMain', { active: 0 })
    .build();

describe('"You may cast spells from the top of your library by sacrificing a nonland permanent in addition to paying their other costs"', () => {
  test('the top card is cast: its mana cost is paid and a nonland permanent of yours is sacrificed', () => {
    const g = board([BEARS]);
    g.act(0).cast({ name: BEARS, zone: 'library', seat: 0 }, { pay: true });
    expect(g.state.pending?.kind).toBe('choosePermanent');
    g.act(0).choosePermanents({ name: trinket.name, zone: 'battlefield', seat: 0 });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(trinket.name, 'graveyard', { seat: 0 });
    g.expect.zone(trinket.name, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('the permanent that gives the permission may be the one sacrificed', () => {
    const g = board([BEARS]);
    g.act(0).cast({ name: BEARS, zone: 'library', seat: 0 }, { pay: true });
    g.act(0).choosePermanents(pit.name);
    g.passAll();
    g.expect.zone(pit.name, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('the other costs still apply: with too little mana the card is not offered', () => {
    const g = board([BEARS], 1);
    g.expect.illegal(0, { cast: { name: BEARS, zone: 'library', seat: 0 } });
  });

  test('a land on top is not a spell: it cannot be cast this way', () => {
    const g = board(['Forest']);
    g.expect.illegal(0, { cast: { name: 'Forest', zone: 'library', seat: 0 } });
  });

  test('a spell cast from the hand has no additional cost', () => {
    const g = board([BEARS]);
    g.act(0).cast({ name: BEARS, zone: 'hand', seat: 0 }, { pay: true });
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(trinket.name, 'battlefield', { seat: 0 });
  });

  test('without the permanent the top card cannot be cast', () => {
    const g = scenario()
      .seat(0)
      .library(BEARS, ...FILLER)
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.illegal(0, { cast: { name: BEARS, zone: 'library', seat: 0 } });
  });
});
