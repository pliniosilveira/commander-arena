// Mirror Entity (the top-5 card ranking): the REAL card of the golden corpus, read through the grammar only and played through applyAction. "{X}: Until end of turn,
// creatures you control have base power and toughness X/X and gain all creature types." is the engine's `setPt` with the X of the ability and `setTypes` with
// `allCreatureTypes`, over the creatures the selector names as the effect begins (CR 613.1d, 613.4b, 611.2c, 107.3a). Stand-ins are the engine's real fixtures.
import { readFileSync } from 'node:fs';
import { type CardDefinition, CREATURE_TYPES } from '@commander-arena/engine';
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

const MIRROR = real('Mirror Entity');
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 30 }, () => 'Island');
const ANGEL = 'Serra Angel';

const game = () =>
  scenario()
    .define(MIRROR)
    .seat(0)
    .battlefield(MIRROR.name, BEARS, 'Plains', 'Plains', 'Plains', 'Plains')
    .seat(1)
    .battlefield(ANGEL)
    .build();

describe('Mirror Entity', () => {
  test('reads as changeling and an activated ability with {X}', () => {
    const kinds = MIRROR.faces[0]?.abilities?.map((a) => a.kind) ?? [];
    expect(kinds).toEqual(['keyword', 'activated']);
  });

  test('X = 3: my creatures are 3/3 until end of turn, the opponent’s is not touched', () => {
    const g = game();
    g.act(0).activate(MIRROR.name, { x: 3, pay: true });
    g.passAll();
    g.expect.pt(MIRROR.name, 3, 3);
    g.expect.pt(BEARS, 3, 3);
    g.expect.pt(ANGEL, 4, 4);
  });

  test('X = 4: they have every creature type; the opponent’s Angel keeps its own', () => {
    const g = game();
    g.act(0).activate(MIRROR.name, { x: 4, pay: true });
    g.passAll();
    g.expect.derived(BEARS, { subtypes: [...new Set([...CREATURE_TYPES, 'Bear'])] });
    g.expect.derived(ANGEL, { subtypes: ['Angel'] });
  });

  test('it ends with the turn', () => {
    const g = scenario()
      .define(MIRROR)
      .seat(0)
      .battlefield(MIRROR.name, BEARS, 'Plains', 'Plains', 'Plains', 'Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).activate(MIRROR.name, { x: 3, pay: true });
    g.passAll();
    g.expect.pt(BEARS, 3, 3);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt(MIRROR.name, 1, 1);
  });
});
