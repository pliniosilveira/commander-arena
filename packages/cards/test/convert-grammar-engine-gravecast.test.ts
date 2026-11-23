// Gravecast group of the Dance of the Elements deck: the REAL Oracle text of Horde of Notions, Impulsivity and Incandescent Soulstoke (the corpus's golden.jsonl) goes through the
// grammar as a card with no override, is defined in an engine scenario and is played through applyAction. Pins: CR 608.2g and 118.9 (cast free as the ability resolves), CR 305.1
// (a land card is played, as the land play of the turn), CR 614.1a (exile instead of a graveyard), CR 110.2a (the creature put onto the battlefield enters under the control of the
// player who puts it), CR 603.7c (a delayed ability about that one object), CR 702.10 (haste).
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const impulsivity = real('Impulsivity');
const soulstoke = real('Incandescent Soulstoke');
const SPIRIT = 'SYNTHETIC Test Elemental';
const spirit = parsed(SPIRIT, 'Creature — Elemental', '', { power: '2', toughness: '2' });
const LIBRARY = Array.from({ length: 12 }, () => 'Island');
const DIVINATION = 'Divination';
const BEARS = 'Grizzly Bears';

describe('Impulsivity', () => {
  test('is valid and reads "without paying its mana cost" and the exile rider', () => {
    expect(validateCard(impulsivity)).toEqual([]);
    expect(JSON.stringify(impulsivity.faces[0]?.abilities)).toContain('"free":true');
    expect(JSON.stringify(impulsivity.faces[0]?.abilities)).toContain('"exileInstead":true');
  });

  const board = () =>
    scenario()
      .define(impulsivity)
      .seat(0)
      .library(...LIBRARY)
      .hand(impulsivity.name)
      .battlefield('Island', { count: 6 })
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .graveyard(DIVINATION, BEARS)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('entering casts an instant or sorcery card of any graveyard for free; it is exiled instead of going to the graveyard', () => {
    const g = board();
    g.act(0).cast(impulsivity.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.stack([DIVINATION]);
    const before = getView(g.state, 0).seats[0]?.handCount ?? 0;
    g.passAll();
    expect(getView(g.state, 0).seats[0]?.handCount).toBe(before + 2);
    g.expect.zone(DIVINATION, 'exile', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('declining leaves the card in the graveyard', () => {
    const g = board();
    g.act(0).cast(impulsivity.name, { pay: true });
    g.passAll();
    g.passAll();
    g.act(0).decline();
    g.expect.zone(DIVINATION, 'graveyard', { seat: 1 });
    g.expect.stack([]);
  });
});

describe('Incandescent Soulstoke', () => {
  test('is valid', () => {
    expect(validateCard(soulstoke)).toEqual([]);
  });

  const board = (hand: readonly string[]) =>
    scenario()
      .define(soulstoke)
      .define(spirit)
      .seat(0)
      .library(...LIBRARY)
      .hand(...hand)
      .battlefield('Island')
      .battlefield('Mountain')
      .battlefield(soulstoke.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('puts an Elemental creature card from hand onto the battlefield with haste, and sacrifices it at the next end step', () => {
    const g = board([SPIRIT, BEARS]);
    g.act(0).activate(soulstoke.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(SPIRIT);
    g.expect.zone(SPIRIT, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    const view = getView(g.state, 0).battlefield.find((o) => o.name === SPIRIT);
    expect(view?.keywords).toContain('haste');
    // CR 603.7c: the delayed ability sacrifices that creature at the beginning of the next end step.
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(SPIRIT, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('a card that is not an Elemental is not offered, and nothing is put or sacrificed', () => {
    const g = board([BEARS]);
    g.act(0).activate(soulstoke.name, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(soulstoke.name, 'battlefield', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(soulstoke.name, 'battlefield', { seat: 0 });
  });
});

describe('Horde of Notions', () => {
  const horde = real('Horde of Notions');
  const costly = parsed('SYNTHETIC Costly Elemental', 'Creature — Elemental', '', {
    manaCost: '{5}{R}',
    power: '2',
    toughness: '2',
  });
  const meadow = parsed('SYNTHETIC Elemental Meadow', 'Land — Elemental', '');

  test('is valid and plays a target card of your graveyard for free', () => {
    expect(validateCard(horde)).toEqual([]);
    expect(JSON.stringify(horde.faces[0]?.abilities)).toContain('"kind":"castFree"');
  });

  const board = (landsPlayed = 0) =>
    scenario()
      .define(horde)
      .define(costly)
      .define(meadow)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(horde.name)
      .battlefield('Plains')
      .battlefield('Island')
      .battlefield('Swamp')
      .battlefield('Mountain')
      .battlefield('Forest')
      .graveyard(costly.name, meadow.name, BEARS)
      .landsPlayed(landsPlayed)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('an Elemental creature card is cast without paying its {5}{R}', () => {
    const g = board();
    g.act(0).activate(horde.name, { pay: true, targets: [costly.name] });
    g.passAll();
    g.act(0).chooseCards(costly.name);
    g.expect.stack([costly.name]);
    g.passAll();
    g.expect.zone(costly.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('an Elemental land card is played as the land play of the turn (CR 305.1)', () => {
    const g = board();
    g.act(0).activate(horde.name, { pay: true, targets: [meadow.name] });
    g.passAll();
    g.act(0).chooseCards(meadow.name);
    g.expect.zone(meadow.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a land is not played when no land play is left', () => {
    const g = board(1);
    g.act(0).activate(horde.name, { pay: true, targets: [meadow.name] });
    g.passAll();
    g.expect.zone(meadow.name, 'graveyard', { seat: 0 });
  });
});
