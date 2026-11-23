// The cost changes of the Scions of Spellcraft deck, group D: what the grammar writes for "The second spell you cast each turn costs {2} less to cast." (Alisaie Leveilleur),
// "Spells you cast from your graveyard cost {2} less to cast." (Emet-Selch of the Third Seat, first ability), "~ costs {3} less to cast if an opponent has seven or more cards in
// their graveyard." (Into the Story), "As long as you've cast two or more noncreature spells this turn, ~ has double strike." (Lyse Hext) and "If you control a Swamp, you may pay 4
// life rather than pay ~'s mana cost." (Snuff Out). The lines are the real Oracle wordings (names replaced by ~); the near misses must stay unread. The engine runs what is lowered
// in convert-grammar-engine-scions-d.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const abilities = (text: string, type: FaceType = 'creature') => readAll(text, type).abilities;

describe('the nth spell each turn', () => {
  test('"The second spell you cast each turn costs {2} less to cast."', () => {
    expect(abilities('The second spell you cast each turn costs {2} less to cast.')).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { controller: 'you', nthSpellThisTurn: 2 },
          amount: 2,
        },
      },
    ]);
  });

  test('the third, and a count of what is on the permanent', () => {
    expect(abilities('The third spell you cast each turn costs {1} less to cast.')).toMatchObject([
      { static: { spells: { nthSpellThisTurn: 3 }, amount: 1 } },
    ]);
  });

  test.each([
    'The first spell you cast each turn costs {2} less to cast.',
    'The second spell your opponents cast each turn costs {2} less to cast.',
    'The second spell you cast each turn costs {2} more to cast.',
    'The second spell you cast each turn costs {W} less to cast.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'creature').text).toBe(text);
  });
});

describe('spells cast from your graveyard', () => {
  test('"Spells you cast from your graveyard cost {2} less to cast."', () => {
    expect(abilities('Spells you cast from your graveyard cost {2} less to cast.')).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { controller: 'you', castFromOwnGraveyard: true },
          amount: 2,
        },
      },
    ]);
  });

  test.each([
    'Spells you cast from a graveyard cost {2} less to cast.',
    'Spells your opponents cast from your graveyard cost {2} less to cast.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'creature').text).toBe(text);
  });
});

describe("an opponent's graveyard", () => {
  test('"~ costs {3} less to cast if an opponent has seven or more cards in their graveyard."', () => {
    const { abilities: read } = readAll(
      '~ costs {3} less to cast if an opponent has seven or more cards in their graveyard.',
      'instant',
    );
    expect(read).toEqual([
      {
        kind: 'static',
        static: { kind: 'costReduction', spells: { kind: 'this' }, amount: 3 },
        condition: {
          kind: 'cardsInGraveyard',
          compare: { cmp: 'atLeast', value: 7 },
          player: 'anOpponent',
        },
      },
    ]);
  });

  test.each([
    '~ costs {3} less to cast if an opponent has seven or more creature cards in their graveyard.',
    '~ costs {3} less to cast if each opponent has seven or more cards in their graveyard.',
    '~ costs {3} less to cast if an opponent has seven cards in their graveyard.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'instant').text).toBe(text);
  });
});

describe('noncreature spells this turn, as a static condition', () => {
  test('"As long as you\'ve cast two or more noncreature spells this turn, ~ has double strike."', () => {
    expect(
      abilities(
        "As long as you've cast two or more noncreature spells this turn, ~ has double strike.",
      ),
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'this' },
          keyword: { kind: 'doubleStrike' },
        },
        condition: { kind: 'spellsCastThisTurn', atLeast: 2, notOfTypes: ['creature'] },
      },
    ]);
  });

  test.each([
    "As long as you've cast a noncreature spell this turn, ~ has double strike.",
    "As long as you've cast two or more instant spells this turn, ~ has double strike.",
    'As long as an opponent has cast two or more noncreature spells this turn, ~ has double strike.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'creature').text).toBe(text);
  });
});

describe('pay life rather than the mana cost', () => {
  test('"If you control a Swamp, you may pay 4 life rather than pay ~\'s mana cost."', () => {
    const parsed = readAll(
      "If you control a Swamp, you may pay 4 life rather than pay ~'s mana cost.",
      'instant',
    );
    expect(parsed.alternativeCosts).toEqual([
      {
        kind: 'payLife',
        cost: [{ kind: 'mana', symbols: ['0'] }],
        life: 4,
        condition: {
          kind: 'controlsAtLeast',
          filter: { subtypes: ['Swamp'] },
          count: 1,
        },
      },
    ]);
  });

  test('with no condition the alternative is always allowed', () => {
    const parsed = readAll("You may pay 2 life rather than pay ~'s mana cost.", 'instant');
    expect(parsed.alternativeCosts).toEqual([
      { kind: 'payLife', cost: [{ kind: 'mana', symbols: ['0'] }], life: 2 },
    ]);
  });

  test.each([
    "If you control a Swamp, you may pay 4 life instead of paying ~'s mana cost.",
    "If you control a Swamp, you may pay {B} and 4 life rather than pay ~'s mana cost.",
    "If an opponent controls a Swamp, you may pay 4 life rather than pay ~'s mana cost.",
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'instant').text).toBe(text);
  });
});
