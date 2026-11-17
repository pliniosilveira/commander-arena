import { readFileSync } from 'node:fs';
import { type CardDefinition, getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function realCard(name: string): CardDefinition {
  const card = cards.find((entry) => entry.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, JSON.stringify(imported.support)).toBe('supported');
  expect(imported.support.unparsed).toEqual([]);
  return imported.definition;
}

const BIBLIO = realCard('Voracious Bibliophile');
const WILL = realCard('Domineering Will');

describe('Voracious Bibliophile', () => {
  test('draws one card for each target of the spell that was cast', () => {
    const g = scenario()
      .define(BIBLIO)
      .define(WILL)
      .seat(0)
      .battlefield(BIBLIO.name)
      .battlefield('Island', { count: 4 })
      .battlefield('Grizzly Bears')
      .hand(WILL.name)
      .library('Plains', { count: 4 })
      .seat(1)
      .build();

    g.act(0).cast(WILL.name, { targets: [{ player: 1 }, 'Grizzly Bears'], pay: true });
    g.passAll();

    expect(getView(g.state, 0).seats[0]?.hand).toHaveLength(2);
  });
});
