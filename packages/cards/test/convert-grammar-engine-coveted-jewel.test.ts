// Coveted Jewel (the top-5 card ranking): the REAL card of the golden corpus, read through the grammar only and played through applyAction. "Whenever one or more creatures an
// opponent controls attack you and aren't blocked, that player draws three cards and gains control of this artifact. Untap it." is the engine's `unblockedAttackBatch`
// (CR 509.1h, 603.2) with a draw, a `gainControl` and an `untap` for the player who attacked (CR 613.1b, 701.26b). Stand-ins are the engine's real fixtures.
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

const JEWEL = real('Coveted Jewel');
const BEARS = 'Grizzly Bears';
const WALL = 'SYNTHETIC Brick Wall';
const FILLER = Array.from({ length: 20 }, () => 'Island');

/** Seat 1 attacks seat 0, who has the tapped Jewel and what `defence` adds; the game stops at the declare blockers decision or step. */
const game = (attackers: readonly string[], defence: readonly string[] = []) => {
  const b = scenario().define(JEWEL).seat(0).battlefield(JEWEL.name, { tapped: true });
  for (const d of defence) b.battlefield(d);
  const s1 = b.library(...FILLER).seat(1);
  for (const a of attackers) s1.battlefield(a);
  const g = s1
    .library(...FILLER)
    .at('precombatMain', { active: 1, turn: 2 })
    .build();
  g.advanceTo('declareAttackers');
  g.act(1).attack(attackers);
  g.advanceTo('declareBlockers');
  return g;
};

describe('Coveted Jewel', () => {
  test('reads as an enters trigger, a mana ability and the unblocked-attack trigger', () => {
    const kinds = JEWEL.faces[0]?.abilities?.map((a) => a.kind) ?? [];
    expect(kinds).toEqual(['triggered', 'mana', 'triggered']);
    const ast = JSON.stringify(JEWEL.faces[0]?.abilities?.[2]);
    expect(ast).toContain('unblockedAttackBatch');
    expect(ast).toContain('gainControl');
    expect(ast).toContain('triggerPlayer');
  });

  test('an unblocked attacker: the attacker draws three cards, takes the Jewel and untaps it', () => {
    const g = game([BEARS]);
    g.passAll();
    g.expect.handSize(1, 3);
    g.expect.handSize(0, 0);
    g.expect.tapped(JEWEL.name, false);
    g.expect.stack([]);
    // The attacker controls it now (CR 613.1b): its mana ability is theirs to use ({T}: Add three mana of any one color).
    g.act(1).tapForMana(JEWEL.name, { color: 'G' });
    g.expect.pool(1, 'GGG');
  });

  test('a blocked attacker does nothing', () => {
    const g = game([BEARS], [WALL]);
    g.act(0).declareBlockers([{ blocker: WALL, attacker: BEARS }]);
    g.passAll();
    g.expect.handSize(1, 0);
    g.expect.tapped(JEWEL.name, true);
  });

  test('it can be taken back the same way: when seat 0 attacks seat 1 and is unblocked', () => {
    const g = scenario()
      .define(JEWEL)
      .seat(0)
      .battlefield(BEARS)
      .library(...FILLER)
      .seat(1)
      .battlefield(JEWEL.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([BEARS]);
    g.advanceTo('declareBlockers');
    g.passAll();
    g.expect.handSize(0, 3);
    g.expect.handSize(1, 0);
  });
});
