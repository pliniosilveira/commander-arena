// The Prismari deck (issue 87), group 3 (D-652 and later): the real lines of the seven cards read through the whole pipeline, and near misses the grammar must not read (another number,
// another destination, a cast that is not the player's choice, a sentence read after an instruction that does not make it true). The engine plays what is lowered in
// convert-grammar-engine-prismari-g3.test.ts and in the engine scenario tests.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read, readAll } from './parser-p5-helpers';

const NOT_READ = (text: string, type: Parameters<typeof read>[1] = 'sorcery') => {
  const parsed = read(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.spell ?? null, text).toBeNull();
  expect(parsed.unparsed, text).toHaveLength(1);
};
const MOVED = { kind: 'moved' } as const;

describe('Abstract Performance: two piles, an opponent chooses, one spell cast free, the rest to the hand', () => {
  const REAL =
    'Exile the top four cards of your library in a face-down pile, then exile the top four cards of your library in a face-up pile. An opponent chooses one of those piles. Put that pile into your graveyard. Look at the cards in the other pile. You may cast a spell from among them without paying its mana cost. Put the rest into your hand.';
  test('the real text', () => {
    expect(readAll(REAL, 'sorcery').spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'exilePiles', count: 4, chosenTo: 'graveyard' },
        { kind: 'castFree', objects: MOVED },
        { kind: 'moveToZone', objects: MOVED, to: 'hand' },
      ],
    });
  });
  test('near misses', () => {
    NOT_READ(
      REAL.replace('face-up pile. An', 'face-up pile. You choose one of those piles. An').replace(
        'An opponent chooses',
        'You choose',
      ),
    );
    NOT_READ(REAL.replace('into your graveyard', 'into your hand'));
    NOT_READ('You may cast a spell from among them without paying its mana cost.');
    NOT_READ('Put the rest into your hand.');
  });
});

describe('Creative Technique and Dance with Calamity', () => {
  test('reveal until a nonland card, exile it, cast it', () => {
    expect(
      readAll(
        'Shuffle your library, then reveal cards from the top of it until you reveal a nonland card. Exile that card and put the rest on the bottom of your library in a random order. You may cast the exiled card without paying its mana cost.',
        'sorcery',
      ).spell?.effect,
    ).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'shuffle', player: { kind: 'you' } },
        { kind: 'revealUntil', filter: { notTypes: ['land'] }, put: 'exile' },
        { kind: 'castFree', objects: MOVED },
      ],
    });
  });
  test('exile as many times as chosen, then a conditional cast of any number of spells', () => {
    const REAL =
      'Shuffle your library. As many times as you choose, you may exile the top card of your library. If the total mana value of the cards exiled this way is 13 or less, you may cast any number of spells from among those cards without paying their mana costs.';
    expect(readAll(REAL, 'sorcery').spell?.effect).toMatchObject({
      effects: [
        { kind: 'shuffle' },
        { kind: 'exileTopAnyNumber' },
        {
          kind: 'conditional',
          condition: { kind: 'movedTotalManaValue', compare: { cmp: 'atMost', value: 13 } },
          effect: { kind: 'castFree', objects: MOVED, max: 'any' },
        },
      ],
    });
    NOT_READ(REAL.replace('13 or less', '13 or more'));
    NOT_READ(
      'If the total mana value of the cards exiled this way is 13 or less, you may cast any number of spells from among those cards without paying their mana costs.',
    );
  });
});

describe('Plargg and Nassari, Surge to Victory, Throes of Chaos', () => {
  test('Plargg and Nassari: each player exiles until a nonland card, an opponent chooses, up to two are cast', () => {
    const parsed = readAll(
      'At the beginning of your upkeep, each player exiles cards from the top of their library until they exile a nonland card. An opponent chooses a nonland card exiled this way. You may cast up to two spells from among the other cards exiled this way without paying their mana costs.',
      'creature',
    );
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: {
        effects: [
          { kind: 'exileUntilFound', players: { kind: 'eachPlayer' } },
          { kind: 'opponentChoosesCard' },
          { kind: 'castFree', objects: MOVED, max: 2 },
        ],
      },
    });
  });
  test('"the other cards" are read only after the opponent chose', () => {
    NOT_READ(
      'You may cast up to two spells from among the other cards exiled this way without paying their mana costs.',
    );
  });
  test('Surge to Victory: the delayed ability copies the card the spell exiled', () => {
    const effect = readAll(
      "Exile target instant or sorcery card from your graveyard. Creatures you control get +X/+0 until end of turn, where X is that card's mana value. Whenever a creature you control deals combat damage to a player this turn, copy the exiled card. You may cast the copy without paying its mana cost.",
      'sorcery',
    ).spell?.effect;
    expect(effect).toMatchObject({
      effects: [
        { kind: 'exile' },
        { kind: 'modifyPt' },
        {
          kind: 'delayedCombatDamageTurn',
          filter: { types: ['creature'], controller: 'you' },
          effect: { kind: 'copyCardAndCast', objects: MOVED },
        },
      ],
    });
    NOT_READ(
      'Whenever a creature you control deals combat damage to a player this turn, copy the exiled card. You may cast the copy without paying its mana cost.',
    );
  });
  test('Retrace and Demonstrate are keywords with no parameter', () => {
    expect(readAll('Cascade\nRetrace', 'sorcery').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'cascade' } },
      { kind: 'keyword', keyword: { kind: 'retrace' } },
    ]);
    expect(readAll('Demonstrate', 'sorcery').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'demonstrate' } },
    ]);
    NOT_READ('Retrace {1}{R}');
    NOT_READ('Demonstrate 2');
  });
});
