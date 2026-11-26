// Flint deck (issue 685), group 3: the riders of a permission to play exiled cards, read from the real Oracle text (fixtures/corpus/golden.jsonl) with no override and played through
// applyAction on three seats. Bloodsoaked Insight: "This spell costs {1} less to cast for each 1 life your opponents have lost this turn" (CR 119.3, 102.2, 601.2f: every opponent's loss
// is added up; hybrid symbols are not reduced) and "If you cast a spell this way, mana of any type can be spent to cast it" (CR 609.4b). Inside Information: "If you cast a spell this way,
// pay life equal to its mana value rather than pay its mana cost" (CR 118.9, 119.4). The spell cast from exile is the real Llanowar Elves, {G}.
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

const INSIGHT = real('Bloodsoaked Insight // Sanguine Morass');
const INSIDE = real('Inside Information');
const BOLT = 'Lightning Bolt';
const ELVES = 'Llanowar Elves'; // {G}
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains'] as const;

describe('Bloodsoaked Insight (CR 119.3, 102.2, 601.2f, 609.4b)', () => {
  test('is valid and reads its cost reduction as the life every opponent lost', () => {
    expect(validateCard(INSIGHT)).toEqual([]);
    expect(INSIGHT.faces[0]?.abilities[0]).toMatchObject({
      kind: 'static',
      static: {
        kind: 'costReduction',
        spells: { kind: 'this' },
        amount: { kind: 'opponentsLifeLostThisTurn' },
      },
    });
  });

  const table = () =>
    scenario({ seats: 3 })
      .define(INSIGHT)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .hand(INSIGHT.name, BOLT, BOLT)
      .pool('RRRBB')
      .seat(1)
      .life(20)
      .library(ELVES, 'Forest', 'Forest', ...FILLER)
      .seat(2)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  const bolt = (g: ScenarioGame, seat: 1 | 2) => {
    g.act(0)
      .cast(`${BOLT}[0]`)
      .targets([{ player: seat }])
      .pay();
    g.passAll();
  };

  test('without life lost it costs seven, which two black mana do not pay', () => {
    const g = table();
    g.expect.illegal(0, { cast: INSIGHT.name });
  });

  test('both opponents’ losses are added: 3 + 3 less leaves the two hybrid symbols', () => {
    const g = table();
    bolt(g, 1);
    bolt(g, 2);
    g.expect.life(1, 17);
    g.expect.life(2, 17);
    g.act(0)
      .cast(INSIGHT.name)
      .targets([{ player: 1 }])
      .pay();
    g.passAll();
    g.expect.zone(INSIGHT.name, 'graveyard', { seat: 0 });
  });

  test('the cards exiled can be played, and a spell cast from them is paid with mana of any type', () => {
    const g = table();
    bolt(g, 1);
    bolt(g, 2);
    g.act(0)
      .cast(INSIGHT.name)
      .targets([{ player: 1 }])
      .pay();
    g.passAll();
    g.expect.zone(ELVES, 'exile', { seat: 1 });
    // {G} paid with the red mana left in the pool.
    g.act(0).cast({ name: ELVES, seat: 1, zone: 'exile' }, { pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
  });
});

describe('Inside Information (CR 118.9, 119.4, 601.2f)', () => {
  test('is valid', () => {
    expect(validateCard(INSIDE)).toEqual([]);
  });

  const table = () =>
    scenario({ seats: 3 })
      .define(INSIDE)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .hand(INSIDE.name)
      .pool('BBB')
      .seat(1)
      .life(20)
      .library(ELVES, ...FILLER)
      .seat(2)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('X=1: the top card of the opponent’s library is cast for life equal to its mana value', () => {
    const g = table();
    g.act(0)
      .cast(INSIDE.name, { x: 1 })
      .targets([{ player: 1 }])
      .pay();
    g.passAll();
    g.expect.zone(ELVES, 'exile', { seat: 1 });
    // The mana cost is not paid: with no mana in the pool, the only way is the life.
    g.expect.illegal(0, { cast: { name: ELVES, seat: 1, zone: 'exile' } });
    g.act(0).cast(
      { name: ELVES, seat: 1, zone: 'exile' },
      { alternative: 'lifeForMana', pay: true },
    );
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.expect.life(0, 19);
  });
});

// Outrageous Robbery: "Target opponent exiles the top X cards of their library face down. You may look at and play those cards for as long as they remain exiled. If you cast a spell
// this way, you may spend mana as though it were mana of any type to cast it." (CR 406.3, 609.4b). The opponent exiles their own cards, face down, which the controller may look at.
describe('Outrageous Robbery (CR 406.3, 609.4b)', () => {
  const ROBBERY = real('Outrageous Robbery');

  test('is valid', () => {
    expect(validateCard(ROBBERY)).toEqual([]);
  });

  const table = () =>
    scenario({ seats: 3 })
      .define(ROBBERY)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .hand(ROBBERY.name)
      .pool('BBRRR')
      .seat(1)
      .life(20)
      .library(ELVES, 'Forest', 'Forest', ...FILLER)
      .seat(2)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('X=2 exiles two cards of the opponent’s library face down; a spell cast from them takes any mana', () => {
    const g = table();
    g.act(0)
      .cast(ROBBERY.name, { x: 2 })
      .targets([{ player: 1 }])
      .pay();
    g.passAll();
    g.expect.zone(ELVES, 'exile', { seat: 1 });
    // {G} is paid with red mana: any type of mana can be spent on the spell.
    g.act(0).cast({ name: ELVES, seat: 1, zone: 'exile' }, { pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
  });

  test('the cards stay playable on a later turn: nothing but leaving exile ends the permission', () => {
    const g = table();
    g.act(0)
      .cast(ROBBERY.name, { x: 2 })
      .targets([{ player: 1 }])
      .pay();
    g.passAll();
    for (let i = 0; i < 3; i += 1) g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.zone('Forest', 'exile', { seat: 1, count: 1 });
    g.act(0).playLand({ name: 'Forest', seat: 1, zone: 'exile', nth: 0 });
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
  });
});
