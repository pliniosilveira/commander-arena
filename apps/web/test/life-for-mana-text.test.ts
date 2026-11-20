// The choice to pay life rather than mana (`lifeForMana`, Marshland Bloodcaster, CR 118.9): the cast button and the log words.
import type { ObjectView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { alternativeLogWords, isNamedAlternative } from '../src/game/alt-cost';
import { alternativeLabel } from '../src/ui/decisions/alt-cost';

const card = (manaCost: readonly string[] | null) => ({ manaCost }) as unknown as ObjectView;

describe('the cast button', () => {
  test('says the life: the mana value of the printed cost', () => {
    expect(alternativeLabel('lifeForMana', card(['2', 'U']))).toBe(
      'Cast by paying 3 life instead of mana',
    );
    expect(alternativeLabel('lifeForMana', card(['W', 'W']))).toBe(
      'Cast by paying 2 life instead of mana',
    );
  });

  test('with an {X} the life is the mana value with the X announced next', () => {
    expect(alternativeLabel('lifeForMana', card(['X', 'U']))).toBe(
      'Cast by paying life equal to its mana value instead of mana',
    );
  });

  test('is asked about even when it is the only way to cast (a named alternative)', () => {
    expect(isNamedAlternative('lifeForMana')).toBe(true);
  });
});

test('the log says how the cost was paid', () => {
  expect(alternativeLogWords('lifeForMana')).toBe('by paying life rather than mana');
});
