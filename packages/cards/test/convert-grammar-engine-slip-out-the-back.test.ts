import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((candidate) => candidate.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const CARD = real('Slip Out the Back');
const BEAR = parsed('SYNTHETIC Bear', 'Creature — Bear', '', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
});
const FILLER = Array.from({ length: 30 }, () => 'Island');

describe('Slip Out the Back', () => {
  test('puts a +1/+1 counter on the target and phases it out', () => {
    const g = scenario()
      .define(CARD)
      .define(BEAR)
      .seat(0)
      .hand(CARD.name)
      .battlefield('Island')
      .library(...FILLER)
      .seat(1)
      .battlefield(BEAR.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

    g.act(0).cast(CARD.name, { pay: true, targets: [BEAR.name] });
    g.passAll();

    const view = getView(g.state, 0);
    expect(view.phasedOut?.map((object) => object.name)).toContain(BEAR.name);
    expect(view.phasedOut?.find((object) => object.name === BEAR.name)?.counters).toEqual({
      '+1/+1': 1,
    });
    g.expect.invariants();
  });
});
