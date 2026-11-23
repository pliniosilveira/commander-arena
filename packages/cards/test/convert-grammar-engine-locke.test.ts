// Locke, Treasure Hunter (Revival Trance deck, issue 97): the REAL Oracle text of the golden corpus goes through the grammar as a card with no override, is defined in an engine
// scenario and is played through applyAction. "Mug — Whenever Locke attacks, each player mills a card. If a land card was milled this way, create a Treasure token. Until end of
// turn, you may cast a spell from among those cards."
// Pins: CR 701.17a (mill), 608.2c ("this way" reads what the instruction before it did, every player's card), CR 111.10 (Treasure), CR 601.2, 611.2a (a permission to cast a card
// from any graveyard, whoever owns it) and CR 608.2 (one spell from among the cards, not one for each).
import { readFileSync } from 'node:fs';
import { type CardDefinition, type SeatId, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

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

const LOCKE = real('Locke, Treasure Hunter');

test('the card is valid', () => {
  expect(validateCard(LOCKE)).toEqual([]);
});

// SYNTHETIC cards: lines with the name replaced by ~, castable in the declare attackers step (an instant) or not (a creature).
const BOLT = parsed('SYNTHETIC Mug Bolt', 'Instant', '~ deals 1 damage to each opponent.', {
  manaCost: '{R}',
  colors: ['R'],
});
const GLEAM = parsed('SYNTHETIC Mug Gleam', 'Instant', 'You gain 1 life.', {
  manaCost: '{B}',
  colors: ['B'],
});
const OGRE = parsed('SYNTHETIC Mug Ogre', 'Creature — Ogre', '', {
  manaCost: '{B}',
  power: '1',
  toughness: '1',
  colors: ['B'],
});

/** Locke attacks seat 1; each name is the top card of that seat's library (a third name adds a third player). */
function mug(...tops: readonly string[]): ScenarioGame {
  let b = scenario({ seats: Math.max(2, tops.length) })
    .define(LOCKE)
    .define(BOLT)
    .define(GLEAM)
    .define(OGRE)
    .seat(0)
    .library(tops[0] ?? 'Plains', 'Plains', 'Plains', 'Plains')
    .battlefield(LOCKE.name, 'Mountain', 'Mountain', 'Swamp', 'Swamp')
    .seat(1)
    .life(20)
    .library(tops[1] ?? 'Plains', 'Plains', 'Plains', 'Plains');
  if (tops.length > 2) b = b.seat(2).library(tops[2] ?? 'Plains', 'Plains', 'Plains');
  const g = b.seat(0).at('precombatMain', { active: 0, turn: 3 }).build();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).attack([LOCKE.name], { player: 1 });
  g.passAll();
  return g;
}

/** The ids of the cards in graveyards that seat 0 could cast now. */
function castable(g: ScenarioGame): string[] {
  const ids: string[] = [];
  for (const a of g.legalActions(0)) {
    if (a.kind === 'castSpell' && g.state.objects[a.object]?.zone === 'graveyard') {
      ids.push(a.object);
    }
  }
  return ids.sort();
}

/** The ids of the cards named, each in the graveyard of the seat given. */
function yard(g: ScenarioGame, ...cards: readonly (readonly [string, SeatId])[]): string[] {
  return cards.map(([name, seat]) => g.object({ name, zone: 'graveyard', seat }).id).sort();
}

describe('Mug: each player mills a card (CR 701.17a)', () => {
  test('every player mills one card', () => {
    const g = mug('Plains', 'Forest', 'Island');
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.expect.zone('Forest', 'graveyard', { seat: 1 });
    g.expect.zone('Island', 'graveyard', { seat: 2 });
    g.expect.invariants();
  });
});

describe('"If a land card was milled this way, create a Treasure token." (CR 608.2c, 111.10)', () => {
  test('a land milled by an opponent creates a Treasure', () => {
    expect(mug(BOLT.name, 'Forest').find({ name: 'Treasure' })).toHaveLength(1);
  });

  test('your own land counts too', () => {
    expect(mug('Forest', BOLT.name).find({ name: 'Treasure' })).toHaveLength(1);
  });

  test('a land milled by the third player counts', () => {
    expect(mug(BOLT.name, GLEAM.name, 'Forest').find({ name: 'Treasure' })).toHaveLength(1);
  });

  test('no land milled: no Treasure', () => {
    expect(mug(BOLT.name, GLEAM.name).find({ name: 'Treasure' })).toHaveLength(0);
  });
});

describe('"Until end of turn, you may cast a spell from among those cards." (CR 601.2, 611.2a)', () => {
  test('a spell milled by an opponent may be cast by you', () => {
    const g = mug('Forest', BOLT.name);
    expect(castable(g)).toEqual(yard(g, [BOLT.name, 1]));
    g.act(0).cast({ name: BOLT.name, zone: 'graveyard', seat: 1 }, { pay: true });
    g.passAll();
    g.expect.life(1, 19);
    g.expect.invariants();
  });

  test('your own milled spell may be cast too', () => {
    const g = mug(BOLT.name, 'Forest');
    expect(castable(g)).toEqual(yard(g, [BOLT.name, 0]));
  });

  test('it is one spell for all the cards: casting one ends the permission for the others', () => {
    const g = mug(GLEAM.name, BOLT.name);
    expect(castable(g)).toEqual(yard(g, [GLEAM.name, 0], [BOLT.name, 1]));
    g.act(0).cast({ name: BOLT.name, zone: 'graveyard', seat: 1 }, { pay: true });
    g.passAll();
    expect(castable(g)).toEqual([]);
    g.expect.zone(GLEAM.name, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('a card of the third player may be cast, and the others then may not', () => {
    const g = mug(GLEAM.name, 'Forest', BOLT.name);
    expect(castable(g)).toEqual(yard(g, [GLEAM.name, 0], [BOLT.name, 2]));
    g.act(0).cast({ name: BOLT.name, zone: 'graveyard', seat: 2 }, { pay: true });
    g.passAll();
    expect(castable(g)).toEqual([]);
  });

  test('a land card is no spell: only lands milled, nothing to cast or play', () => {
    const g = mug('Forest', 'Island');
    expect(castable(g)).toEqual([]);
    expect(g.legalActions(0).some((a) => a.kind === 'playLand')).toBe(false);
  });

  test('the spell is cast at its own timing: a creature cannot be cast during combat', () => {
    const g = mug(OGRE.name, 'Forest');
    expect(castable(g)).toEqual([]);
  });

  test('the permission lasts this turn only', () => {
    const g = mug('Forest', BOLT.name);
    g.advanceTo('precombatMain', { turn: 5 });
    expect(castable(g)).toEqual([]);
  });
});
