// "Creatures you control get +X/+X, where X is the number of cards you've drawn this turn." (issue 128, Knowledge Is Power;
// CR 121.1 Drawing a Card, 608.2h: the cards the controller has drawn so far this turn).
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

describe('where X is the number of cards you have drawn this turn', () => {
  test('reads Knowledge Is Power', () => {
    const read = readAll(
      "Creatures you control get +X/+X, where X is the number of cards you've drawn this turn.",
      'enchantment',
      [],
    );
    expect(read.abilities).toHaveLength(1);
    expect(JSON.stringify(read.abilities[0])).toContain('cardsDrawnThisTurn');
  });

  test('another player, or all game, stays unread', () => {
    expect(
      dropped(
        'Creatures you control get +X/+X, where X is the number of cards an opponent has drawn this turn.',
        'enchantment',
        [],
      ),
    ).toBeTruthy();
  });
});
