// Flint deck (issue 685), group 11: Black Cat, Cunning Thief, read from its REAL Oracle text (fixtures/corpus/golden.jsonl) with no override and played through applyAction on three seats.
// "When Black Cat enters, look at the top nine cards of target opponent's library, exile two of them face down, then put the rest on the bottom of their library in a random order. You may
// play the exiled cards for as long as they remain exiled. Mana of any type can be spent to cast spells this way." (CR 401.2, 406.3, 701.20, 305.1, 601.2, 609.4b, 611.2b): two cards of the
// nine are chosen and exiled, seven go to the bottom of that library, and the two can be played on a later turn too.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
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

const CAT = real('Black Cat, Cunning Thief');
const ELVES = 'Llanowar Elves'; // {G}
const PLAINS9 = Array.from({ length: 7 }, () => 'Plains');

describe('Black Cat, Cunning Thief (CR 401.2, 406.3, 701.20, 609.4b)', () => {
  test('is valid', () => {
    expect(validateCard(CAT)).toEqual([]);
  });

  const table = () =>
    scenario({ seats: 3 })
      .define(CAT)
      .seat(0)
      .library(...PLAINS9)
      .hand(CAT.name)
      .pool('BBBBBR')
      .seat(1)
      .library(ELVES, 'Forest', ...PLAINS9)
      .seat(2)
      .library(...PLAINS9, 'Island', 'Island')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  const enter = () => {
    const g = table();
    g.act(0).cast(CAT.name).pay();
    g.passAll();
    if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    expect(g.state.pending?.kind).toBe('chooseCards');
    g.act(0).chooseCards(
      { name: ELVES, seat: 1, zone: 'library' },
      { name: 'Forest', seat: 1, zone: 'library' },
    );
    return g;
  };

  test('two of the nine cards are exiled face down, the other seven go to the bottom of that library', () => {
    const g = enter();
    g.expect.zone(ELVES, 'exile', { seat: 1 });
    g.expect.zone('Forest', 'exile', { seat: 1 });
    g.expect.zone('Plains', 'library', { seat: 1, count: 7 });
    // The third seat’s library is untouched.
    g.expect.zone('Island', 'library', { seat: 2, count: 2 });
  });

  test('a spell cast from them is paid with mana of any type, and the land is played as a land', () => {
    const g = enter();
    g.act(0).cast({ name: ELVES, seat: 1, zone: 'exile' }, { pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.act(0).playLand({ name: 'Forest', seat: 1, zone: 'exile' });
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
  });
});
