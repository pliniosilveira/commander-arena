import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((candidate) => candidate.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const FAMILIAR = real('Nightscape Familiar');
const BLUE_SPELL = parsed('SYNTHETIC Blue Spell', 'Instant', 'Draw a card.', {
  manaCost: '{1}',
  colors: ['U'],
});
const RED_SPELL = parsed('SYNTHETIC Red Spell', 'Instant', 'Draw a card.', {
  manaCost: '{1}',
  colors: ['R'],
});
const GREEN_SPELL = parsed('SYNTHETIC Green Spell', 'Instant', 'Draw a card.', {
  manaCost: '{1}',
  colors: ['G'],
});

describe('Nightscape Familiar', () => {
  const game = (spell: CardDefinition) =>
    scenario()
      .define(FAMILIAR)
      .define(BLUE_SPELL)
      .define(RED_SPELL)
      .define(GREEN_SPELL)
      .seat(0)
      .battlefield(FAMILIAR.name)
      .hand(spell.name)
      .seat(1)
      .build();

  test('parses blue and red spells as one union filter', () => {
    const ability = FAMILIAR.faces[0]?.abilities.find((candidate) => candidate.kind === 'static');
    expect(ability?.static).toEqual({
      kind: 'costReduction',
      spells: {
        anyOf: [{ colors: ['U'] }, { colors: ['R'] }],
        controller: 'you',
      },
      amount: 1,
    });
  });

  test.each([BLUE_SPELL, RED_SPELL])('reduces the cost of %s', (spell) => {
    const g = game(spell);
    g.act(0).cast(spell.name, { pay: true });
    g.passAll();
    g.expect.zone(spell.name, 'graveyard');
    g.expect.invariants();
  });

  test('does not reduce the cost of a green spell', () => {
    const g = game(GREEN_SPELL);
    expect(g.legalActions(0).some((action) => action.kind === 'castSpell')).toBe(false);
  });
});
