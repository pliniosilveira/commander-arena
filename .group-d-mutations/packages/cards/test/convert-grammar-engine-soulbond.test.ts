// Soulbond on the REAL card of the owner's golden corpus (D-286, D-284, D-283): Breathkeeper Seraph, read through the grammar only and played through applyAction. The
// stand-in creatures are SYNTHETIC (named so), with invented power and toughness; the card data is the issue author's, as stored in the corpus (not checked against Scryfall).
// Pins: CR 702.95a (the two abilities), 702.95b (a pair), 702.95e (a pair ends), 611.3a (the grant is whatever the pair is), 603.10a (a dies ability looks back, also when both
// creatures die together), 603.7a-c (the delayed return at the next upkeep, once, of the card still in the graveyard).
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

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

const SERAPH = real('Breathkeeper Seraph');
const BEAR = parsed('SYNTHETIC Soul Bear', 'Creature — Bear', '', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
});
const FILLER = Array.from({ length: 30 }, () => 'Island');

/** Seraph in hand (six mana: {4}{W}{W}), a Bear on the battlefield, Bolts and a Murder, and a second Bear in hand for the second ability. */
const game = () =>
  scenario()
    .define(SERAPH)
    .define(BEAR)
    .seat(0)
    .hand(SERAPH.name, 'Lightning Bolt', 'Lightning Bolt', 'Murder')
    .battlefield('Plains', { count: 2 })
    .battlefield('Swamp', { count: 6 })
    .battlefield('Mountain', { count: 3 })
    .battlefield('Forest', { count: 2 })
    .battlefield(BEAR.name, { label: 'bear' })
    .library(...FILLER)
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

function pairThem() {
  const g = game();
  g.act(0).cast(SERAPH.name, { pay: true });
  g.pass();
  g.pass(); // the Seraph enters
  g.pass();
  g.pass(); // its soulbond ability resolves
  g.act(0).choosePermanents('bear');
  return g;
}

describe('Breathkeeper Seraph', () => {
  test('is supported: flying, soulbond and the paired grant of the dies-and-return ability', () => {
    const kinds = SERAPH.faces[0]?.abilities.map((a) => a.kind);
    expect(kinds).toEqual(['keyword', 'keyword', 'static']);
  });

  test('entering with a creature of its controller, it asks which creature to pair with and pairs both (CR 702.95a, 702.95b)', () => {
    const g = pairThem();
    g.expect.paired(SERAPH.name, 'bear');
    g.expect.invariants();
  });

  test('declining the pairing leaves both unpaired (the "may")', () => {
    const g = game();
    g.act(0).cast(SERAPH.name, { pay: true });
    g.pass();
    g.pass();
    g.pass();
    g.pass();
    g.act(0).choosePermanents();
    g.expect.unpaired(SERAPH.name);
    g.expect.unpaired('bear');
  });

  test('the partner dies: its controller may return it at the beginning of their next upkeep, as a new object under its owner (CR 603.7, 400.7)', () => {
    const g = pairThem();
    const old = g.id('bear');
    g.act(0).cast('Lightning Bolt[0]', { targets: ['bear'], pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${BEAR.name} (ability)`]);
    g.pass();
    g.pass();
    g.act(0).accept();
    g.expect.zone(BEAR.name, 'graveyard', { seat: 0 });
    g.expect.unpaired(SERAPH.name);
    g.advanceTo('upkeep', { turn: 5 });
    g.pass();
    g.pass();
    g.expect.zone(BEAR.name, 'battlefield', { seat: 0 });
    expect(g.id(BEAR.name)).not.toBe(old);
    g.expect.unpaired(BEAR.name);
    g.expect.invariants();
  });

  test('the Seraph dies: it has the ability too (it is one of "each of those creatures") and returns at the next upkeep', () => {
    const g = pairThem();
    g.act(0).cast('Murder', { targets: [SERAPH.name], pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${SERAPH.name} (ability)`]);
    g.pass();
    g.pass();
    g.act(0).accept();
    g.advanceTo('upkeep', { turn: 5 });
    g.pass();
    g.pass();
    g.expect.zone(SERAPH.name, 'battlefield', { seat: 0 });
  });

  test('both die together (lethal damage to both): both have the ability, whichever left first, and both return', () => {
    const g = scenario()
      .define(SERAPH)
      .define(BEAR)
      .seat(0)
      .battlefield(SERAPH.name, { label: 'seraph', pairedWith: 'bear', damage: 4 })
      .battlefield(BEAR.name, { label: 'bear', damage: 2 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).pass(); // state-based actions: both die at once
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    expect(g.state.stack).toHaveLength(2);
    for (let i = 0; i < 2; i += 1) {
      g.pass();
      g.pass();
      g.act(0).accept();
    }
    expect(g.state.delayedTriggers).toHaveLength(2);
    g.advanceTo('upkeep', { turn: 5 });
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.passAll();
    g.expect.zone(SERAPH.name, 'battlefield', { seat: 0 });
    g.expect.zone(BEAR.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a creature that enters later may be paired with the Seraph by its second ability, and has the grant', () => {
    const g = scenario()
      .define(SERAPH)
      .define(BEAR)
      .seat(0)
      .hand(BEAR.name, 'Lightning Bolt')
      .battlefield(SERAPH.name, { label: 'seraph' })
      .battlefield('Forest', { count: 2 })
      .battlefield('Mountain')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(BEAR.name, { pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${SERAPH.name} (ability)`]);
    g.pass();
    g.pass();
    g.act(0).choosePermanents(BEAR.name);
    g.expect.paired(SERAPH.name, BEAR.name);
    g.expect.invariants();
  });
});
