// Aftermath (CR 702.127a) on the real split cards of issue 104, Dusk // Dawn and Never // Return, imported
// from the golden corpus and played through the engine: the keyword is read, the first half is cast from the
// hand, the second only from the graveyard and is then exiled, and each half does what its text says.
import { readFileSync } from 'node:fs';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const load = (name: string) => {
  const found = cards.find((c) => c.name === name);
  if (found === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(found), undefined, NO_OVERRIDES);
  expect(imported.support.status, JSON.stringify(imported.support)).toBe('supported');
  return imported.definition;
};
const dusk = load('Dusk // Dawn');
const never = load('Never // Return');

test('the second half carries the Aftermath keyword and the first does not', () => {
  for (const def of [dusk, never]) {
    expect(def.layout).toBe('split');
    expect(def.faces[0]?.abilities).toEqual([]);
    expect(def.faces[1]?.abilities).toEqual([{ kind: 'keyword', keyword: { kind: 'aftermath' } }]);
  }
});

test('Dusk destroys creatures with power 3 or greater, then Dawn from the graveyard returns power 2 or less and is exiled', () => {
  const g = scenario()
    .define(dusk)
    .seat(0)
    .hand(dusk.name)
    .graveyard('Grizzly Bears', 'Serra Angel', 'Typhoid Rats')
    .battlefield(
      'Plains',
      'Plains',
      'Plains',
      'Plains',
      'Plains',
      'Plains',
      'Plains',
      'Plains',
      'Plains',
    )
    .battlefield('Serra Angel')
    .seat(1)
    .battlefield('Grizzly Bears')
    .battlefield('Serra Angel')
    .build();
  // Only Dusk is offered from the hand.
  g.expect.illegal(0, { cast: dusk.name, face: 1 });
  g.act(0).cast(dusk.name, { face: 0, pay: true });
  g.passAll();
  expect(g.find({ name: 'Serra Angel', zone: 'battlefield' })).toHaveLength(0);
  expect(g.find({ name: 'Grizzly Bears', zone: 'battlefield' })).toHaveLength(1);
  g.expect.zone(dusk.name, 'graveyard', { seat: 0 });
  // Dawn from the graveyard: creature cards with power 2 or less come back, the Angel stays.
  g.act(0).cast(dusk.name, { face: 1, pay: true });
  g.passAll();
  expect(g.find({ name: 'Grizzly Bears', zone: 'hand', seat: 0 })).toHaveLength(1);
  expect(g.find({ name: 'Typhoid Rats', zone: 'hand', seat: 0 })).toHaveLength(1);
  expect(g.find({ name: 'Serra Angel', zone: 'hand', seat: 0 })).toHaveLength(0);
  expect(g.find({ name: 'Serra Angel', zone: 'graveyard', seat: 0 }).length).toBeGreaterThan(0);
  g.expect.zone(dusk.name, 'exile');
  g.expect.invariants();
});

test('Never destroys a creature, then Return exiles a card from a graveyard and makes a 2/2 black Zombie', () => {
  const g = scenario()
    .define(never)
    .seat(0)
    .hand(never.name)
    .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
    .seat(1)
    .graveyard('Typhoid Rats')
    .battlefield('Grizzly Bears')
    .build();
  g.expect.illegal(0, { cast: never.name, face: 1 });
  g.act(0).cast(never.name, { face: 0, targets: [{ name: 'Grizzly Bears' }], pay: true });
  g.passAll();
  g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
  g.expect.zone(never.name, 'graveyard', { seat: 0 });
  g.act(0).cast(never.name, { face: 1, targets: [{ name: 'Typhoid Rats' }], pay: true });
  g.passAll();
  g.expect.zone('Typhoid Rats', 'exile');
  const zombies = g.find({ name: 'Zombie', zone: 'battlefield' });
  expect(zombies).toHaveLength(1);
  g.expect.zone(never.name, 'exile');
  g.expect.invariants();
});
