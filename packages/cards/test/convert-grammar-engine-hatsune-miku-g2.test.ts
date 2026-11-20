// The Hatsune Miku - Secret Lair Commander deck (issue 145), group 2: the REAL Oracle text of Suture Priest (the corpus's golden.jsonl, taken from the issue) goes through the
// grammar as a card with no override and is played through applyAction. Pins: CR 603.5 (the controller of the ability chooses whether to do an optional instruction), CR 119.3 (life
// loss), CR 603.6a (an object that enters triggers abilities of other objects), CR 110.2 / 109.4 ("that player" is the controller of the permanent that entered).
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
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
  const [face] = card.faces;
  if (face === undefined) throw new Error(`${name} has no face`);
  return importCard(
    fromGoldenCard({ ...card, faces: [{ ...face, oracleText: text }] }),
    undefined,
    NO_OVERRIDES,
  );
}

const PRIEST = 'Suture Priest';
const BEARS = 'Grizzly Bears';

describe('Suture Priest: its controller may have the player of an opposing creature lose 1 life', () => {
  const priest = real(PRIEST);
  // Seat 0 owns the Priest; `caster` casts a Grizzly Bears (the opponent, or the owner of the Priest).
  const start = (caster: 0 | 1) => {
    const hand = (seat: 0 | 1) => (seat === caster ? [BEARS] : []);
    const lands = (seat: 0 | 1) => (seat === caster ? ['Forest', 'Forest'] : []);
    return scenario()
      .define(priest)
      .seat(0)
      .life(20)
      .battlefield(PRIEST, ...lands(0))
      .hand(...hand(0))
      .library(...Array.from({ length: 6 }, () => 'Plains'))
      .seat(1)
      .life(20)
      .battlefield(...lands(1))
      .hand(...hand(1))
      .library(...Array.from({ length: 6 }, () => 'Plains'))
      .at('precombatMain', { active: caster, turn: 3 })
      .build();
  };

  test('an opponent casts a creature: the controller of the Priest accepts and that player loses 1 life', () => {
    const g = start(1);
    g.act(1).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).accept();
    expect(g.state.seats[1]?.life).toBe(19);
    expect(g.state.seats[0]?.life).toBe(20);
    g.expect.invariants();
  });

  test('declining the optional instruction loses no life (CR 603.5)', () => {
    const g = start(1);
    g.act(1).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).decline();
    expect(g.state.seats[1]?.life).toBe(20);
    expect(g.state.seats[0]?.life).toBe(20);
  });

  test('a creature of the Priest controller does not make the opponent lose life', () => {
    const g = start(0);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).decline();
    expect(g.state.seats[0]?.life).toBe(20);
    expect(g.state.seats[1]?.life).toBe(20);
  });
});

describe('texts that are not Suture Priest are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    'Whenever ~ enters, that player loses 1 life.',
    'Whenever a creature an opponent controls enters, you may have that player loses 1 life.',
    'Whenever a creature an opponent controls enters, you may have you lose 1 life.',
    'Whenever a creature an opponent controls enters, you may have that player draw a card.',
  ];
  for (const text of lines) {
    test(text, () => {
      expect(withText(PRIEST, text).support.status).toBe('unsupported');
    });
  }
});
