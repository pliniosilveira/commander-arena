// Erdwal Illuminator (Deep Clue Sea deck, issue 128): "Whenever you investigate for the first time each turn, investigate an additional time." The REAL Oracle text (the golden corpus) goes
// through the grammar with no override, is defined in an engine scenario and is played through applyAction. The helper spells are SYNTHETIC.
// Rules pinned: CR 701.16a (investigate is a keyword action, done once each time; "investigate twice" is two), 603.2 (the trigger counts the player's investigations, not the ability's
// resolutions), and the Academy Manufactor ruling (a replacement effect changes the tokens, so the action still triggers once), 101.4 (three seats: only my investigations).
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

const ERDWAL = real('Erdwal Illuminator');
const MANUFACTOR = real('Academy Manufactor');
const ONE = parsed('SYNTHETIC Parsed Look', 'Sorcery', 'Investigate.', {
  manaCost: '{U}',
  colors: ['U'],
});
const TWO = parsed('SYNTHETIC Parsed Look Twice', 'Sorcery', 'Investigate twice.', {
  manaCost: '{U}',
  colors: ['U'],
});
const LIBRARY = Array.from({ length: 8 }, () => 'Island');

describe('Erdwal Illuminator', () => {
  const game = (extra: readonly string[] = []) =>
    scenario({ seats: 3 })
      .define(ERDWAL)
      .define(MANUFACTOR)
      .define(ONE)
      .define(TWO)
      .seat(0)
      .library(...LIBRARY)
      .hand(ONE.name, ONE.name, TWO.name)
      .battlefield('Island', 'Island', 'Island', ERDWAL.name, ...extra)
      .seat(1)
      .library(...LIBRARY)
      .hand(ONE.name)
      .battlefield('Island')
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(ERDWAL)).toEqual([]);
  });

  test('the first investigation of the turn investigates one more time; the second does not', () => {
    const g = game();
    g.act(0).cast(`${ONE.name}[0]`, { pay: true });
    g.passAll();
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 2 });
    g.act(0).cast(`${ONE.name}`, { pay: true });
    g.passAll();
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 3 });
    g.expect.invariants();
  });

  test('investigate twice is two investigations: the first triggers it once, the second does not', () => {
    const g = game();
    g.act(0).cast(TWO.name, { pay: true });
    g.passAll();
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 3 });
  });

  test('an opponent investigating does not trigger it (and they get no extra Clue)', () => {
    const g = game();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(1).cast(ONE.name, { pay: true });
    g.passAll();
    g.expect.zone('Clue', 'battlefield', { seat: 1, count: 1 });
    g.expect.noObject('Clue', { seat: 0 });
  });

  test('with Academy Manufactor one investigation makes a Clue, a Food and a Treasure and triggers it once', () => {
    const g = game([MANUFACTOR.name]);
    g.act(0).cast(`${ONE.name}[0]`, { pay: true });
    g.passAll();
    // Two investigations in all (the first, and the additional one): two of each token.
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 2 });
    g.expect.zone('Food', 'battlefield', { seat: 0, count: 2 });
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 2 });
  });

  test('the first investigation of the next turn triggers it again', () => {
    const g = game();
    g.act(0).cast(`${ONE.name}[0]`, { pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).cast(`${ONE.name}`, { pay: true });
    g.passAll();
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 4 });
  });
});
