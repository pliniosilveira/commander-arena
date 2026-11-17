import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const card = cards.find(({ name }) => name === 'March of Swirling Mist');
if (card === undefined) throw new Error('March of Swirling Mist is not in the golden corpus');

const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
expect(imported.support.status, JSON.stringify(imported.support)).toBe('supported');
expect(imported.support.unparsed).toEqual([]);
const MARCH: CardDefinition = imported.definition;

describe('March of Swirling Mist', () => {
  test('exiles the chosen blue card, reduces the generic cost, and phases out up to X targets', () => {
    const g = scenario()
      .define(MARCH)
      .seat(0)
      .hand(MARCH.name, 'SYNTHETIC Frost Touch')
      .battlefield('Island', 'Island', 'Island')
      .seat(1)
      .battlefield('Llanowar Elves', 'Grizzly Bears')
      .build();

    g.act(0).cast(MARCH.name);
    expect(g.state.pending).toMatchObject({
      kind: 'chooseCards',
      purpose: 'additionalExile',
      zone: 'hand',
      min: 0,
      max: 1,
    });
    g.act(0).chooseCards('SYNTHETIC Frost Touch');
    g.expect.pending('chooseX', 0);
    g.act(0).chooseX(2);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('Llanowar Elves');
    g.expect.pending('payMana', 0);
    expect(g.state.casting?.totalCost).toEqual(['U']);
    g.act(0).payAuto();

    g.expect.zone('SYNTHETIC Frost Touch', 'exile', { seat: 0 });
    g.passAll();

    g.expect.zone('Llanowar Elves', 'phased');
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('lets the caster decline the optional exile and choose zero targets', () => {
    const g = scenario()
      .define(MARCH)
      .seat(0)
      .hand(MARCH.name, 'SYNTHETIC Frost Touch')
      .battlefield('Island', 'Island', 'Island')
      .seat(1)
      .battlefield('Llanowar Elves')
      .build();

    g.act(0).cast(MARCH.name);
    g.act(0).chooseCards();
    g.act(0).chooseX(0);
    g.expect.pending('payMana', 0);
    expect(g.state.casting?.totalCost).toEqual(['U']);
    g.act(0).payAuto();
    g.expect.zone('SYNTHETIC Frost Touch', 'hand', { seat: 0 });
    g.passAll();

    g.expect.zone('Llanowar Elves', 'battlefield', { seat: 1 });
    g.expect.invariants();
  });
});
