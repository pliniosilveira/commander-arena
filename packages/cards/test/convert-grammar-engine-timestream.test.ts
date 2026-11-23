// Timestream Navigator (issue 134): "Ascend" and "{2}{U}{U}, {T}, Put this creature on the bottom of its owner's library: Take an extra turn after this one. Activate only if
// you have the city's blessing." The REAL Oracle text (the golden corpus) goes through the grammar with no override, is defined in an engine scenario and is played through
// applyAction. Pins: CR 500.7 (the extra turn directly after this one), CR 118.3 and 401.4 (the cost puts the creature on the bottom of its owner's library), CR 702.131
// (Ascend and the city's blessing), CR 602.5b (an activation restriction).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { dropped } from './parser-p5-helpers';

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

const ISLANDS = ['Island', 'Island', 'Island', 'Island'] as const;
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('Timestream Navigator', () => {
  const navigator = real('Timestream Navigator');

  const game = (permanents: readonly string[]) =>
    scenario()
      .define(navigator)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(navigator.name, ...ISLANDS, ...permanents)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(navigator)).toEqual([]);
  });

  test('with fewer than ten permanents there is no blessing and the ability cannot be activated (CR 702.131, 602.5b)', () => {
    const g = game([]);
    g.expect.citysBlessing(0, false);
    expect(g.act(0).try.activate(navigator.name).ok).toBe(false);
  });

  test('with the city’s blessing: the creature goes to the bottom of its owner’s library as a cost and its controller takes the next turn (CR 500.7, 401.4)', () => {
    // Ten permanents: the Navigator, four Islands and five more.
    const g = game(['Plains', 'Plains', 'Plains', 'Plains', 'Plains']);
    g.pass(0);
    g.pass(1); // state-based check and Ascend: the blessing is there once anybody would get priority
    g.expect.citysBlessing(0);
    const first = g.state.turn.number;
    g.advanceTo('postcombatMain');
    g.act(0).activate(navigator.name, { pay: true });
    g.expect.zone(navigator.name, 'battlefield', { count: 0 });
    g.expect.zone(navigator.name, 'library', { seat: 0, count: 1 });
    const library = g.state.seats[0]?.library ?? [];
    const bottom = library[library.length - 1];
    const card = bottom === undefined ? undefined : g.state.objects[bottom]?.card;
    const stored = card === null || card === undefined ? undefined : g.state.cards[card];
    expect(
      stored === undefined ? undefined : g.state.definitions[stored.definition]?.faces[0]?.name,
    ).toBe(navigator.name);
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.turn).toMatchObject({ activeSeat: 0, number: first + 1, extra: true });
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(1);
    expect(g.state.turn.extra).toBeUndefined();
    g.expect.invariants();
  });

  test.each([
    [
      'two extra turns',
      "{2}{U}{U}, {T}, Put ~ on the bottom of its owner's library: Take two extra turns after this one.",
    ],
    [
      'the top of the library',
      "{2}{U}{U}, {T}, Put ~ on top of its owner's library: Take an extra turn after this one.",
    ],
    [
      'a rider about the turn',
      "{2}{U}{U}, {T}, Put ~ on the bottom of its owner's library: Take an extra turn after this one. Skip the untap step of that turn.",
    ],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text, 'creature')).toBeDefined();
  });
});
