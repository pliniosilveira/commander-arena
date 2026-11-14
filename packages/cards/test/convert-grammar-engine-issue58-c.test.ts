import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const NAMES = [
  'Culling Ritual',
  'Deadly Brew',
  'Final Act',
  'Witch of the Moors',
  'Witherbloom Charm',
  'Witherbloom Command',
];

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`Missing corpus card ${name}`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const BEAR = parsed('SYNTHETIC Bear C', 'Creature — Bear', '', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
});
const IMMORTAL = parsed('SYNTHETIC Immortal C', 'Creature — Bear', 'Indestructible', {
  manaCost: '{G}',
  power: '2',
  toughness: '2',
});

describe('issue58 group C real imports', () => {
  test.each(NAMES)('%s reads entirely and validates', (name) => {
    expect(validateCard(real(name))).toEqual([]);
  });

  test('Culling Ritual counts destruction, not indestructible permanents, and chooses each mana separately', () => {
    const ritual = real('Culling Ritual');
    const g = scenario()
      .define(ritual)
      .define(BEAR)
      .define(IMMORTAL)
      .seat(0)
      .hand(ritual.name)
      .battlefield('Swamp', 'Forest', 'Plains', 'Plains', BEAR.name, IMMORTAL.name)
      .seat(1)
      .battlefield(BEAR.name)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(ritual.name, { pay: true });
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'chooseOption', options: ['{B}', '{G}'] });
    g.act(0).chooseOption('{B}');
    g.act(0).chooseOption('{G}');
    expect(g.state.seats[0]?.manaPool.map((m) => m.color)).toEqual(['B', 'G']);
    g.expect.battlefield(IMMORTAL.name);
    g.expect.invariants();
  });
});
