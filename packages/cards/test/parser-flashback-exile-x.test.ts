// "Flashback—{3}{U}{R}, Exile X cards from your graveyard." (Summons of Saruman, issue 150; CR 702.34a, 118.9, 107.3a): the flashback cost of mana and the exile of X cards of the
// graveyard, X being the X announced as the spell is cast. The engine pays it in packages/engine/test/scenario-xx-flashback-exile-x.test.ts. The first test is the real text of the
// acceptance card; the others are SYNTHETIC siblings and the near misses the grammar must not read.
import { describe, expect, test } from 'vitest';
import { read, readAll } from './parser-p5-helpers';

const EXILE_X = { kind: 'exileFromGraveyard', filter: {}, count: 1, countX: true };
const FLASHBACK = (...cost: object[]) => ({
  kind: 'keyword',
  keyword: { kind: 'flashback', cost },
});

describe('flashback with an exile of X cards from the graveyard', () => {
  test('the real text: the mana cost and the exile of X cards of any kind', () => {
    const parsed = readAll('Flashback—{3}{U}{R}, Exile X cards from your graveyard.', 'sorcery');
    expect(parsed.abilities).toContainEqual(
      FLASHBACK({ kind: 'mana', symbols: ['3', 'U', 'R'] }, EXILE_X),
    );
  });

  test('without the full stop, and with the exile before the mana (SYNTHETIC)', () => {
    const plain = readAll('Flashback—{1}{B}, Exile X cards from your graveyard', 'sorcery');
    expect(plain.abilities).toContainEqual(
      FLASHBACK({ kind: 'mana', symbols: ['1', 'B'] }, EXILE_X),
    );
  });

  test.each([
    'Flashback—{3}{U}{R}, Exile two cards from your graveyard.',
    'Flashback—{3}{U}{R}, Exile X creature cards from your graveyard.',
    'Flashback—{3}{U}{R}, Exile X cards from your graveyard, Exile X cards from your graveyard.',
    'Flashback—Exile X cards from an opponent graveyard.',
  ])('%s is not read as this cost (SYNTHETIC near miss)', (text) => {
    expect(read(text, 'sorcery').unparsed).toHaveLength(1);
  });

  test('the exile of X cards is not a cost of the other keywords (SYNTHETIC)', () => {
    expect(read('Kicker—Exile X cards from your graveyard.', 'sorcery').unparsed).toHaveLength(1);
  });
});
