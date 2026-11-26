// Most Wanted deck (Outlaws of Thunder Junction Commander), group 2 (mana and Treasure): the REAL Oracle text of Glittering Stockpile, Rain of Riches, Academy Manufactor and the
// second line of Vihaan, Goldwaker (golden.jsonl, taken from issue 120) goes through the grammar as a card with no override, is defined in an engine scenario and is played through
// applyAction, so the nodes the parser writes for the real text are what the engine runs.
// Pins (numbers looked up with `pnpm rule` in this session): CR 605.1a and 605.3b (mana abilities), CR 122.6 (counters put on an object), CR 113.7a (last-known information),
// CR 702.85a (Cascade), CR 601.2h (mana spent to cast a spell), CR 614 (replacement effects), CR 111 (tokens).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

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

const FILLER = Array.from({ length: 8 }, () => 'Island');
const STOCKPILE = real('Glittering Stockpile');

describe('Glittering Stockpile: a mana ability that puts a stash counter on itself (CR 605.1a, 122.6)', () => {
  test('is valid; both abilities are mana abilities', () => {
    expect(validateCard(STOCKPILE)).toEqual([]);
    const [first, second] = STOCKPILE.faces[0]?.abilities ?? [];
    expect(first).toMatchObject({
      kind: 'mana',
      cost: [{ kind: 'tap' }],
      production: { kind: 'fixed' },
      putCounter: { counter: 'stash', count: 1 },
    });
    expect(second).toMatchObject({
      kind: 'mana',
      cost: [{ kind: 'tap' }, { kind: 'sacrifice', what: { kind: 'this' } }],
      production: {
        kind: 'anyColorAmount',
        amount: { kind: 'countersOn', counter: 'stash', of: { kind: 'this' } },
      },
    });
  });

  const start = (stash: number) =>
    scenario()
      .define(STOCKPILE)
      .seat(0)
      .library(...FILLER)
      .battlefield(STOCKPILE.name, stash === 0 ? {} : { counters: { stash } })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('{T}: Add {R} and a stash counter', () => {
    const g = start(0);
    g.act(0).tapForMana(STOCKPILE.name);
    g.expect.pool(0, 'R');
    g.expect.counters(STOCKPILE.name, { stash: 1 });
    g.expect.tapped(STOCKPILE.name);
  });

  test('the counters pile up from one use to the next', () => {
    const g = start(2);
    g.act(0).tapForMana(STOCKPILE.name);
    g.expect.counters(STOCKPILE.name, { stash: 3 });
  });

  test('{T}, Sacrifice: X mana of one color, X the stash counters (CR 113.7a: the sacrifice leaves them as they were)', () => {
    const g = start(3);
    g.act(0).tapForMana(STOCKPILE.name, { ability: 1, color: 'G' });
    g.expect.pool(0, 'GGG');
    g.expect.zone(STOCKPILE.name, 'graveyard', { seat: 0 });
  });

  test('with no counter the sacrifice makes no mana', () => {
    const g = start(0);
    expect(() => g.act(0).tapForMana(STOCKPILE.name, { ability: 1, color: 'G' })).toThrow();
  });
});

describe('the counter after the mana is read only for mana that counts nothing (CR 605.3b)', () => {
  const read = (text: string) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Counting Rock',
        typeLine: 'Artifact',
        manaCost: '{1}',
        oracleText: text.replaceAll('~', 'SYNTHETIC Counting Rock'),
      }),
    ).support.status;

  test('a fixed amount and one color of a choice are read', () => {
    expect(read('{T}: Add {G}. Put a charge counter on ~.')).toBe('supported');
    expect(read('{T}: Add one mana of any color. Put a charge counter on ~.')).toBe('supported');
  });

  test('an amount that counts the counters is not: putting them first would change it', () => {
    expect(
      read(
        '{T}: Add X mana of any one color, where X is the number of charge counters on ~. Put a charge counter on ~.',
      ),
    ).toBe('unsupported');
  });

  test('a sacrifice of another permanent with an amount that counts is still refused', () => {
    expect(
      read(
        '{T}, Sacrifice a creature: Add X mana of any one color, where X is the number of charge counters on ~.',
      ),
    ).toBe('unsupported');
  });
});
