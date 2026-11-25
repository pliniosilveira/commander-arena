// Draconic Dissent deck (issue 167): the REAL Oracle text of Wandering Fumarole (a land that becomes a 1/4 creature with a granted
// "{0}: Switch this creature's power and toughness until end of turn.") goes through the grammar as a card with no override and
// is played through applyAction. Pins: CR 613.4d (switching power and toughness is layer 7d), CR 613.1f, 205.1b, 514.2.
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
  if (imported.support.status !== 'supported') {
    throw new Error(`${name}: ${JSON.stringify(imported.support.unparsed)}`);
  }
  return imported.definition;
}

describe('Wandering Fumarole', () => {
  const land = real('Wandering Fumarole');
  const start = () =>
    scenario()
      .define(land)
      .seat(0)
      .battlefield(land.name)
      .battlefield('Island', 'Island', 'Mountain', 'Mountain')
      .at('precombatMain', { active: 0 })
      .build();
  const animate = (g: ReturnType<typeof start>) => {
    g.act(0)
      .activate(land.name)
      .payManual(['Island[0]', 'Island[1]', 'Mountain[0]', 'Mountain[1]']);
    g.passAll();
  };

  test('the card is valid', () => {
    expect(validateCard(land)).toEqual([]);
  });

  test('until end of turn it is a 1/4 blue and red Elemental creature that is still a land', () => {
    const g = start();
    animate(g);
    g.expect.pt(land.name, 1, 4);
    g.expect.derived(land.name, {
      types: ['land', 'creature'],
      subtypes: ['Elemental'],
      colors: ['U', 'R'],
    });
  });

  test('{0}: switch its power and toughness (a 4/1), and again (back to 1/4)', () => {
    const g = start();
    animate(g);
    g.act(0).activate(land.name, { ability: 3, pay: true });
    g.passAll();
    g.expect.pt(land.name, 4, 1);
    g.act(0).activate(land.name, { ability: 3, pay: true });
    g.passAll();
    g.expect.pt(land.name, 1, 4);
    g.expect.invariants();
  });

  test('before it is animated it has no creature type and no switch ability to use', () => {
    const g = start();
    g.expect.derived(land.name, { types: ['land'] });
  });

  test('everything ends with the turn (CR 514.2)', () => {
    const g = start();
    animate(g);
    g.act(0).activate(land.name, { ability: 3, pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(land.name, { types: ['land'] });
  });
});
