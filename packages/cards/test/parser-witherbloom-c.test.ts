import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

describe('Witherbloom Witchcraft group C: "each ... with mana value X or less"', () => {
  test('a sweeper reads the X announced for the spell', () => {
    const p = readAll('Destroy each nonland permanent with mana value X or less.', 'sorcery');
    expect(p.spell).toMatchObject({
      effect: {
        kind: 'destroy',
        objects: {
          kind: 'each',
          filter: { notTypes: ['land'], manaValueAtMost: { kind: 'x' } },
        },
      },
    });
  });

  test('a triggered ability has no X announced: the line stays unread', () => {
    const d = dropped(
      'When ~ enters, destroy each nonland permanent with mana value X or less.',
      'creature',
    );
    expect(d.closestRule).toBeDefined();
  });
});
