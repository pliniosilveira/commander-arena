// Selvala's Stampede (issue 103): the REAL Oracle text (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an
// engine scenario and is played through applyAction. Its spell is the one of its SYNTHETIC sibling (`synthetic-vote.ts`, "SYNTHETIC Stampede Rite").
// Pins: CR 701.38a/b (the votes), CR 701.20 (reveal until as many creature cards as wild votes), CR 701.24 (shuffle the rest), CR 110.2a, CR 608.2d.
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

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

const stampede = real("Selvala's Stampede");

describe("Selvala's Stampede", () => {
  test('valid, with the spell of its SYNTHETIC sibling', () => {
    expect(validateCard(stampede)).toEqual([]);
    expect(stampede.faces[0]?.spell).toEqual(
      syntheticCard('SYNTHETIC Stampede Rite').faces[0]?.spell,
    );
  });

  const board = () =>
    scenario()
      .define(stampede)
      .seat(0)
      .hand(stampede.name, 'Grizzly Bears')
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .library('Swamp', 'Giant Spider', 'Plains', 'Llanowar Elves', 'Island')
      .seat(1)
      .library('Island', 'Island')
      .build();

  test('one wild vote and one free vote: the first creature of the library and a creature from the hand enter', () => {
    const g = board();
    g.act(0).cast(stampede.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('wild');
    g.act(1).chooseOption('free');
    g.expect.zone('Giant Spider', 'battlefield', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'library', { seat: 0 });
    g.act(0).chooseCards('Grizzly Bears');
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('two wild votes: both creatures enter and nothing is asked of the hand', () => {
    const g = board();
    g.act(0).cast(stampede.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('wild');
    g.act(1).chooseOption('wild');
    g.expect.zone('Giant Spider', 'battlefield', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'battlefield', { seat: 0 });
    g.expect.pending('priority', 0);
  });
});
