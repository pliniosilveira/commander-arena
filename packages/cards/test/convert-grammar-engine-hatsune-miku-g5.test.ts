// The Hatsune Miku - Secret Lair Commander deck (issue 145), group 5: the REAL Oracle text of Voice of the Blessed (the corpus's golden.jsonl, taken from the issue) goes
// through the grammar as a card with no override and is played through applyAction. Pins: CR 122.1 (counters), CR 611.3a (a static ability applies while its condition holds,
// looked at all the time), CR 613.8 (counters belong to no layer), CR 702.9a / 702.12a / 702.20a (flying, indestructible, vigilance as keywords the effect grants).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

/** A card of the golden corpus with its text replaced, imported through the grammar. */
function withText(name: string, text: string) {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const [face] = card.faces;
  if (face === undefined) throw new Error(`${name} has no face`);
  return importCard(
    fromGoldenCard({ ...card, faces: [{ ...face, oracleText: text }] }),
    undefined,
    NO_OVERRIDES,
  );
}

const VOICE = 'Voice of the Blessed';

describe('Voice of the Blessed: flying and vigilance with four counters, indestructible with ten', () => {
  const voice = real(VOICE);
  const withCounters = (n: number) =>
    scenario()
      .define(voice)
      .seat(0)
      .life(20)
      .battlefield(VOICE, { counters: { '+1/+1': n } })
      .seat(1)
      .life(20)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(voice)).toEqual([]);
  });

  test('three counters give neither flying nor vigilance (CR 611.3a: the condition does not hold)', () => {
    const g = withCounters(3);
    g.expect.derived(VOICE, { keywords: [] });
  });

  test('four counters give flying and vigilance but not indestructible', () => {
    const g = withCounters(4);
    g.expect.derived(VOICE, { keywords: ['flying', 'vigilance'] });
  });

  test('nine counters are not enough for indestructible', () => {
    const g = withCounters(9);
    g.expect.derived(VOICE, { keywords: ['flying', 'vigilance'] });
  });

  test('ten counters add indestructible', () => {
    const g = withCounters(10);
    g.expect.derived(VOICE, { keywords: ['flying', 'vigilance', 'indestructible'] });
  });
});

describe('texts that are not Voice of the Blessed are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    'As long as ~ has four or more +1/+1 counters on it, you draw a card.',
    'As long as ~ has four +1/+1 counters on it, it has flying.',
    'As long as ~ has four or more counters on it, you draw a card.',
    'As long as ~ has one or more +1/+1 counters on it, it has flying.',
  ];
  for (const text of lines) {
    test(text, () => {
      expect(withText(VOICE, text).support.status).toBe('unsupported');
    });
  }
});
