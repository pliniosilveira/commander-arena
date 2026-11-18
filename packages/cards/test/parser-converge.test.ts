// Converge (issue 310, Painful Truths): "You draw X cards and lose X life, where X is the number of colors of mana spent to cast this spell."
// The engine reads the colors of the mana spent (`manaSpent` with `colors`, CR 105.1, 601.2h); the card's own name stands for "this spell".
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const COLORS_X = { kind: 'manaSpent', colors: true };

describe('"the number of colors of mana spent to cast this spell"', () => {
  test('Converge: draw X cards and lose X life', () => {
    expect(
      readAll(
        'You draw X cards and lose X life, where X is the number of colors of mana spent to cast ~.',
        'sorcery',
      ).spell?.effect,
    ).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'draw', player: { kind: 'you' }, count: COLORS_X },
        { kind: 'loseLife', player: { kind: 'you' }, amount: COLORS_X },
      ],
    });
  });

  test('a value phrase of its own: gain life equal to the number of colors', () => {
    expect(
      readAll('You gain life equal to the number of colors of mana spent to cast ~.', 'sorcery')
        .spell?.effect,
    ).toEqual({ kind: 'gainLife', player: { kind: 'you' }, amount: COLORS_X });
  });

  test('the colors of the mana spent on another spell are not read: the line is dropped whole', () => {
    const first = dropped(
      'Whenever you cast a spell, draw X cards, where X is the number of colors of mana spent to cast that spell.',
      'enchantment',
    );
    expect(first.reason).toBe('notRunnable');
  });
});
