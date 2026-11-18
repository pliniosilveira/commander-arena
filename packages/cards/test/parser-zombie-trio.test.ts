// Dread Summons, Forgotten Creation and Liliana, Death's Majesty (issue 104): what the grammar lowers for the three lines, and the near misses it must refuse.
// The engine runs the lowered nodes in convert-grammar-engine-zombie-trio.test.ts. Pins: CR 701.17a (Mill), CR 701.9 (Discard), CR 608.2c, CR 611.2a.
import { describe, expect, test } from 'vitest';
import { readAll as readAllFace, read as readFace } from './parser-p5-helpers';

type Type = Parameters<typeof readFace>[1];

const readAll = (text: string, type: Type = 'sorcery') => readAllFace(text, type);
const NOT_READ = (text: string, type: Type = 'sorcery') => {
  const parsed = readFace(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.spell, text).toBeFalsy();
  expect(parsed.unparsed, text).toHaveLength(1);
};

describe('"For each creature card put into a graveyard this way, you create a tapped 2/2 black Zombie creature token."', () => {
  const MILL = 'Each player mills X cards.';
  const TOKEN = 'you create a tapped 2/2 black Zombie creature token';

  test('the real text of Dread Summons counts the creature cards the mill put into graveyards', () => {
    const { spell } = readAll(
      `${MILL} For each creature card put into a graveyard this way, ${TOKEN}.`,
    );
    expect(spell).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'mill', player: { kind: 'eachPlayer' } },
          { kind: 'createToken', count: { kind: 'thisWay', what: 'milledCreature' } },
        ],
      },
    });
  });

  test.each([
    // no mill before it
    `For each creature card put into a graveyard this way, ${TOKEN}.`,
    // another verb before it
    `Draw a card. For each creature card put into a graveyard this way, ${TOKEN}.`,
    // not a creature card, not "this way"
    `${MILL} For each card put into a graveyard this way, ${TOKEN}.`,
    `${MILL} For each land card put into a graveyard this way, ${TOKEN}.`,
    `${MILL} For each creature card put into a graveyard, ${TOKEN}.`,
  ])('not read: %s', (text) => {
    NOT_READ(text);
  });
});

describe('"You may discard all the cards in your hand. If you do, draw that many cards."', () => {
  test('the real text of Forgotten Creation: the offer, then a draw of what it discarded', () => {
    const { abilities } = readAll(
      'At the beginning of your upkeep, you may discard all the cards in your hand. If you do, draw that many cards.',
      'creature',
    );
    expect(abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'may', effect: { kind: 'discard', count: 0, hand: true } },
            {
              kind: 'conditional',
              condition: { kind: 'didPrevious' },
              effect: { kind: 'draw', count: { kind: 'thisWay', what: 'discarded' } },
            },
          ],
        },
      },
    ]);
  });

  test('without the offer: the whole hand, then that many cards (SYNTHETIC sibling)', () => {
    expect(
      readAll('Discard all the cards in your hand, then draw that many cards.').spell,
    ).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'discard', hand: true },
          { kind: 'draw', count: { kind: 'thisWay', what: 'discarded' } },
        ],
      },
    });
  });

  test.each([
    'Discard all cards in your hand, then draw that many cards.',
    'Draw a card. If you do, draw that many cards.',
    'Discard your hand, then draw that many cards.',
  ])('not read: %s', (text) => {
    NOT_READ(text);
  });
});

describe('"Return target creature card from your graveyard to the battlefield. That creature is a black Zombie in addition to its other colors and types."', () => {
  test('the sentence of the real -3 of Liliana (as a spell): the returned permanent gets the color and type for good (CR 611.2a, no duration)', () => {
    const { spell } = readAll(
      'Return target creature card from your graveyard to the battlefield. That creature is a black Zombie in addition to its other colors and types.',
    );
    expect(spell).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'moveToZone', to: 'battlefield' },
          {
            kind: 'setColors',
            objects: { kind: 'moved' },
            colors: ['B'],
            additive: true,
            duration: 'permanent',
          },
          {
            kind: 'setTypes',
            objects: { kind: 'moved' },
            subtypes: ['Zombie'],
            additive: true,
            duration: 'permanent',
          },
        ],
      },
    });
  });

  test.each([
    // nothing was put onto the battlefield before it
    'That creature is a black Zombie in addition to its other colors and types.',
    'Draw a card. That creature is a black Zombie in addition to its other colors and types.',
    // not a creature type
    'Return target creature card from your graveyard to the battlefield. That creature is a black Elf in addition to its other types.',
  ])('not read: %s', (text) => {
    NOT_READ(text);
  });
});
