// Issue 89 (Silverquill Influence), "When ~ enters, exile the top eight cards of your library. You may cast an Aura spell from among them without paying its mana cost. Then put the
// rest on the bottom of your library in a random order." (D-605; Herald of Amity) read through the whole pipeline: the real line, the nodes it lowers to and the near misses.
// The engine runs what is lowered in packages/engine/test/scenario-xx-exile-cast-aura.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const line =
  'When ~ enters, exile the top eight cards of your library. You may cast an Aura spell from among them without paying its mana cost. Then put the rest on the bottom of your library in a random order.';

describe('Herald of Amity (CR 701.13, 608.2g, 401.4)', () => {
  test('the real second line of Herald of Amity', () => {
    const abilities = readAll(`Vigilance\n${line}`, 'creature').abilities;
    expect(abilities[1]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exileTop', count: 8 },
          { kind: 'castFree', objects: { kind: 'moved' }, filter: { subtypes: ['Aura'] } },
          {
            kind: 'moveToZone',
            objects: { kind: 'moved' },
            to: 'library',
            position: 'bottom',
            random: true,
          },
        ],
      },
    });
  });

  test.each([
    [
      'When ~ enters, exile the top eight cards of your library. You may cast an Aura spell from among them without paying its mana cost. Then put the rest on the bottom of your library in any order.',
    ],
    [
      'When ~ enters, exile the top eight cards of your library. You may cast two Aura spells from among them without paying their mana costs.',
    ],
    ['When ~ enters, you may cast an Aura spell from among them without paying its mana cost.'],
    ['When ~ enters, put the rest on the bottom of your library in a random order.'],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature').stoppedAt).toBeDefined();
  });
});
