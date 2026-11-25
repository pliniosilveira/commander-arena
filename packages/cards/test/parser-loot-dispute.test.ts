// Loot Dispute (CR 726.1, 508.1b, 603.2c, 309.7, 701.49c): "Whenever you attack the player who has the initiative, create a Treasure token." and the ability-word line "Loud Ruckus —
// Whenever you complete a dungeon, create a 5/5 red Dragon creature token with flying." The lines are the real Oracle text; the SYNTHETIC lines are near misses.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const enchantment = (text: string) => readAll(text, 'enchantment', []).abilities;
const droppedEnchantment = (text: string) => dropped(text, 'enchantment', []).text;

const ATTACK = 'Whenever you attack the player who has the initiative, create a Treasure token.';
const COMPLETE =
  'Loud Ruckus — Whenever you complete a dungeon, create a 5/5 red Dragon creature token with flying.';

describe('"Whenever you attack the player who has the initiative, create a Treasure token."', () => {
  test('the real line: an attackBatch trigger that needs the holder attacked', () => {
    expect(enchantment(ATTACK)).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attackBatch', who: 'you', atLeast: 1, attackedInitiativeHolder: true },
        effect: {
          kind: 'createToken',
          token: { kind: 'preset', preset: 'Treasure' },
          count: 1,
        },
      },
    ]);
  });

  test.each([
    'Whenever you attack the player who has the initiative or the monarch, create a Treasure token.',
    'Whenever you attack a player who has the initiative, create a Treasure token.',
    'Whenever you attack the player who has the monarch, create a Treasure token.',
    'Whenever you attack the player who has the initiative with two or more creatures, create a Treasure token.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(droppedEnchantment(text)).toBe(text);
  });
});

describe('"Loud Ruckus — Whenever you complete a dungeon, create a 5/5 red Dragon creature token with flying."', () => {
  test('the real line: a dungeonCompleted trigger and a Dragon token', () => {
    const abilities = enchantment(COMPLETE);
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'dungeonCompleted' },
      effect: {
        kind: 'createToken',
        count: 1,
        token: {
          kind: 'custom',
          definition: { name: 'Dragon', power: 5, toughness: 5, colors: ['R'] },
        },
      },
    });
  });

  test.each([
    'Whenever you complete a dungeon or draw a card, create a Treasure token.',
    'Whenever an opponent completes a dungeon, create a Treasure token.',
    'Whenever you complete the dungeon, create a Treasure token.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(droppedEnchantment(text)).toBe(text);
  });
});
