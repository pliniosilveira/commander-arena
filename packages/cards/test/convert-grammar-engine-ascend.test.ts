// Arch of Orazca (the Bruna deck, issue 5, D-264): the REAL card of the owner's golden corpus, read through the grammar only and played through applyAction. Ascend
// gives the city's blessing at ten permanents; "{5}, {T}: Draw a card. Activate only if you have the city's blessing." asks for it. Stand-ins are SYNTHETIC (named so).
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const ARCH = real('Arch of Orazca');
const FILLER = Array.from({ length: 30 }, () => 'Island');

describe('Arch of Orazca', () => {
  test('reads as Ascend, a mana ability and a restricted draw', () => {
    const abilities = ARCH.faces[0]?.abilities ?? [];
    expect(abilities.map((a) => a.kind)).toEqual(['keyword', 'mana', 'activated']);
    expect(abilities[0]).toEqual({ kind: 'keyword', keyword: { kind: 'ascend' } });
  });

  test('with nine other permanents it gets the blessing; with eight it does not', () => {
    const nine = scenario()
      .define(ARCH)
      .seat(0)
      .hand(ARCH.name)
      .battlefield('Forest', { count: 9 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    nine.act(0).playLand(ARCH.name);
    nine.expect.citysBlessing(0, true);

    const eight = scenario()
      .define(ARCH)
      .seat(0)
      .hand(ARCH.name)
      .battlefield('Forest', { count: 8 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    eight.act(0).playLand(ARCH.name);
    eight.expect.citysBlessing(0, false);
  });

  test('the draw is illegal without the blessing and works with it; the tap makes {C} either way', () => {
    const without = scenario()
      .define(ARCH)
      .seat(0)
      .battlefield(ARCH.name)
      .battlefield('Forest', { count: 5 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    without.expect.illegal(0, { activate: ARCH.name });
    without.act(0).tapForMana(ARCH.name);
    without.expect.pool(0, 'C');

    const withBlessing = scenario()
      .define(ARCH)
      .seat(0)
      .citysBlessing()
      .battlefield(ARCH.name)
      .battlefield('Forest', { count: 5 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    withBlessing.expect.legal(0, { activate: ARCH.name });
    withBlessing.act(0).activate(ARCH.name).pay();
    withBlessing.passAll();
    withBlessing.expect.handSize(0, 1);
    withBlessing.expect.invariants();
  });
});
