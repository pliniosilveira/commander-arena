// The Witch-king of Angmar deck: the REAL Oracle text of its cards (the corpus's golden.jsonl) goes through the grammar with no override, is defined in an engine scenario and is played
// through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 701.21a (Sacrifice), CR 608.2d (the player who sacrifices chooses),
// CR 208.1 (power), CR 202.3 (mana value), CR 508.1 (attack triggers).
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
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const ANGEL = 'Serra Angel'; // 4/4
const BEARS = 'Grizzly Bears'; // 2/2
const ELVES = 'Llanowar Elves'; // 1/1
const LIBRARY = Array.from({ length: 8 }, () => 'Swamp');

describe('Witch-king, Bringer of Ruin', () => {
  const king = real('Witch-king, Bringer of Ruin');

  const attackBoard = (theirs: readonly string[]) => {
    const g = scenario()
      .define(king)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(king.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...theirs)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([king.name]);
    g.passAll();
    return g;
  };

  test('whenever it attacks the defending player sacrifices the creature with the least power (CR 701.21a)', () => {
    const g = attackBoard([ANGEL, BEARS, ELVES]);
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('with two tied for the least power the defending player chooses between them only (CR 608.2d)', () => {
    const g = attackBoard([ANGEL, BEARS, BEARS]);
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', seat: 1 });
    g.act(1).choosePermanents(`${BEARS}[0]`);
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });
});
