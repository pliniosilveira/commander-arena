// The Bruna deck (issue 5), The Book of Exalted Deeds (D-981, D-982). The REAL card of the golden corpus, read through the grammar only and played through
// applyAction: "{W}{W}{W}, {T}, Exile ~: Put an enlightened counter on target Angel. It gains \"You can't lose the game and your opponents can't win the game.\"
// Activate only as a sorcery." Stand-ins are real engine fixtures or SYNTHETIC (named so).
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

const BOOK = real('The Book of Exalted Deeds');
const ANGEL = 'Serra Angel';
const BOLT = 'Lightning Bolt';
const FILLER = Array.from({ length: 30 }, () => 'Plains');

const game = () =>
  scenario()
    .define(BOOK)
    .seat(0)
    .life(3)
    .battlefield(BOOK.name, ANGEL, 'Plains', 'Plains', 'Plains')
    .library(...FILLER)
    .seat(1)
    .life(20)
    .hand(BOLT)
    .battlefield('Mountain', 'Mountain')
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 1 })
    .build();

describe('The Book of Exalted Deeds', () => {
  test('both abilities read: the life trigger and the activated ability with a grant and sorcery timing', () => {
    const [life, grant] = BOOK.faces[0]?.abilities ?? [];
    expect(life).toMatchObject({ kind: 'triggered' });
    expect(grant).toMatchObject({
      kind: 'activated',
      timing: 'sorcery',
      effect: {
        kind: 'sequence',
        effects: [{ kind: 'addCounters', counter: 'enlightened' }, { kind: 'grantAbility' }],
      },
    });
  });

  test('exiled as a cost, it puts the counter on an Angel and the Angel keeps its controller in the game at 0 life', () => {
    const g = game();
    g.expect.legal(0, { activate: BOOK.name });
    g.act(0).activate(BOOK.name, { targets: [ANGEL], pay: true });
    g.expect.zone(BOOK.name, 'exile', { seat: 0 });
    g.passAll();
    g.expect.counters(ANGEL, { enlightened: 1 });
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 0);
    g.expect.hasLost(0, false);
  });

  test('without the grant the same burn loses the game', () => {
    const g = game();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.hasLost(0, true);
  });

  test('"Activate only as a sorcery": not in combat', () => {
    const g = game();
    g.advanceTo('beginningOfCombat');
    g.expect.illegal(0, { activate: BOOK.name });
  });
});
