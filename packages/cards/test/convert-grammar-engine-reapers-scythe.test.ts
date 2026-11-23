// Reaper's Scythe (Scions & Spellcraft, issue 98): the REAL Oracle text through the grammar and played in a scenario. An Equipment's static ability that gives the equipped
// creature a bonus for each counter on the Equipment, and a creature type besides (CR 301.5a, 122.1, 613.1d, 613.4c); the end-step counters read the players who lost life.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const card = GOLDEN.find((c) => c.name === "Reaper's Scythe");
if (card === undefined) throw new Error("Reaper's Scythe is not in the golden corpus");
const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
const scythe: CardDefinition = imported.definition;
const LIBRARY = Array.from({ length: 10 }, () => 'Island');

test("Reaper's Scythe imports as supported and is valid", () => {
  expect(imported.support.unparsed).toEqual([]);
  expect(imported.support.status).toBe('supported');
  expect(validateCard(scythe)).toEqual([]);
});

test('the equipped creature gets +1/+1 for each soul counter and is an Assassin as well', () => {
  const g = scenario()
    .define(scythe)
    .seat(0)
    .library(...LIBRARY)
    .battlefield('Grizzly Bears', { label: 'bear' })
    .battlefield(scythe.name, { attachedTo: 'bear', counters: { soul: 2 } })
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0 })
    .build();
  g.expect.pt('bear', 4, 4);
  g.expect.derived('bear', { subtypes: ['Bear', 'Assassin'] });
  g.expect.invariants();
});

test('without counters the bonus is zero', () => {
  const g = scenario()
    .define(scythe)
    .seat(0)
    .library(...LIBRARY)
    .battlefield('Grizzly Bears', { label: 'bear' })
    .battlefield(scythe.name, { attachedTo: 'bear' })
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0 })
    .build();
  g.expect.pt('bear', 2, 2);
});
