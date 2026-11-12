// Dismantling Wave (the Bruna deck, issue 5): the REAL card of the owner's golden corpus, read through the grammar only and played through applyAction. CR 115.1 and 601.2c (up to
// one target for each opponent, chosen as the spell is cast), CR 701.8a (destroy), CR 702.29a and 702.29c (Cycling and "when you cycle this card": the trigger destroys
// everything, with no target). The permanents are real engine fixtures (Sol Ring) or SYNTHETIC (named so).
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

const WAVE = real('Dismantling Wave');
const RING = 'Sol Ring';
const ENCH = 'SYNTHETIC Grasp of Law';
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 12 }, () => 'Island');

/** Seat 0 holds the Wave with `lands` Plains and `mine` on its side; seat 1 has `theirs`. */
const game = (theirs: readonly string[], mine: readonly string[] = [], lands = 3) =>
  scenario()
    .define(WAVE)
    .seat(0)
    .hand(WAVE.name)
    .battlefield(...Array.from({ length: lands }, () => 'Plains'), ...mine)
    .library(...FILLER)
    .seat(1)
    .library(...FILLER)
    .battlefield(...theirs)
    .at('precombatMain', { active: 0, turn: 1 })
    .build();

describe('Dismantling Wave as a spell', () => {
  test('reads as the slot of one target for each opponent and Cycling with its trigger', () => {
    const face = WAVE.faces[0];
    expect(face?.spell?.targets).toEqual([
      expect.objectContaining({ id: 't1', onePerOpponent: true }),
    ]);
    expect(face?.abilities.map((a) => a.kind)).toEqual(['keyword', 'triggered']);
  });

  test('casting it asks for up to one artifact or enchantment of the opponent', () => {
    const g = game([RING, ENCH, BEARS], [RING]);
    g.act(0).cast(WAVE.name);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const spec = d.specs[0];
    expect(spec?.min).toBe(0);
    expect(spec?.max).toBe(1);
    expect(spec?.onePerGroup).toBe(true);
    // The opponent's Sol Ring and enchantment; not the creature, and not the Sol Ring of mine.
    expect(spec?.legal.map((t) => (t.kind === 'object' ? t.id : null)).sort()).toEqual(
      [g.id({ name: RING, seat: 1 }), g.id(ENCH)].sort(),
    );
  });

  test('the artifact chosen is destroyed and nothing else is', () => {
    const g = game([RING, ENCH], [RING]);
    g.act(0).cast(WAVE.name, { targets: [{ name: RING, seat: 1 }], pay: true });
    g.passAll();
    g.expect.zone(RING, 'graveyard', { seat: 1 });
    g.expect.zone(ENCH, 'battlefield', { seat: 1 });
    g.expect.zone(RING, 'battlefield', { seat: 0 });
    g.expect.zone(WAVE.name, 'graveyard', { seat: 0 });
  });

  test('an enchantment can be the target', () => {
    const g = game([RING, ENCH]);
    g.act(0).cast(WAVE.name, { targets: [ENCH], pay: true });
    g.passAll();
    g.expect.zone(ENCH, 'graveyard', { seat: 1 });
    g.expect.zone(RING, 'battlefield', { seat: 1 });
  });

  test('it may be cast with no target (up to one) and then destroys nothing', () => {
    const g = game([RING]);
    g.act(0).cast(WAVE.name, { targets: [], pay: true });
    g.passAll();
    g.expect.zone(RING, 'battlefield', { seat: 1 });
  });

  test('the cycling trigger does not happen when it is cast', () => {
    const g = game([RING], [RING]);
    g.act(0).cast(WAVE.name, { targets: [{ name: RING, seat: 1 }], pay: true });
    g.passAll();
    g.expect.zone(RING, 'battlefield', { seat: 0 });
  });
});

describe('Dismantling Wave cycled', () => {
  test('destroys every artifact and enchantment, mine included, with no targets', () => {
    const g = game([RING, ENCH, BEARS], [RING], 8);
    g.act(0).activate(WAVE.name, { pay: true });
    g.passAll();
    g.expect.zone(RING, 'graveyard', { seat: 0 });
    g.expect.zone(RING, 'graveyard', { seat: 1 });
    g.expect.zone(ENCH, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.handSize(0, 1);
  });
});
