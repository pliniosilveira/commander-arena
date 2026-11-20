// The Hatsune Miku - Secret Lair Commander deck (issue 145), group 14: the REAL Dazzling Theater // Prop Room (the corpus's golden.jsonl, taken from the issue) goes through the
// grammar as a card with no override and is played through applyAction. The Room layout is the engine's (CR 709.5, `rules/rooms.ts`); what this group adds is the wording "Untap
// each creature you control during each other player's untap step." of Prop Room. Pins: CR 709.5c-d (only an unlocked half has its text), CR 502.3 (the untap step), CR 702.51
// (convoke, from Dazzling Theater's grant).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
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

/** A card of the golden corpus with its text replaced, imported through the grammar. */
function withText(name: string, text: string) {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const [, right] = card.faces;
  if (right === undefined) throw new Error(`${name} has no second face`);
  return importCard(
    fromGoldenCard({ ...card, faces: [card.faces[0], { ...right, oracleText: text }] as never }),
    undefined,
    NO_OVERRIDES,
  );
}

const ROOM = 'Dazzling Theater // Prop Room';
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 8 }, () => 'Plains');

describe('Prop Room: your creatures untap during each other player’s untap step', () => {
  const room = real(ROOM);
  const board = (unlocked: readonly number[]) =>
    scenario()
      .define(room)
      .seat(0)
      .life(20)
      .battlefield(ROOM, { unlocked })
      .battlefield(BEARS, { tapped: true })
      .battlefield('Plains', { tapped: true, label: 'my land' })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('end', { active: 0, turn: 1 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(room)).toEqual([]);
  });

  test('with Prop Room unlocked, a tapped creature untaps in the opponent untap step; a land does not', () => {
    const g = board([1]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped(BEARS, false);
    g.expect.tapped('my land', true);
    g.expect.invariants();
  });

  test('with only Dazzling Theater unlocked, the locked half gives nothing (CR 709.5)', () => {
    const g = board([0]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped(BEARS, true);
  });

  test('cast as Prop Room, the half is unlocked as the Room enters (CR 709.5d)', () => {
    const g = scenario()
      .define(room)
      .seat(0)
      .life(20)
      .hand(ROOM)
      .battlefield('Plains', 'Plains', 'Plains')
      .battlefield(BEARS, { tapped: true })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(ROOM, { face: 1, pay: true });
    g.passAll();
    expect(g.state.objects[g.id(ROOM)]?.unlockedDoors).toEqual([1]);
  });
});

describe('Dazzling Theater: creature spells you cast have convoke', () => {
  const room = real(ROOM);
  test('with Dazzling Theater unlocked, a creature spell can be paid by tapping creatures', () => {
    const g = scenario()
      .define(room)
      .seat(0)
      .life(20)
      .hand('Giant Spider')
      .battlefield(ROOM, { unlocked: [0] })
      .battlefield(BEARS, BEARS, BEARS, BEARS, BEARS)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.expect.legal(0, { cast: 'Giant Spider' });
  });

  test('with only Prop Room unlocked, the grant is locked and the spell cannot be paid that way', () => {
    const g = scenario()
      .define(room)
      .seat(0)
      .life(20)
      .hand('Giant Spider')
      .battlefield(ROOM, { unlocked: [1] })
      .battlefield(BEARS, BEARS, BEARS, BEARS, BEARS)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.expect.illegal(0, { cast: 'Giant Spider' });
  });
});

describe('texts that are not Prop Room are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    "Untap each creature during each other player's untap step.",
    "Untap each land you control during each other player's untap step.",
    'Untap each creature you control during your untap step.',
  ];
  for (const text of lines) {
    test(text, () => {
      expect(withText(ROOM, text).support.status).toBe('unsupported');
    });
  }
});
