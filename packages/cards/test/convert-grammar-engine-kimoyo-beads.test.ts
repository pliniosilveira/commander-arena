import { readFileSync } from 'node:fs';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const card = cards.find(({ name }) => name === 'Kimoyo Beads');
if (card === undefined) throw new Error('Kimoyo Beads is not in the golden corpus');

const beads = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
expect(beads.support.status, JSON.stringify(beads.support)).toBe('supported');
const library = Array.from({ length: 24 }, (_, i) => (i % 2 === 0 ? 'Plains' : 'Swamp'));

test('Kimoyo Beads remembers chosen modes across turns and resets when it returns', () => {
  const g = scenario()
    .define(beads.definition)
    .seat(0)
    .battlefield(beads.definition.name)
    .library(...library)
    .seat(1)
    .library(...library)
    .at('postcombatMain', { active: 0 })
    .build();

  g.advanceTo('end');
  expect(legalModes(g)).toEqual([[0], [1], [2]]);
  g.act(0).chooseModes(0);
  g.passAll();
  g.expect.handSize(0, 1);

  nextOwnEndStep(g);
  expect(legalModes(g)).toEqual([[1], [2]]);
  g.act(0).chooseModes(1);
  g.passAll();
  g.expect.zone('Soldier', 'battlefield', { seat: 0, count: 2 });

  nextOwnEndStep(g);
  expect(legalModes(g)).toEqual([]);
  g.expect.pending('priority', 0);
  g.passAll();
  g.expect.life(0, 43);
  g.expect.zone(beads.definition.name, 'battlefield', { seat: 0 });

  nextOwnEndStep(g);
  expect(legalModes(g)).toEqual([[0], [1], [2]]);
  g.expect.invariants();
});

function legalModes(g: ScenarioGame): number[][] {
  return g
    .legalActions(0)
    .flatMap((action) => (action.kind === 'chooseModes' ? [[...action.modes]] : []));
}

function nextOwnEndStep(g: ScenarioGame): void {
  g.advanceTo('end', { turn: 'next' });
  g.advanceTo('end', { turn: 'next' });
}
