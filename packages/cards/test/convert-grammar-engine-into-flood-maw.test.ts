import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const card = cards.find(({ name }) => name === 'Into the Flood Maw');
if (card === undefined) throw new Error('Into the Flood Maw is not in the golden corpus');

const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
expect(imported.support.status, JSON.stringify(imported.support)).toBe('supported');
expect(imported.support.unparsed).toEqual([]);
const MAW: CardDefinition = imported.definition;

describe('Into the Flood Maw', () => {
  test('a promised gift creates a tapped Fish for the chosen opponent before the bounce', () => {
    const g = scenario()
      .define(MAW)
      .seat(0)
      .hand(MAW.name)
      .battlefield('Island')
      .seat(1)
      .battlefield('Sol Ring')
      .at('precombatMain')
      .build();

    g.act(0).cast(MAW.name, { gift: true, targets: ['Sol Ring'], pay: true });
    g.passAll();

    g.expect.zone('Fish', 'battlefield', { seat: 1 });
    g.expect.tapped('Fish');
    g.expect.zone('Sol Ring', 'hand', { seat: 1 });
    g.expect.invariants();
  });

  test('without a promised gift, a creature is returned and no Fish is created', () => {
    const g = scenario()
      .define(MAW)
      .seat(0)
      .hand(MAW.name)
      .battlefield('Island')
      .seat(1)
      .battlefield('Grizzly Bears')
      .at('precombatMain')
      .build();

    g.act(0).cast(MAW.name, { gift: false, targets: ['Grizzly Bears'], pay: true });
    g.passAll();

    g.expect.zone('Grizzly Bears', 'hand', { seat: 1 });
    expect(g.view(1).battlefield.some((object) => object.name === 'Fish')).toBe(false);
    g.expect.invariants();
  });
});
