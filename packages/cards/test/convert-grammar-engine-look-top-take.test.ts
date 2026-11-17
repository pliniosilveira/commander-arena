import { readFileSync } from 'node:fs';
import { getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const imported = (name: string) => {
  const card = cards.find((candidate) => candidate.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card as GoldenCard), undefined, NO_OVERRIDES);
};

const diabolic = imported('Diabolic Vision');
const sleight = imported('Sleight of Hand');

describe('look at the top, take one, and put the rest on top or bottom', () => {
  test.each([diabolic, sleight])('%s is read completely', (card) => {
    expect(card.support.status).toBe('supported');
    expect(card.support.unparsed).toEqual([]);
    expect(card.support.reasons).toEqual([]);
  });

  test('Diabolic Vision takes one card without revealing it and orders the rest on top', () => {
    expect(diabolic.definition.faces[0]?.spell?.effect).toEqual({
      kind: 'lookAtTop',
      count: 5,
      take: { filter: {}, max: 1, min: 1, hidden: true },
      rest: 'topChosen',
    });

    const g = scenario()
      .define(diabolic.definition)
      .seat(0)
      .hand(diabolic.definition.name)
      .library('Grizzly Bears', { label: 'a' })
      .library('Giant Spider', { label: 'b' })
      .library('Serra Angel', { label: 'c' })
      .library('Island', { label: 'd' })
      .library('Sol Ring', { label: 'e' })
      .battlefield('Island', 'Swamp')
      .seat(1)
      .library('Island', 'Swamp')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

    g.act(0).cast(diabolic.definition.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('c');
    g.expect.zone('Serra Angel', 'hand', { seat: 0 });
    g.expect.pending('arrangeCards', 0);
    expect(getView(g.state, 0).pendingCards?.map((object) => object.name)).toEqual([
      'Grizzly Bears',
      'Giant Spider',
      'Island',
      'Sol Ring',
    ]);
    g.act(0).arrange({ top: ['e', 'a', 'd', 'b'], other: [] });
    expect(g.state.seats[0]?.library).toEqual(['e', 'a', 'd', 'b'].map((label) => g.id(label)));
  });

  test('Sleight of Hand takes one card and puts the other on the bottom', () => {
    expect(sleight.definition.faces[0]?.spell?.effect).toEqual({
      kind: 'lookAtTop',
      count: 2,
      take: { filter: {}, max: 1, min: 1, hidden: true },
      rest: 'bottomRandom',
    });

    const g = scenario()
      .define(sleight.definition)
      .seat(0)
      .hand(sleight.definition.name)
      .library('Grizzly Bears', { label: 'a' })
      .library('Giant Spider', { label: 'b' })
      .library('Island', { label: 'c' })
      .battlefield('Island')
      .seat(1)
      .library('Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

    g.act(0).cast(sleight.definition.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('a');
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    expect(g.state.seats[0]?.library).toEqual([g.id('c'), g.id('b')]);
  });
});
