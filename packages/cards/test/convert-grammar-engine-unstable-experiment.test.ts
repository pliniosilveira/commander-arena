// Issue 250: "where is my connives?". Unstable Experiment ("Target player draws a card, then up to one target creature you control connives.") is read from
// the real golden card and played through the engine, to show what the report was: with a creature chosen as the second target it draws and connives
// (CR 701.50a: draw, then discard; a nonland discard puts a +1/+1 counter on the creature); with only the player chosen ("up to one": zero is legal,
// CR 601.2c) it draws and nothing connives.
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const card = cards.find(({ name }) => name === 'Unstable Experiment');
if (card === undefined) throw new Error('Unstable Experiment is not in the golden corpus');
const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
expect(imported.support.status, JSON.stringify(imported.support)).toBe('supported');
const EXPERIMENT: CardDefinition = imported.definition;

const setup = () =>
  scenario()
    .define(EXPERIMENT)
    .seat(0)
    .hand(EXPERIMENT.name, 'Lightning Bolt')
    .battlefield('Island', 'Island', 'Grizzly Bears')
    .library('Plains', 'Plains', 'Plains', 'Plains')
    .seat(1)
    .library('Plains', 'Plains', 'Plains', 'Plains')
    .at('precombatMain')
    .build();

const bearsCounters = (g: ReturnType<typeof setup>) =>
  getView(g.state, 0).battlefield.find((o) => o.name === 'Grizzly Bears')?.counters;

describe('Unstable Experiment (issue 250)', () => {
  test('with a creature chosen: the controller draws, discards, and a nonland discard puts a +1/+1 counter on it', () => {
    const g = setup();
    g.act(0).cast(EXPERIMENT.name, {
      targets: [{ player: 0 }, { name: 'Grizzly Bears', seat: 0 }],
      pay: true,
    });
    g.passAll();
    expect(g.state.pending?.kind).toBe('chooseCards');
    g.act(0).chooseCards({ name: 'Lightning Bolt', zone: 'hand', nth: 0 });
    expect(bearsCounters(g)).toEqual({ '+1/+1': 1 });
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('with only the player chosen ("up to one" creature, none picked): the player draws and nothing connives', () => {
    const g = setup();
    g.act(0).cast(EXPERIMENT.name, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    expect(bearsCounters(g)).toEqual({});
    g.expect.invariants();
  });
});
