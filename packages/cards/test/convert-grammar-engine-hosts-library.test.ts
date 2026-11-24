// Hosts of Mordor, library group (issue 150): the REAL Oracle text (the corpus's golden.jsonl) goes through the grammar as cards with no override, is defined in an engine scenario and is
// played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Games have three seats where the text speaks of each player or each opponent.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string, supported = true): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  if (supported) {
    expect(imported.support.unparsed, name).toEqual([]);
    expect(imported.support.status, name).toBe('supported');
  }
  return imported.definition;
}

describe('Field of Ruin (CR 701.23a, 701.24, 110.2a: each player searches, puts the land onto the battlefield, shuffles)', () => {
  const FIELD = 'Field of Ruin';
  const TARGET = 'Command Tower';
  const field = real(FIELD);
  const tower = real(TARGET, false);

  const board = () =>
    scenario({ seats: 3 })
      .define(field)
      .define(tower)
      .seat(0)
      .battlefield(FIELD, 'Swamp', 'Swamp')
      .library('Forest', 'Plains')
      .seat(1)
      .battlefield(TARGET)
      .library('Island', 'Plains')
      .seat(2)
      .library('Mountain', 'Plains')
      .at('precombatMain', { active: 0 })
      .build();

  test('is valid', () => {
    expect(validateCard(field)).toEqual([]);
  });

  test('destroys the nonbasic land, then every player (three seats) fetches a basic land of their own', () => {
    const g = board();
    g.act(0).activate(FIELD, { ability: 1, targets: [TARGET], pay: true });
    g.passAll();
    g.expect.zone(TARGET, 'graveyard', { seat: 1 });
    for (const [seat, land] of [
      [0, 'Forest'],
      [1, 'Island'],
      [2, 'Mountain'],
    ] as const) {
      g.expect.pending('chooseCards', seat);
      g.act(seat).chooseCards(g.id(land));
    }
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.zone('Island', 'battlefield', { seat: 1 });
    g.expect.zone('Mountain', 'battlefield', { seat: 2 });
    for (const seat of [0, 1, 2]) {
      g.expect.eventLog([{ kind: 'libraryShuffled', seat }], { since: 0 });
    }
    g.expect.invariants();
  });
});
