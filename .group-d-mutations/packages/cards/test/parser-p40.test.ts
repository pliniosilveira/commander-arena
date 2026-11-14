// Stage P40 (M55): the Korvold deck's keywords slice, read by the grammar (D-186; the engine's Encore, Devour and Riot, the group "can't be countered",
// D-185, ENGINE_VERSION 41). The lines of `REAL` are the real Oracle text of the three cards of the slice (the owner's request file of 2026-10-29), names
// replaced by ~, each with the nodes the grammar produces for it; the other tests read lines that say the same things over other numbers and costs, and the
// lines a rule must not read (flagged, never half run). Every sibling and refused line is SYNTHETIC. The engine runs what is lowered in
// convert-grammar-engine-p40.test.ts; a missing engine feature is named in parser-p40-needs.test.ts.
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const DRAGON = {
  kind: 'custom',
  definition: {
    name: 'Dragon',
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R', 'G'],
    power: 1,
    toughness: 1,
    loyalty: null,
    defense: null,
    oracleText: '',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'flying' } },
      { kind: 'keyword', keyword: { kind: 'devour', count: 2 } },
    ],
  },
};

describe('the three real cards of the slice read as the engine runs them (D-185, D-186)', () => {
  test('Impulsive Pilferer: the dies trigger and Encore with its mana cost', () => {
    const parsed = readAll(
      'When this creature dies, create a Treasure token.\nEncore {3}{R}',
      'creature',
      ['Goblin', 'Pirate'],
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'this' } },
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
      },
      {
        kind: 'keyword',
        keyword: { kind: 'encore', cost: [{ kind: 'mana', symbols: ['3', 'R'] }] },
      },
    ]);
  });

  test('Dragon Broodmother: a token with flying and devour 2 at the beginning of each upkeep', () => {
    const parsed = readAll(
      'Flying\nAt the beginning of each upkeep, create a 1/1 red and green Dragon creature token with flying and devour 2.',
      'creature',
      ['Dragon'],
    );
    expect(parsed.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'each' },
        effect: { kind: 'createToken', token: DRAGON, count: 1 },
      },
    ]);
  });

  test("Rhythm of the Wild: the group's spells are not countered, and its nontoken creatures have riot", () => {
    const parsed = readAll(
      "Creature spells you control can't be countered.\nNontoken creatures you control have riot.",
      'enchantment',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'spellsCantBeCountered',
          spells: { types: ['creature'], controller: 'you' },
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], token: false, controller: 'you' },
          },
          keyword: { kind: 'riot' },
        },
      },
    ]);
  });
});

describe('Encore (CR 702.141a)', () => {
  test.each([
    ['Encore {3}{R}', ['3', 'R']],
    ['Encore {2}{B}{B}', ['2', 'B', 'B']],
    ['Encore {4}', ['4']],
  ])('%s is the keyword with its mana cost', (text, symbols) => {
    expect(readAll(text, 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'encore', cost: [{ kind: 'mana', symbols }] } },
    ]);
  });

  test.each([
    'Encore {X}',
    'Encore—Pay 2 life.',
    'Encore',
    'Flying, encore {3}{R}',
    'Encore {3}{R}, haste',
  ])('%s stays unread', (text) => {
    expect(dropped(text, 'creature').reason).toBe('unrecognised');
  });
});

describe('Devour N and Riot (CR 702.82a, 702.136a)', () => {
  test('"Devour 2" and "Riot" are keywords; in a list too', () => {
    expect(readAll('Devour 2', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'devour', count: 2 } },
    ]);
    expect(readAll('Riot', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'riot' } },
    ]);
    expect(readAll('Trample, riot', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'trample' } },
      { kind: 'keyword', keyword: { kind: 'riot' } },
    ]);
  });

  test.each(['Devour', 'Devour 0', 'Devour X', 'Devour two', 'Devour artifact 2', 'Riot {1}'])(
    '%s stays unread',
    (text) => {
      expect(dropped(text, 'creature').reason).toBe('unrecognised');
    },
  );

  test('a token with one keyword and devour; the longer lists stay unread, and the whole token with them', () => {
    expect(
      readAll(
        'When ~ enters, create a 2/2 red Goblin creature token with first strike and devour 1.',
        'creature',
      ).abilities[0],
    ).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'createToken',
        token: {
          definition: {
            abilities: [
              { kind: 'keyword', keyword: { kind: 'firstStrike' } },
              { kind: 'keyword', keyword: { kind: 'devour', count: 1 } },
            ],
          },
        },
      },
    });
    expect(
      dropped(
        'When ~ enters, create a 2/2 red Goblin creature token with flying, trample, and devour 1.',
        'creature',
      ).reason,
    ).toBe('unrecognised');
  });
});

describe('"Creature spells you control can\'t be countered." and its siblings (CR 101.2, 701.6a)', () => {
  test.each([
    ["Spells you control can't be countered.", { controller: 'you' }],
    [
      "Noncreature spells you control can't be countered.",
      { notTypes: ['creature'], controller: 'you' },
    ],
    ["Dragon spells you control can't be countered.", { subtypes: ['Dragon'], controller: 'you' }],
  ])('%s', (text, spells) => {
    expect(readAll(text, 'enchantment').abilities).toEqual([
      { kind: 'static', static: { kind: 'spellsCantBeCountered', spells } },
    ]);
  });

  test.each([
    "Creature spells can't be countered.",
    "Creature spells your opponents control can't be countered.",
    "Creature spells you cast can't be countered.",
    "Creature spells you control can't be countered unless they target a player.",
  ])('%s stays unread', (text) => {
    expect(dropped(text, 'enchantment').reason).toBe('unrecognised');
  });

  test('the spell\'s own "can\'t be countered" is still the restriction of the spell itself', () => {
    expect(readAll("~ can't be countered.", 'creature').abilities).toEqual([
      {
        kind: 'static',
        static: { kind: 'restriction', subject: { kind: 'this' }, restriction: 'cantBeCountered' },
      },
    ]);
  });
});

describe('riot given by a spell or to an attached permanent is read and not run', () => {
  const messages = (oracleText: string, typeLine: string) =>
    validateCard(
      parseOnly(
        syntheticCard({ name: 'SYNTHETIC Riot Giver', manaCost: '{1}{R}', typeLine, oracleText }),
      ).definition as CardDefinition,
    ).map((i) => i.message);

  test('"Target creature gains riot until end of turn": a creature that entered has no choice left to make, so the engine refuses the effect', () => {
    expect(messages('Target creature gains riot until end of turn.', 'Instant')).toContain(
      'riot is given by a static ability of a permanent, not by an effect',
    );
  });

  test('"Equipped creature has riot": an attached permanent entered already, so the engine refuses the static ability', () => {
    expect(messages('Equipped creature has riot.\nEquip {1}', 'Artifact — Equipment')).toContain(
      'riot is given to a group of permanents, as they enter',
    );
  });
});
