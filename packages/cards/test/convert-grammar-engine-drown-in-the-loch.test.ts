import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const card = cards.find(({ name }) => name === 'Drown in the Loch');
if (card === undefined) throw new Error('Drown in the Loch is not in the golden corpus');

const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
expect(imported.support.status, JSON.stringify(imported.support)).toBe('supported');
expect(imported.support.unparsed).toEqual([]);
const DROWN: CardDefinition = imported.definition;

describe('Drown in the Loch', () => {
  test("destroys a creature when its mana value is at most its controller's graveyard count", () => {
    const g = scenario()
      .define(DROWN)
      .seat(0)
      .hand(DROWN.name)
      .battlefield('Island', 'Island', 'Swamp', 'Swamp')
      .seat(1)
      .battlefield('Llanowar Elves')
      .graveyard('Island')
      .build();

    g.act(0).cast(DROWN.name, {
      modes: [1],
      targets: [{ name: 'Llanowar Elves', seat: 1 }],
      pay: true,
    });
    g.passAll();

    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test("counters a spell when its mana value is at most its controller's graveyard count", () => {
    const g = scenario()
      .define(DROWN)
      .seat(0)
      .hand(DROWN.name)
      .battlefield('Island', 'Island', 'Swamp', 'Swamp')
      .seat(1)
      .hand('Grizzly Bears')
      .battlefield('Forest', 'Forest')
      .graveyard('Island', 'Swamp')
      .at('precombatMain', { active: 1, turn: 1 })
      .build();

    g.act(1).cast('Grizzly Bears', { pay: true });
    g.act(1).pass();
    g.act(0).cast(DROWN.name, {
      modes: [0],
      targets: [{ name: 'Grizzly Bears', zone: 'stack', seat: 1 }],
      pay: true,
    });
    g.passAll();

    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test("does not offer a creature target whose mana value exceeds its controller's graveyard count", () => {
    const g = scenario()
      .define(DROWN)
      .seat(0)
      .hand(DROWN.name)
      .battlefield('Island', 'Swamp')
      .seat(1)
      .battlefield('Llanowar Elves')
      .build();

    g.expect.illegal(0, { cast: DROWN.name });
    g.expect.invariants();
  });
});
