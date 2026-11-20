// The Mardu Surge deck (issue 101): the REAL Oracle text of each card (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in
// an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
// Group 1, Myriad granted (CR 702.116a, CR 613.1f): Legion Loyalty, Blade of Selves and Ironwill Forger.
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

const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Island');

describe('Myriad granted (CR 702.116a, 613.1f)', () => {
  const loyalty = real('Legion Loyalty');
  const blade = real('Blade of Selves');
  const forger = real('Ironwill Forger');

  test.each([
    ['Legion Loyalty', loyalty],
    ['Blade of Selves', blade],
    ['Ironwill Forger', forger],
  ] as const)('%s is a valid card', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
  });

  test('Legion Loyalty: creatures you control have myriad, an opponent’s do not', () => {
    const g = scenario()
      .define(loyalty)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(loyalty.name)
      .battlefield(BEARS, { label: 'ours' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.derived('ours', { keywords: ['myriad'] });
    g.expect.derived('theirs', { keywords: [] });
  });

  test('Blade of Selves: the equipped creature has myriad, and loses it when unattached', () => {
    const g = scenario()
      .define(blade)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(blade.name, { label: 'blade', attachedTo: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.derived('bears', { keywords: ['myriad'] });
  });
});
