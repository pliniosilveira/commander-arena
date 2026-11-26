// Flint deck (issue 685), group 15: The Ruinous Powers, read from its REAL Oracle text (fixtures/corpus/golden.jsonl) with no override and played through applyAction on three seats.
// "At the beginning of your upkeep, choose an opponent at random. Exile the top card of that player's library. Until end of turn, you may play that card and you may spend mana as though it
// were mana of any color to cast it. When you cast a spell this way, its owner loses life equal to its mana value." (CR 101.4, 701.13, 601.2, 609.4b, 603.7, 119.3, 202.3): one of the two
// opponents is picked by the seeded generator; the owner of the card, not the caster, loses the life.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const POWERS = real('The Ruinous Powers');
const BEARS = 'Grizzly Bears'; // {1}{G}, mana value 2
const FILLER = ['Plains', 'Plains', 'Plains'] as const;

describe('The Ruinous Powers (CR 101.4, 701.13, 603.7, 119.3)', () => {
  test('is valid', () => {
    expect(validateCard(POWERS)).toEqual([]);
  });

  const start = (seed?: number) => {
    const b = scenario({ seats: 3 })
      .define(POWERS)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .battlefield(POWERS.name, 'Mountain', 'Mountain')
      .seat(1)
      .life(20)
      .library(BEARS, ...FILLER)
      .seat(2)
      .life(20)
      .library(BEARS, ...FILLER)
      .at('end', { active: 2, turn: 2 });
    return (seed === undefined ? b : b.seed(seed)).build();
  };

  const upkeep = (g: ScenarioGame) => {
    g.advanceTo('upkeep', { turn: 3 });
    g.passAll();
    g.advanceTo('precombatMain');
  };

  const exiledFrom = (g: ScenarioGame) =>
    [1, 2].filter((s) => g.find({ name: BEARS, zone: 'exile', seat: s as 1 | 2 }).length > 0);

  test('exactly one opponent has their top card exiled', () => {
    const g = start();
    upkeep(g);
    expect(exiledFrom(g)).toHaveLength(1);
  });

  test('casting it takes life from its owner (2), not from the caster, and the other opponent loses none', () => {
    const g = start();
    upkeep(g);
    const [owner] = exiledFrom(g);
    expect(owner).toBeDefined();
    const seat = owner as 1 | 2;
    // {1}{G} paid with the two Mountains: any color of mana can be spent.
    g.act(0).cast({ name: BEARS, seat, zone: 'exile' }, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.life(seat, 18);
    g.expect.life(seat === 1 ? 2 : 1, 20);
    g.expect.life(0, 20);
  });

  test('the same seed picks the same opponent (the generator is the game’s)', () => {
    const a = start(7);
    const b = start(7);
    upkeep(a);
    upkeep(b);
    expect(exiledFrom(a)).toEqual(exiledFrom(b));
  });
});
