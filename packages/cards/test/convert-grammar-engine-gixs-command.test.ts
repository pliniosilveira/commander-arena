import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const card = cards.find(({ name }) => name === "Gix's Command");
if (card === undefined) throw new Error("Gix's Command is not in the golden corpus");

const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
expect(imported.support.status, JSON.stringify(imported.support)).toBe('supported');
expect(imported.support.unparsed).toEqual([]);
const COMMAND: CardDefinition = imported.definition;

describe("Gix's Command", () => {
  test('the counter mode chooses up to one creature and returns up to two creature cards', () => {
    const g = scenario()
      .define(COMMAND)
      .seat(0)
      .hand(COMMAND.name)
      .battlefield('Swamp', { count: 5 })
      .battlefield('Grizzly Bears', 'Serra Angel')
      .graveyard('Grizzly Bears', 'Serra Angel')
      .seat(1)
      .build();

    g.act(0).cast(COMMAND.name, { modes: [0, 2], pay: true });
    g.passAll();
    g.act(0).choosePermanents('Grizzly Bears');
    g.act(0).chooseCards('Grizzly Bears', 'Serra Angel');
    g.passAll();

    g.expect.counters({ name: 'Grizzly Bears', zone: 'battlefield', seat: 0 }, { '+1/+1': 2 });
    g.expect.derived(
      { name: 'Grizzly Bears', zone: 'battlefield', seat: 0 },
      { keywords: ['lifelink'] },
    );
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    g.expect.zone('Serra Angel', 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('the optional creature choice may select none', () => {
    const g = scenario()
      .define(COMMAND)
      .seat(0)
      .hand(COMMAND.name)
      .battlefield('Swamp', { count: 5 })
      .battlefield('Grizzly Bears')
      .seat(1)
      .build();

    g.act(0).cast(COMMAND.name, { modes: [0, 2], pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.passAll();

    g.expect.counters('Grizzly Bears', {});
    g.expect.derived('Grizzly Bears', { keywords: [] });
    g.expect.invariants();
  });

  test('the two selected modes destroy small creatures and make each opponent sacrifice a greatest-power creature', () => {
    const g = scenario()
      .define(COMMAND)
      .seat(0)
      .hand(COMMAND.name)
      .battlefield('Swamp', { count: 5 })
      .battlefield('Grizzly Bears')
      .seat(1)
      .battlefield('Serra Angel', 'Grizzly Bears')
      .at('precombatMain')
      .build();

    g.act(0).cast(COMMAND.name, { modes: [1, 3], pay: true });
    g.passAll();

    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Serra Angel', 'graveyard', { seat: 1 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.invariants();
  });
});
