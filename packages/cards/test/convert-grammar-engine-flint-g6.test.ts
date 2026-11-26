// Flint deck (issue 685), group 6: Prosper, Tome-Bound, read from its REAL Oracle text (fixtures/corpus/golden.jsonl) with no override and played through applyAction.
// "Pact Boon — Whenever you play a card from exile, create a Treasure token." (CR 305.1, 601.2a, 603.2: a land played from exile and a spell cast from exile both are) with its
// "Mystic Arcanum", which puts the cards in exile at the beginning of the end step (CR 513.1).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
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

const PROSPER = real('Prosper, Tome-Bound');
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const treasures = (g: ScenarioGame) =>
  g.find({ name: 'Treasure', zone: 'battlefield', seat: 0 }).length;

describe('Prosper, Tome-Bound (CR 305.1, 601.2a, 603.2)', () => {
  test('is valid and the trigger is about a card played from exile', () => {
    expect(validateCard(PROSPER)).toEqual([]);
    expect(PROSPER.faces[0]?.abilities[2]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'playsCard', fromExile: true },
    });
  });

  const start = (top: string) =>
    scenario()
      .define(PROSPER)
      .seat(0)
      .library(top, ...FILLER)
      .battlefield(PROSPER.name)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the land exiled at the end step and played from exile makes a Treasure', () => {
    const g = start('Forest');
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Forest', 'exile', { seat: 0 });
    expect(treasures(g)).toBe(0);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).playLand({ name: 'Forest', zone: 'exile', seat: 0 });
    g.passAll();
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    expect(treasures(g)).toBe(1);
  });

  test('a land played from the hand makes no Treasure', () => {
    const g = scenario()
      .define(PROSPER)
      .seat(0)
      .library(...FILLER)
      .hand('Forest')
      .battlefield(PROSPER.name)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).playLand('Forest');
    g.passAll();
    expect(treasures(g)).toBe(0);
  });
});
