import { readFileSync } from 'node:fs';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const card = cards.find(({ name }) => name === "Archenemy's Charm");
if (card === undefined) throw new Error("Archenemy's Charm is not in the golden corpus");
const planeswalkerCard = cards.find(({ name }) => name === 'Gideon Jura');
if (planeswalkerCard === undefined) throw new Error('Gideon Jura is not in the golden corpus');

const charm = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
expect(charm.support.status, JSON.stringify(charm.support)).toBe('supported');
const gideon = importCard(fromGoldenCard(planeswalkerCard), undefined, NO_OVERRIDES);

test("Archenemy's Charm returns one target creature card from its controller's graveyard", () => {
  const g = scenario()
    .define(charm.definition)
    .seat(0)
    .hand(charm.definition.name)
    .battlefield('Swamp', 'Swamp', 'Swamp')
    .graveyard('Grizzly Bears')
    .build();

  g.act(0).cast(charm.definition.name, {
    modes: [1],
    targets: ['Grizzly Bears'],
    pay: true,
  });
  resolve(g);

  g.expect.zone('Grizzly Bears', 'hand');
  g.expect.invariants();
});

test("Archenemy's Charm accepts creature and planeswalker cards in the same target slot", () => {
  const g = scenario()
    .define(charm.definition)
    .define(gideon.definition)
    .seat(0)
    .hand(charm.definition.name)
    .battlefield('Swamp', 'Swamp', 'Swamp')
    .graveyard('Grizzly Bears', 'Gideon Jura')
    .build();

  g.act(0).cast(charm.definition.name, {
    modes: [1],
    targets: ['Grizzly Bears', 'Gideon Jura'],
    pay: true,
  });
  resolve(g);

  g.expect.zone('Grizzly Bears', 'hand');
  g.expect.zone('Gideon Jura', 'hand');
  g.expect.invariants();
});

function resolve(g: ScenarioGame): void {
  g.pass();
  g.pass();
}
