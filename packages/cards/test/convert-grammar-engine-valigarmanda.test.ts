// Summon: Esper Valigarmanda (deck support issue 97): the REAL Oracle text (the corpus's golden.jsonl) goes through the grammar as a card with no override, reads as supported, and is played
// through the engine as a Saga that is also a creature.
// "I - Exile an instant or sorcery card from each graveyard. II, III, IV - Add {R} for each lore counter on this Saga. You may cast an instant or sorcery card exiled with this Saga, and mana of
// any type can be spent to cast that spell. Flying, haste". Pins: CR 714 (Saga: lore counters, chapters, sacrifice after the last one), CR 607.2a (cards exiled with a permanent), CR 608.2g (a
// spell cast as an ability resolves), CR 609.4b (mana of any type), CR 101.4 (APNAP order).
import { readFileSync } from 'node:fs';
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const NAME = 'Summon: Esper Valigarmanda';
const goldenCard = () => {
  const found = cards.find((c) => c.name === NAME);
  if (found === undefined) throw new Error(`${NAME} is not in the golden corpus`);
  return found;
};
const withText = (oracleText: string) => {
  const card = goldenCard();
  const face = card.faces[0];
  if (face === undefined) throw new Error('no face');
  return importCard(
    fromGoldenCard({ ...card, faces: [{ ...face, oracleText }] }),
    undefined,
    NO_OVERRIDES,
  );
};
const SAGA = goldenCard().faces[0]?.oracleText ?? '';
const imported = importCard(fromGoldenCard(goldenCard()), undefined, NO_OVERRIDES);
const VALIGARMANDA = imported.definition;
const BOLT = 'Lightning Bolt'; // instant {R}
const MURDER = 'Murder'; // instant {1}{B}{B}
const BEARS = 'Grizzly Bears'; // creature {1}{G}
const FILLER = Array.from({ length: 12 }, () => 'Plains');
const exiledOf = (name: string, seat: 0 | 1 | 2) => ({ name, zone: 'exile' as const, seat });

test('the real card reads as supported and is valid', () => {
  expect(imported.support.unparsed).toEqual([]);
  expect(imported.support.status, JSON.stringify(imported.support)).toBe('supported');
  expect(validateCard(VALIGARMANDA)).toEqual([]);
  const json = JSON.stringify(VALIGARMANDA.faces);
  expect(json).toContain('"eachGraveyard":true');
  expect(json).toContain('"paying":true');
  expect(json).toContain('"anyManaType":true');
});

test('near misses of the chapter sentences are not read', () => {
  const chapterI = SAGA.replace(
    'Exile an instant or sorcery card from each graveyard.',
    'Exile a creature card from each graveyard.',
  );
  expect(withText(chapterI).support.status).not.toBe('supported');
  // A permission to cast "this turn" is another ability; the engine would drop the words, so it is not read.
  const chapterII = SAGA.replace(
    'exiled with ~, and mana',
    'exiled with ~ this turn, and mana',
  ).replace('exiled with this Saga, and mana', 'exiled with this Saga this turn, and mana');
  expect(withText(chapterII).support.status).not.toBe('supported');
});

describe('Summon: Esper Valigarmanda played', () => {
  /** Seat 0 casts it with four Mountains; seats 1 and 2 have instants in their graveyards (seat 1 two of them, so it is asked). */
  const cast = () => {
    const g = scenario({ seats: 3 })
      .define(VALIGARMANDA)
      .seat(0)
      .hand(NAME)
      .library(...FILLER)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .graveyard(BOLT, MURDER, BEARS)
      .library(...FILLER)
      .seat(2)
      .graveyard('Lightning Bolt')
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    return g;
  };

  test('it is a Saga creature: a 3/3 with flying and haste that enters with a lore counter', () => {
    const g = cast();
    g.expect.counters(NAME, { lore: 1 });
    g.expect.pt(NAME, 3, 3);
    g.expect.derived(NAME, {
      types: ['creature', 'enchantment'],
      subtypes: ['Saga', 'Drake'],
      keywords: ['flying', 'haste'],
    });
    g.expect.invariants();
  });

  test('chapter I: one instant or sorcery card is exiled from each graveyard, the controller choosing', () => {
    const g = cast();
    // Seat 0's graveyard is empty; seat 1 has two candidates; seat 2 has one (chosen for them).
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: MURDER, zone: 'graveyard', seat: 1 });
    g.expect.zone(MURDER, 'exile', { seat: 1 });
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    // The creature card is not an instant or a sorcery.
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone('Lightning Bolt', 'exile', { seat: 2 });
    g.expect.invariants();
  });

  /** Through chapter I (Bolt of seat 1 and seat 2's Bolt exiled, Murder left), to the question of chapter II. */
  const chapterII = (choice: string) => {
    const g = cast();
    g.act(0).chooseCards({ name: choice === BOLT ? BOLT : MURDER, zone: 'graveyard', seat: 1 });
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 3 });
    g.passAll();
    return g;
  };

  test('chapter II: {R} for each lore counter is added, and the exiled card is cast paying its mana cost', () => {
    const g = cast();
    g.act(0).chooseCards({ name: BOLT, zone: 'graveyard', seat: 1 });
    // Not castable in the turn of chapter I: the cast belongs to chapters II to IV.
    g.expect.illegal(0, { cast: exiledOf(BOLT, 1) });
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 3 });
    g.passAll();
    // Two lore counters: {R}{R} added, then the question of which exiled card to cast.
    g.expect.pool(0, 'RR');
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(exiledOf(BOLT, 1));
    g.act(0).chooseTargets({ player: 2 });
    g.act(0).payAuto();
    g.expect.pool(0, 'R');
    g.passAll();
    g.expect.life(2, 37);
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('chapter II: only an instant or sorcery card exiled with it is offered, and the question may be declined', () => {
    const g = chapterII(MURDER);
    const pending = g.state.pending;
    expect(pending?.kind).toBe('chooseCards');
    if (pending?.kind !== 'chooseCards') return;
    const names = pending.legal.map((id) => g.state.objects[id]?.card);
    expect(names).toHaveLength(2);
    g.act(0).chooseCards();
    g.expect.zone(MURDER, 'exile', { seat: 1 });
    g.expect.invariants();
  });

  test('chapter II: mana of any type pays the spell (Murder from red mana)', () => {
    const g = chapterII(MURDER);
    g.act(0).chooseCards(exiledOf(MURDER, 1));
    // {1}{B}{B} from {R}{R} and a Mountain.
    g.act(0).chooseTargets({ name: NAME, zone: 'battlefield', seat: 0 });
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(NAME, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('it is sacrificed after chapter IV, and its chapters are the only abilities that gave it counters', () => {
    const g = cast();
    g.act(0).chooseCards({ name: BOLT, zone: 'graveyard', seat: 1 });
    for (let chapter = 2; chapter <= 4; chapter++) {
      g.advanceTo('precombatMain', { turn: g.state.turn.number + 3 });
      g.passAll();
      // Decline the cast of the exiled cards.
      g.act(0).chooseCards();
      g.passAll();
    }
    g.expect.zone(NAME, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});
