// Dread Return (Meren deck): the REAL Oracle text from the golden corpus goes through the grammar with no override and is played through
// applyAction. "Flashback—Sacrifice three creatures." is a flashback cost that is no mana: an alternative cost (CR 118.9) of sacrificing permanents
// (CR 701.21a), paid as the spell is cast after the targets are chosen (CR 601.2c, 601.2h), and the spell is exiled whenever it leaves the stack (CR 702.34a).
import { type CardDefinition, getLegalActions, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

// The line of the golden corpus (issue 346, from the app's import), the card's real Oracle text.
const GOLDEN = parseGolden(
  JSON.stringify({
    oracleId: '352b64d2-2ae5-44ee-a64f-94932ef545d3',
    name: 'Dread Return',
    layout: 'normal',
    colorIdentity: ['B'],
    edhrecRank: 543,
    faces: [
      {
        name: 'Dread Return',
        manaCost: '{2}{B}{B}',
        typeLine: 'Sorcery',
        oracleText:
          'Return target creature card from your graveyard to the battlefield.\nFlashback—Sacrifice three creatures. (You may cast this card from your graveyard for its flashback cost. Then exile it.)',
        power: null,
        toughness: null,
        loyalty: null,
        defense: null,
        colors: ['B'],
      },
    ],
    source: 'app import (Scryfall API), issue #346',
    acceptance: true,
  }),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const DREAD = 'Dread Return';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Swamp');
const dread = real(DREAD);

const flashbacks = (g: { state: Parameters<typeof getLegalActions>[0] }) =>
  getLegalActions(g.state, 0).filter(
    (a) => a.kind === 'castSpell' && a.alternative === 'flashback',
  );

function start(opts: {
  fodder?: readonly string[];
  graveyard?: readonly string[];
  swamps?: number;
}) {
  return scenario()
    .define(dread)
    .seat(0)
    .library(...LIBRARY)
    .graveyard(DREAD, ...(opts.graveyard ?? ['Serra Angel']))
    .battlefield(...Array.from({ length: opts.swamps ?? 0 }, () => 'Swamp'), ...(opts.fodder ?? []))
    .seat(1)
    .library(...LIBRARY)
    .hand('Counterspell')
    .battlefield('Island', 'Island')
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

describe('Dread Return: "Flashback—Sacrifice three creatures."', () => {
  test('the card is valid and the flashback cost is a sacrifice of three creatures', () => {
    expect(validateCard(dread)).toEqual([]);
    const flashback = dread.faces[0]?.abilities.find(
      (a) => a.kind === 'keyword' && a.keyword.kind === 'flashback',
    );
    expect(flashback).toMatchObject({
      keyword: { cost: [{ kind: 'sacrifice', count: 3, what: { types: ['creature'] } }] },
    });
  });

  test('cast from the graveyard with no mana, three creatures sacrificed, the target returns, the card is exiled', () => {
    const g = start({ fodder: [BEARS, BEARS, BEARS] });
    g.act(0).cast(DREAD, { alternative: 'flashback', targets: ['Serra Angel'], pay: true });
    g.passAll();
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
    expect(g.find({ name: BEARS, zone: 'graveyard', seat: 0 })).toHaveLength(3);
    expect(g.find({ name: DREAD, zone: 'exile', seat: 0 })).toHaveLength(1);
    expect(g.find({ name: DREAD, zone: 'graveyard', seat: 0 })).toHaveLength(0);
    g.expect.invariants();
  });

  test('the target is chosen before the cost: only creature cards of the graveyard are targets, never the creatures sacrificed', () => {
    const g = start({ fodder: [BEARS, BEARS, BEARS], graveyard: [BEARS] });
    g.act(0).cast(DREAD, {
      alternative: 'flashback',
      targets: [{ name: BEARS, zone: 'graveyard' }],
      pay: true,
    });
    g.passAll();
    expect(g.find({ name: BEARS, zone: 'battlefield', seat: 0 })).toHaveLength(1);
    expect(g.find({ name: BEARS, zone: 'graveyard', seat: 0 })).toHaveLength(3);
  });

  test('with more creatures than three the caster chooses which are sacrificed', () => {
    const g = start({ fodder: [BEARS, BEARS, BEARS, 'Llanowar Elves'] });
    g.act(0).cast(DREAD, { alternative: 'flashback', targets: ['Serra Angel'] });
    g.act(0).choosePermanents({ name: BEARS, nth: 0 }, { name: BEARS, nth: 1 }, 'Llanowar Elves');
    g.passAll();
    expect(g.find({ name: BEARS, zone: 'battlefield', seat: 0 })).toHaveLength(1);
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
  });

  test('with only two creatures it is not offered and cannot be cast, whatever the mana', () => {
    const g = start({ fodder: [BEARS, BEARS], swamps: 4 });
    expect(flashbacks(g)).toEqual([]);
    const r = g.act(0).try.cast(DREAD, { alternative: 'flashback' });
    expect(r.ok).toBe(false);
  });

  test('with three creatures it is offered', () => {
    const g = start({ fodder: [BEARS, BEARS, BEARS] });
    expect(flashbacks(g)).toHaveLength(1);
  });

  test("it is a sorcery: not offered on the opponent's turn", () => {
    const g = scenario()
      .define(dread)
      .seat(0)
      .library(...LIBRARY)
      .graveyard(DREAD, 'Serra Angel')
      .battlefield(BEARS, BEARS, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, turn: 3 })
      .build();
    expect(flashbacks(g)).toEqual([]);
    const r = g.act(0).try.cast(DREAD, { alternative: 'flashback' });
    expect(r.ok).toBe(false);
  });

  test('a flashback spell that is countered is exiled, and the sacrifice stays paid (CR 701.6, 702.34a)', () => {
    const g = start({ fodder: [BEARS, BEARS, BEARS] });
    g.act(0).cast(DREAD, { alternative: 'flashback', targets: ['Serra Angel'], pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell', { targets: [{ name: DREAD, zone: 'stack' }], pay: true });
    g.passAll();
    expect(g.find({ name: DREAD, zone: 'exile', seat: 0 })).toHaveLength(1);
    expect(g.find({ name: DREAD, zone: 'graveyard', seat: 0 })).toHaveLength(0);
    g.expect.zone('Serra Angel', 'graveyard', { seat: 0 });
    expect(g.find({ name: BEARS, zone: 'graveyard', seat: 0 })).toHaveLength(3);
  });

  test('cast from the hand it costs its mana cost and sacrifices nothing', () => {
    const g = scenario()
      .define(dread)
      .seat(0)
      .library(...LIBRARY)
      .hand(DREAD)
      .graveyard('Serra Angel')
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', BEARS)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(DREAD, { targets: ['Serra Angel'], pay: true });
    g.passAll();
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(DREAD, 'graveyard', { seat: 0 });
  });
});
