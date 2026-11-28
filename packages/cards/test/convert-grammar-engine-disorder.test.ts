// Disorder in the Court (Deep Clue Sea deck, issue 128): "Exile X target creatures, then investigate X times. Return the exiled cards to the battlefield tapped under their owners' control at the
// beginning of the next end step." The REAL Oracle text (the golden corpus) goes through the grammar with no override, is defined in an engine scenario and is played through applyAction.
// Rules pinned: CR 107.3 (X targets), 701.13 (exile), 701.16a (investigate X times: X Clues), 603.7 and 603.7c (the delayed return is about the cards the exile moved, not the Clues made
// after), 110.2 and 400.7 (each card returns under its owner's control, as a new object), 110.5b (tapped), 101.4 (three seats).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
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
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const DISORDER = real('Disorder in the Court');
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('Disorder in the Court', () => {
  const game = () =>
    scenario({ seats: 3 })
      .define(DISORDER)
      .seat(0)
      .library(...LIBRARY)
      .hand(DISORDER.name)
      .battlefield('Plains', 'Plains', 'Plains', 'Island', 'Island', BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs' })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(DISORDER)).toEqual([]);
  });

  test('X = 2: two creatures are exiled, I investigate twice, and at the next end step they return tapped under their owners’ control', () => {
    const g = game();
    g.act(0).cast(DISORDER.name, { x: 2, targets: [BEARS, 'theirs'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(SPIDER, 'exile', { seat: 1 });
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 2 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    g.expect.tapped(BEARS);
    g.expect.tapped(SPIDER);
    // The Clues stay: the delayed ability was about the exiled cards only.
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 2 });
    g.expect.invariants();
  });

  test('X = 1: one creature, one Clue', () => {
    const g = game();
    g.act(0).cast(DISORDER.name, { x: 1, targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'exile', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 1 });
  });
});
