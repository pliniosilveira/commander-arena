// The Sliver Swarm deck, group C: "of the chosen type" over the cards looked at or cast from the top of the library. The lines of the first three tests are the real
// Oracle wordings of Icon of Ancestry, For the Ancestors and Realmwalker (names replaced by ~ where they said their own); the rest are near misses the grammar must not read.
// The engine runs what is lowered in packages/engine/test/scenario-xx-sliver-c.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

describe('look at the top cards, take the cards of the chosen type', () => {
  test('one creature card of the chosen type (real: Icon of Ancestry)', () => {
    const parsed = readAll(
      'As ~ enters, choose a creature type.\n{3}, {T}: Look at the top three cards of your library. You may reveal a creature card of the chosen type from among them and put it into your hand. Put the rest on the bottom of your library in a random order.',
      'artifact',
    );
    expect(parsed.abilities[1]).toMatchObject({
      kind: 'activated',
      effect: {
        kind: 'lookAtTop',
        count: 3,
        take: { filter: { types: ['creature'], chosenType: true }, max: 1 },
        rest: 'bottomRandom',
      },
    });
  });

  test('any number of cards of the chosen type, after the choice (real: For the Ancestors)', () => {
    const parsed = readAll(
      'Choose a creature type. Look at the top six cards of your library. You may reveal any number of cards of the chosen type from among them and put the revealed cards into your hand. Put the rest on the bottom of your library in a random order.',
      'instant',
    );
    expect(parsed.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'chooseCreatureType' },
        {
          kind: 'lookAtTop',
          count: 6,
          take: { filter: { chosenType: true }, max: 6 },
          rest: 'bottomRandom',
        },
      ],
    });
  });

  test('the same over another count and the order of the player', () => {
    const parsed = readAll(
      'Choose a creature type. Look at the top four cards of your library. You may reveal any number of cards of the chosen type from among them and put the revealed cards into your hand. Put the rest on the bottom of your library in any order.',
      'instant',
    );
    expect(parsed.spell?.effect).toMatchObject({
      effects: [
        { kind: 'chooseCreatureType' },
        { count: 4, take: { max: 4 }, rest: 'bottomChosen' },
      ],
    });
  });

  test('near misses are not read', () => {
    for (const text of [
      // the revealed cards go somewhere else
      'Choose a creature type. Look at the top six cards of your library. You may reveal any number of cards of the chosen type from among them and put the revealed cards onto the battlefield. Put the rest on the bottom of your library in a random order.',
      // a count that is not a number
      'Choose a creature type. Look at the top X cards of your library. You may reveal any number of cards of the chosen type from among them and put the revealed cards into your hand. Put the rest on the bottom of your library in a random order.',
      // the rest is not said
      'Choose a creature type. Look at the top six cards of your library. You may reveal any number of cards of the chosen type from among them and put the revealed cards into your hand.',
      // a kind that is not "of the chosen type"
      'Choose a creature type. Look at the top six cards of your library. You may reveal any number of cards of that kind from among them and put the revealed cards into your hand. Put the rest on the bottom of your library in a random order.',
    ]) {
      expect(dropped(text, 'instant').text, text).toBeDefined();
    }
  });
});

describe('cast creature spells of the chosen type from the top of the library', () => {
  test('real: Realmwalker', () => {
    const parsed = readAll(
      'As ~ enters, choose a creature type.\nYou may look at the top card of your library any time.\nYou may cast creature spells of the chosen type from the top of your library.',
      'creature',
      ['Shapeshifter'],
    );
    expect(parsed.abilities).toContainEqual({
      kind: 'static',
      static: {
        kind: 'castFromTopOfLibrary',
        spells: { types: ['creature'], chosenType: true },
      },
    });
  });

  test('near misses are not read', () => {
    for (const text of [
      'You may cast creature spells of the chosen type from the top of your graveyard.',
      'You may cast creature spells of the chosen color from the top of your library.',
      'You may cast creature spells of the chosen type of your library.',
    ]) {
      expect(dropped(text, 'creature').text, text).toBeDefined();
    }
  });
});
