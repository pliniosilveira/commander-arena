import { describe, expect, test } from 'vitest';
import { dropped, read, readAll } from './parser-p5-helpers';

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

describe('Witherbloom Witchcraft group C: one card of each permanent type, then "for each card returned this way"', () => {
  const TEXT =
    'For each permanent type, return up to one card of that type from your graveyard to the battlefield. You lose 3 life for each card returned this way. Exile ~.';

  test('the three sentences are one spell: six optional graveyard choices, the life loss and the exile', () => {
    const p = readAll(TEXT, 'sorcery');
    const effects = p.spell?.effect;
    expect(effects).toMatchObject({ kind: 'sequence' });
    const list = effects?.kind === 'sequence' ? effects.effects : [];
    expect(list.slice(0, 6).map((e) => e)).toEqual(
      ['artifact', 'battle', 'creature', 'enchantment', 'land', 'planeswalker'].map((t) => ({
        kind: 'moveToZone',
        objects: {
          kind: 'choose',
          filter: { zone: 'graveyard', types: [t], controller: 'you' },
          optional: true,
        },
        to: 'battlefield',
      })),
    );
    expect(list[6]).toMatchObject({
      kind: 'loseLife',
      amount: { kind: 'multiple', factor: 3, of: { kind: 'thisWay', what: 'returned' } },
    });
    expect(list[7]).toEqual({ kind: 'exile', objects: { kind: 'thisSpell' } });
  });

  test('"for each card returned this way" with no return before it is not read', () => {
    const d = dropped('You lose 3 life for each card returned this way.', 'sorcery');
    expect(d.closestRule).toBeDefined();
  });

  test.each([
    'For each permanent type, return up to one card of that type from your graveyard to your hand.',
    'For each card type, return up to one card of that type from your graveyard to the battlefield.',
  ])('%s is not read as the return of one card per permanent type', (text) => {
    expect(read(text, 'sorcery').unparsed.length).toBeGreaterThan(0);
  });
});
