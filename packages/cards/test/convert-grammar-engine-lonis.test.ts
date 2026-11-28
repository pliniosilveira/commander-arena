// Lonis, Cryptozoologist (Deep Clue Sea deck, issue 128): "Whenever another nontoken creature you control enters, investigate." and "{T}, Sacrifice X Clues: Target opponent reveals the top X
// cards of their library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield under your control. That player puts the rest on the bottom of
// their library in a random order." The REAL Oracle text (the golden corpus) goes through the grammar with no override, is defined in an engine scenario and is played through applyAction.
// Rules pinned: CR 701.20a (reveal: all the cards are shown and stay in the library), 110.2 (the permanent enters under my control), 202.3 (mana value at most X), 401.4 and 701.24 (the rest
// go to the bottom of their owner's library), 107.3 and 602.2b (X is announced with the cost: X Clues are sacrificed), 101.4 (three seats: the other opponent is untouched).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
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
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const LONIS = real('Lonis, Cryptozoologist');
const LOOK = parsed('SYNTHETIC Parsed Look Twice', 'Sorcery', 'Investigate twice.', {
  manaCost: '{U}',
  colors: ['U'],
});
const BEARS = 'Grizzly Bears'; // 2/2, mana value 2
const SERRA = 'Serra Angel'; // mana value 5
const BOLT = 'Lightning Bolt'; // an instant: not a permanent card
const FOREST = 'Forest';
const FILLER = Array.from({ length: 8 }, () => 'Plains');

describe('Lonis, Cryptozoologist', () => {
  const game = (top1: readonly string[]) =>
    scenario({ seats: 3 })
      .define(LONIS)
      .define(LOOK)
      .seat(0)
      .library(...FILLER)
      .hand(LOOK.name)
      .battlefield('Island', LONIS.name)
      .seat(1)
      .library(...top1, ...FILLER)
      .seat(2)
      .library(BEARS, ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(LONIS)).toEqual([]);
  });

  test('X = 2: two Clues are sacrificed, the opponent reveals two cards, the Bears (mana value 2) come to me and the Forest goes to the bottom', () => {
    const g = game([BEARS, FOREST]);
    g.act(0).cast(LOOK.name, { pay: true });
    g.passAll();
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 2 });
    g.act(0).activate(LONIS.name, { x: 2, targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.noObject('Clue');
    // The cards are revealed; I may put one that is a nonland permanent card with mana value 2 or less: only the Bears match.
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: BEARS, seat: 1, zone: 'library' });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    // It is mine to control, and owned by the opponent (CR 108.3).
    g.expect.zone(FOREST, 'library', { seat: 1 });
    g.expect.librarySize(1, 9);
    // The other opponent's library is untouched.
    g.expect.librarySize(2, 9);
    g.expect.invariants();
  });

  test('a card with mana value above X, a land and an instant cannot be taken: nothing is asked, and all of them go to the bottom', () => {
    const g = game([SERRA, FOREST, BOLT]);
    g.act(0).cast(LOOK.name, { pay: true });
    g.passAll();
    g.act(0).activate(LONIS.name, { x: 2, targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.noObject(SERRA, { zone: 'battlefield' });
    g.expect.zone(SERRA, 'library', { seat: 1 });
    // The third card (the Bolt) was not revealed: it is now the top card.
    g.expect.librarySize(1, 11);
  });
});
