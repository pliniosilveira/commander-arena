// The Aetherdrift energy deck (issue 105), group 1: "Pay {E}" as the cost of an activated ability and of a mana ability (CR 107.14, 118.3, 605.3). REAL cards of the golden corpus
// read through the grammar only (no override), defined in an engine scenario and played through applyAction.
import { readFileSync } from 'node:fs';
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const real = (name: string) => {
  const golden = cards.find((c) => c.name === name);
  if (golden === undefined) throw new Error(`${name} is not in the golden corpus`);
  return { golden, card: importCard(fromGoldenCard(golden), undefined, NO_OVERRIDES) };
};

const HUB = real('Aether Hub');
const SERVANT = real('Servant of the Conduit');
const SOLAR = real('Solar Transformer');
const WHIRLER = real('Whirler Virtuoso');
const ERA = real('Era of Innovation');
const ANCIENT = real('Aethersquall Ancient');
const ARCHITECT = real('Architect of the Untamed');
const BATTLEWAGON = real('Bespoke Battlewagon');

describe('the cards read', () => {
  test.each([HUB, SERVANT, SOLAR, WHIRLER, ERA, ANCIENT, ARCHITECT, BATTLEWAGON])(
    '$golden.name: supported, nothing left unparsed, validateCard is clean',
    ({ card }) => {
      expect(card.support.status).toBe('supported');
      expect(card.support.unparsed).toEqual([]);
      expect(validateCard(card.definition)).toEqual([]);
    },
  );

  test('Aether Hub is a mana ability that taps and pays one energy', () => {
    const mana = HUB.card.definition.faces[0]?.abilities.find(
      (a) => a.kind === 'mana' && a.cost.some((c) => c.kind === 'energy'),
    );
    expect(mana).toMatchObject({
      kind: 'mana',
      cost: [{ kind: 'tap' }, { kind: 'energy', count: 1 }],
      production: { kind: 'anyColor' },
    });
  });

  test('Era of Innovation pays six energy and sacrifices itself, Aethersquall Ancient eight', () => {
    const era = ERA.card.definition.faces[0]?.abilities.find((a) => a.kind === 'activated');
    expect(era).toMatchObject({
      cost: [{ kind: 'energy', count: 6 }, { kind: 'sacrifice' }],
    });
    const ancient = ANCIENT.card.definition.faces[0]?.abilities.find((a) => a.kind === 'activated');
    expect(ancient).toMatchObject({ cost: [{ kind: 'energy', count: 8 }] });
  });
});

describe('played in a game', () => {
  test('Servant of the Conduit taps, pays one energy and adds one mana of any color', () => {
    const g = scenario()
      .define(SERVANT.card.definition)
      .seat(0)
      .energy(2)
      .battlefield('Servant of the Conduit')
      .build();
    g.act(0).tapForMana('Servant of the Conduit', { color: 'G' });
    g.expect.pool(0, 'G');
    g.expect.energy(0, 1);
  });

  test('Solar Transformer cannot make colored mana without energy', () => {
    const g = scenario()
      .define(SOLAR.card.definition)
      .seat(0)
      .battlefield('Solar Transformer')
      .build();
    // Its {T}: Add {C} ability is still there; only the any-color one is out of reach.
    expect(g.act(0).try.tapForMana('Solar Transformer', { color: 'G' }).ok).toBe(false);
  });

  test('Whirler Virtuoso pays three energy for a 1/1 flying Thopter, and not with two', () => {
    const def = WHIRLER.card.definition;
    const poor = scenario().define(def).seat(0).energy(2).battlefield(def.name).build();
    poor.expect.illegal(0, { activate: def.name });
    const g = scenario().define(def).seat(0).energy(4).battlefield(def.name).build();
    g.act(0).activate(def.name);
    g.expect.energy(0, 1);
    g.passAll();
    g.expect.zone('Thopter', 'battlefield', { seat: 0 });
  });

  test('Era of Innovation pays six energy and sacrifices itself to draw three', () => {
    const def = ERA.card.definition;
    const g = scenario()
      .define(def)
      .seat(0)
      .energy(6)
      .battlefield(def.name)
      .library('Island', 'Island', 'Island', 'Island')
      .build();
    g.act(0).activate(def.name);
    g.expect.energy(0, 0);
    g.passAll();
    g.expect.handSize(0, 3);
    g.expect.zone(def.name, 'graveyard', { seat: 0 });
  });
});
