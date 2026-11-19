// Inkshield: the REAL Oracle text of the golden corpus goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the
// nodes the parser writes for the real text are what the engine runs. Pins: CR 615.5 (the additional effect of a prevention effect happens as the damage is prevented), CR 615.6
// (prevented damage is never dealt), CR 111.2 (the player who creates a token controls it).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
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

const inkshield = real('Inkshield');

test('the card the grammar reads is a valid card of the engine', () => {
  expect(validateCard(inkshield)).toEqual([]);
});

test('an attack of 3 + 2 combat damage into Inkshield: no life lost, five Inklings with flying for the defender', () => {
  const g = scenario()
    .define(inkshield)
    .seat(0)
    .battlefield('SYNTHETIC Vanilla 3/3', 'SYNTHETIC Vanilla 2/2')
    .seat(1)
    .life(10)
    .battlefield('Plains', 'Plains', 'Plains', 'Swamp', 'Swamp')
    .hand('Inkshield')
    .at('precombatMain', { active: 0 })
    .build();
  g.advanceTo('declareAttackers');
  g.act(0).attack(['SYNTHETIC Vanilla 3/3', 'SYNTHETIC Vanilla 2/2']);
  g.advanceTo('declareBlockers');
  if (g.state.pending?.kind === 'declareBlockers') g.act(1).declareBlockers([]);
  g.act(0).pass();
  g.act(1).cast({ name: 'Inkshield', zone: 'hand', seat: 1, nth: 0 }, { pay: true });
  g.passAll();
  g.advanceTo('endOfCombat');
  g.expect.life(1, 10);
  const inklings = g
    .find({ name: 'Inkling', zone: 'battlefield', seat: 1 })
    .filter((o) => o.token !== null);
  expect(inklings).toHaveLength(5);
});
