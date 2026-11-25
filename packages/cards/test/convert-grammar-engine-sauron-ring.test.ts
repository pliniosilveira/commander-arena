// The Sauron deck, the Ring group: the REAL Oracle text of Breaking of the Fellowship and Ringsight (the corpus's golden.jsonl) goes through the grammar as a card with no override, is
// defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. The spell of each real card is also the one
// of its SYNTHETIC sibling of the engine fixtures (`synthetic-same-controller.ts`, `synthetic-shares-color.ts`).
// Pins: CR 115.1 and 115.3 (another target, controlled by the same player), CR 109.4, CR 608.2b (a target that is illegal as the spell resolves), CR 120.3 (damage by a creature), CR 701.54a
// (the Ring tempts you), CR 105.1 and 105.2c (a shared color; colorless shares none), CR 701.23b (a stated quality: finding nothing is allowed).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const ELVES = 'Llanowar Elves'; // 1/1
const ISAMARU = 'Isamaru, Hound of Konda'; // legendary white creature
const SERRA = 'Serra Angel'; // white
const COUNTERSPELL = 'Counterspell'; // blue
const SOL_RING = 'Sol Ring'; // colorless
const MURDER = 'Murder';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

const breaking = real('Breaking of the Fellowship');
const ringsight = real('Ringsight');

describe('every card is valid and has the AST of its SYNTHETIC sibling', () => {
  test('Breaking of the Fellowship: the bite of Pit Strike, then the Ring tempts you', () => {
    expect(validateCard(breaking)).toEqual([]);
    const twin = syntheticCard('SYNTHETIC Pit Strike').faces[0]?.spell;
    const spell = breaking.faces[0]?.spell;
    expect(spell?.targets).toEqual(twin?.targets);
    expect(spell?.effect).toEqual({
      kind: 'sequence',
      effects: [twin?.effect, { kind: 'ringTempts' }],
    });
  });

  test('Ringsight', () => {
    expect(validateCard(ringsight)).toEqual([]);
    expect(ringsight.faces[0]?.spell).toEqual(syntheticCard('SYNTHETIC Ring Seek').faces[0]?.spell);
  });
});

describe('Breaking of the Fellowship', () => {
  const board = (seats: 2 | 3 = 3) => {
    const b = scenario({ seats })
      .define(breaking)
      .seat(0)
      .library(...LIBRARY)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .battlefield(BEARS, { label: 'mine' })
      .hand(breaking.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'a1' })
      .battlefield(ELVES, { label: 'a2' })
      .hand(MURDER)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(2)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'b1' })
      .battlefield(ELVES, { label: 'b2' });
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('the first creature deals damage equal to its power to another creature of the same opponent, and the Ring tempts you', () => {
    const g = board();
    g.act(0).cast(breaking.name, { targets: ['a1', 'a2'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.damage('a1', 0);
    // "The Ring tempts you": the Ring-bearer is chosen among the creatures (a single one here, so asked or not, the Ring has a level).
    g.expect.ringLevel(0, 1);
  });

  test('a pair of two different opponents, or a creature of your own, is refused (the same player controls both)', () => {
    const g = board();
    expect(() => g.act(0).cast(breaking.name, { targets: ['a1', 'b2'], pay: true })).toThrow();
    const h = board();
    expect(() => h.act(0).cast(breaking.name, { targets: ['a1', 'mine'], pay: true })).toThrow();
    const i = board();
    expect(() => i.act(0).cast(breaking.name, { targets: ['a1', 'a1'], pay: true })).toThrow();
  });

  test('with three seats the pair may be of the third seat as well', () => {
    const g = board();
    g.act(0).cast(breaking.name, { targets: ['b1', 'b2'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 2 });
    g.expect.zone(ELVES, 'battlefield', { seat: 1 });
  });

  test('the first creature is gone as the spell resolves: it deals no damage, and the Ring still tempts you (CR 608.2b)', () => {
    const g = board();
    g.act(0).cast(breaking.name, { targets: ['a1', 'a2'], pay: true });
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: ['a1'], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.zone(ELVES, 'battlefield', { seat: 1 });
    g.expect.damage('a2', 0);
    g.expect.ringLevel(0, 1);
  });
});

describe('Ringsight', () => {
  const board = (battlefield: readonly string[]) => {
    let b = scenario()
      .define(ringsight)
      .seat(0)
      .hand(ringsight.name)
      .battlefield('Island', 'Swamp', 'Island');
    for (const name of battlefield) b = b.battlefield(name);
    return b
      .library(SERRA, { label: 'serra' })
      .library(COUNTERSPELL, { label: 'counter' })
      .library(SOL_RING, { label: 'ring' })
      .library(SPIDER, { label: 'spider' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
  };
  const legalOf = (g: ReturnType<typeof board>) => {
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`pending is ${d?.kind}`);
    return d;
  };

  test('a card that shares a color with a legendary creature you control: the white card, not the blue or the colorless one', () => {
    const g = board([ISAMARU]);
    g.act(0).cast(ringsight.name, { pay: true });
    g.passAll();
    const d = legalOf(g);
    expect(d.legal).toEqual([g.id('serra')]);
    // CR 701.23b: a stated quality, so the search may find nothing.
    expect(d.min).toBe(0);
    g.act(0).chooseCards(g.id('serra'));
    g.expect.zone(SERRA, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('the Ring tempts you first: the Ring-bearer is legendary for the search', () => {
    const g = board([ELVES]);
    g.act(0).cast(ringsight.name, { pay: true });
    g.passAll();
    g.expect.ringBearer(0, g.id(ELVES));
    expect(legalOf(g).legal).toEqual([g.id('spider')]);
  });
});
