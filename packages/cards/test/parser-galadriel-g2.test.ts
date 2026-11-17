// The Galadriel deck (issue 43), group 2 (D-538 to D-546): the lines of Hobbit Hole, Multani, Ashaya, Thranduil // Silvan Rally and Bonny Pall. The first lines of each block are the real
// Oracle text of the acceptance cards of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC variants and the near misses the grammar must not read. The engine
// runs what is lowered in convert-grammar-engine-galadriel-g2.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { dropped, readAll, read as readFace, withoutFeature } from './parser-p5-helpers';

const NOT_READ = (text: string, type: Parameters<typeof readFace>[1] = 'creature') => {
  const parsed = readFace(text, type);
  expect(parsed.spell, text).toBeNull();
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.unparsed, text).toHaveLength(1);
};

const LANDS = { types: ['land'], controller: 'you' };
const LAND_CARDS = { zone: 'graveyard', types: ['land'], controller: 'you' };

describe('"for each land you control and each land card in your graveyard" (D-539, CR 608.2c, 613.4c)', () => {
  test('the real line of Multani: one sum of two counts, for power and for toughness', () => {
    const sum = {
      kind: 'sum',
      of: [
        { kind: 'countOf', filter: LANDS },
        { kind: 'countOf', filter: LAND_CARDS },
      ],
    };
    expect(
      readAll(
        '~ gets +1/+1 for each land you control and each land card in your graveyard.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'static',
        static: { kind: 'modifyPt', subject: { kind: 'this' }, power: sum, toughness: sum },
      },
    ]);
  });

  test('another pair of counts, said of an Aura (SYNTHETIC)', () => {
    expect(
      readAll(
        'Enchanted creature gets +1/+0 for each creature you control and each creature card in your graveyard.',
        'enchantment',
        ['Aura'],
      ).abilities,
    ).toHaveLength(1);
  });

  test('a single count is read as before, and the near misses are not read', () => {
    expect(readAll('~ gets +1/+1 for each land you control.', 'creature').abilities).toHaveLength(
      1,
    );
    for (const line of [
      '~ gets +1/+1 for each land you control and each.',
      '~ gets +1/+1 for each land you control and land card in your graveyard.',
      '~ gets +1/+1 for each land you control and each opponent.',
      '~ gets +1/+1 for each land you control and each land card in your graveyard and each card in your hand.',
      '~ gets +2/+2 for each land you control and each land card in your graveyard.',
      '~ gets +1/+1 for each land you control and each land card in your graveyard until end of turn.',
    ]) {
      NOT_READ(line);
    }
  });
});

describe('"Nontoken creatures you control are Forest lands in addition to their other types" (D-541, CR 205.1b, 305.6, 613.1d)', () => {
  const FORESTS = {
    kind: 'static',
    static: {
      kind: 'setTypes',
      subject: {
        kind: 'filter',
        filter: { types: ['creature'], token: false, controller: 'you' },
      },
      additive: true,
      subtypes: ['Forest'],
      types: ['land'],
    },
  };

  test('the real line of Ashaya: the land card type and a basic land type, added in layer 4', () => {
    expect(
      readAll(
        'Nontoken creatures you control are Forest lands in addition to their other types.',
        'creature',
      ).abilities,
    ).toEqual([FORESTS]);
  });

  test('another group and another basic land type (SYNTHETIC)', () => {
    expect(
      readAll('Creatures you control are Swamp lands in addition to their other types.', 'creature')
        .abilities,
    ).toMatchObject([{ static: { subtypes: ['Swamp'], types: ['land'], additive: true } }]);
  });

  test('the creature types of the older rule are read as before, and the near misses are not read', () => {
    expect(
      readAll(
        'Creatures you control are Zombies in addition to their other creature types.',
        'creature',
      ).abilities,
    ).toMatchObject([{ static: { subtypes: ['Zombie'], additive: true } }]);
    for (const line of [
      'Nontoken creatures you control are Forest lands.',
      'Nontoken creatures you control are Forest lands in addition to their other creature types.',
      'Nontoken creatures you control are forest lands in addition to their other types.',
      'Nontoken creatures you control are Desert lands in addition to their other types.',
      'Nontoken creatures you control are Forest land in addition to their other types.',
      'Nontoken creatures you control are Forest creatures in addition to their other types.',
    ]) {
      NOT_READ(line);
    }
  });

  test('the line names the features the engine lacks (D-068)', () => {
    const missing = withoutFeature(
      'static:setTypes',
      'Nontoken creatures you control are Forest lands in addition to their other types.',
      'creature',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('static:setTypes');
    expect(DECLARED_NEEDS).toContain('static:setTypes');
  });
});

describe('"Return two lands you control to their owner\'s hand: Return this card from your graveyard to your hand" (D-540, CR 602.2, 113.6b)', () => {
  const LINE =
    "{1}{G}, Return two lands you control to their owner's hand: Return this card from your graveyard to your hand.";

  test('the real line of Multani: an ability of the card that works from the graveyard, with the return of two lands in its cost', () => {
    expect(readAll(LINE, 'creature').abilities).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['1', 'G'] },
          { kind: 'returnToHand', what: LANDS, count: 2 },
        ],
        effect: { kind: 'moveToZone', objects: { kind: 'this' }, to: 'hand' },
        functionsIn: 'graveyard',
      },
    ]);
  });

  test('tapping or sacrificing in the cost, and returning the card itself, are not paid from a graveyard', () => {
    for (const line of [
      '{1}{G}, {T}: Return this card from your graveyard to your hand.',
      '{1}{G}, Sacrifice a land: Return this card from your graveyard to your hand.',
      "{1}{G}, Return ~ to its owner's hand: Return this card from your graveyard to your hand.",
      '{1}{G}, Discard a card: Return this card from your graveyard to your hand.',
    ]) {
      NOT_READ(line);
    }
  });
});

describe('"put up to two land cards from among them into your hand" (D-542, CR 608.2d, 701.17a)', () => {
  const LINE = 'Mill four cards, then put up to two land cards from among them into your hand.';

  test('the real line of Silvan Rally: a mill, then none up to two of the land cards it milled', () => {
    expect(readAll(LINE, 'sorcery').spell).toEqual({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'mill', player: { kind: 'you' }, count: 4 },
          {
            kind: 'moveToZone',
            objects: {
              kind: 'choose',
              filter: LAND_CARDS,
              count: 2,
              optional: true,
              fromMoved: true,
            },
            to: 'hand',
          },
        ],
      },
    });
  });

  test('other numbers, kinds and the return wording (SYNTHETIC)', () => {
    expect(
      readAll(
        'Mill five cards, then return up to three creature cards from among them to your hand.',
        'sorcery',
      ).spell,
    ).toMatchObject({
      effect: {
        effects: [
          { kind: 'mill', count: 5 },
          { objects: { count: 3, filter: { zone: 'graveyard', types: ['creature'] } }, to: 'hand' },
        ],
      },
    });
    expect(
      readAll(
        'Mill four cards, then put up to two Elf cards from among them into your hand.',
        'sorcery',
      ).spell,
    ).toMatchObject({
      effect: {
        effects: [{ kind: 'mill' }, { objects: { count: 2, filter: { subtypes: ['Elf'] } } }],
      },
    });
  });

  test('the one-card rule of the Danitha deck is read as before, and the near misses are not read', () => {
    expect(
      readAll('Mill four cards. You may put a land card from among them into your hand.', 'sorcery')
        .spell,
    ).toMatchObject({
      effect: { effects: [{ kind: 'mill' }, { objects: { fromMoved: true } }] },
    });
    for (const line of [
      'Mill four cards, then put up to one land card from among them into your hand.',
      'Mill four cards, then put up to one land cards from among them into your hand.',
      'Mill four cards, then put two land cards from among them into your hand.',
      'Mill four cards, then put up to two land cards from among them onto the battlefield.',
      'Mill four cards, then put up to two land cards from your graveyard into your hand.',
      'Mill four cards, then you may put up to two land cards from among them into your hand.',
      'Mill four cards, then put up to two land cards from among them into your hand and draw a card.',
      'Mill four cards, then put any number of land cards from among them into your hand.',
    ]) {
      NOT_READ(line, 'sorcery');
    }
    // Without a mill before it, "them" names nothing the engine knows.
    NOT_READ('Put up to two land cards from among them into your hand.', 'sorcery');
  });
});

describe('a legendary token whose power and toughness its own ability defines (D-543, CR 111.4, 208.2a, 604.3)', () => {
  const BEAU =
    'When ~ enters, create Beau, a legendary blue Ox creature token with "Beau\'s power and toughness are each equal to the number of lands you control."';

  test('the real line of Bonny Pall: the token has a star for power and toughness and the characteristic-defining ability', () => {
    const count = { kind: 'countOf', filter: LANDS };
    const [triggered] = readAll(BEAU, 'creature').abilities;
    expect(triggered).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: {
        kind: 'createToken',
        count: 1,
        token: {
          kind: 'custom',
          definition: {
            name: 'Beau',
            supertypes: ['legendary'],
            types: ['creature'],
            subtypes: ['Ox'],
            colors: ['U'],
            power: '*',
            toughness: '*',
            oracleText:
              "Beau's power and toughness are each equal to the number of lands you control.",
            abilities: [
              {
                kind: 'static',
                static: { kind: 'characteristicPt', power: count, toughness: count },
              },
            ],
          },
        },
      },
    });
  });

  test('a power alone and another count (SYNTHETIC)', () => {
    expect(
      readAll(
        'When ~ enters, create Hero, a legendary green Wolf creature token with "Hero\'s power is equal to the number of creatures you control."',
        'creature',
      ).abilities,
    ).toHaveLength(1);
  });

  test('the near misses are not read: numbers and an ability together, no ability, another ability, keywords', () => {
    for (const line of [
      'When ~ enters, create Beau, a legendary blue Ox creature token.',
      'When ~ enters, create Beau, a legendary blue Ox creature token with flying.',
      'When ~ enters, create Beau, a legendary 2/2 blue Ox creature token with "Beau\'s power and toughness are each equal to the number of lands you control."',
      'When ~ enters, create Beau, a legendary blue Ox creature token with "Beau gets +1/+1 for each land you control."',
      'When ~ enters, create Beau, a legendary blue Ox creature token with "Creatures you control get +1/+1."',
      'When ~ enters, create Beau, a legendary blue Ox creature token with flying and "Beau\'s power and toughness are each equal to the number of lands you control."',
      'When ~ enters, create Beau, a legendary blue Ox creature token with "Beau\'s power and toughness are each equal to the number of lands you control"',
      'When ~ enters, create Beau, a legendary blue Ox creature token with "Beau\'s power is equal to the number of lands you control and Beau\'s toughness is 3."',
    ]) {
      NOT_READ(line);
    }
  });

  test('a token with numbers keeps refusing a characteristic-defining ability', () => {
    expect(
      dropped(
        'When ~ enters, create Beau, a legendary 2/2 blue Ox creature token with "Beau\'s power and toughness are each equal to the number of lands you control."',
        'creature',
      ).reason,
    ).toBe('unrecognised');
  });
});

describe('"you may put a land card from your hand or graveyard onto the battlefield" (D-544, CR 608.2d, 110.2a)', () => {
  const LINE =
    'Whenever you attack, draw a card, then you may put a land card from your hand or graveyard onto the battlefield.';

  test('the real line of Bonny Pall: a card chosen among the cards of the two places', () => {
    expect(readAll(LINE, 'creature').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attackBatch', who: 'you', atLeast: 1 },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'draw', player: { kind: 'you' }, count: 1 },
            {
              kind: 'moveToZone',
              objects: {
                kind: 'choose',
                filter: { zone: 'hand', types: ['land'], controller: 'you' },
                optional: true,
                alsoGraveyard: true,
              },
              to: 'battlefield',
            },
          ],
        },
      },
    ]);
  });

  test('the single zones are read as before, tapped and attacking too', () => {
    const one = readAll(
      'Whenever you attack, you may put a land card from your hand onto the battlefield.',
      'creature',
    );
    expect(JSON.stringify(one.abilities)).not.toContain('alsoGraveyard');
    expect(
      readAll(
        'Whenever you attack, put a creature card from your hand or graveyard onto the battlefield tapped.',
        'creature',
      ).abilities,
    ).toMatchObject([{ effect: { objects: { alsoGraveyard: true }, tapped: true } }]);
    // "Tapped and attacking" is the engine's `enterAttacking` of what was put, for the cards of both places as for one.
    expect(
      JSON.stringify(
        readAll(
          'Whenever you attack, you may put a creature card from your hand or graveyard onto the battlefield tapped and attacking.',
          'creature',
        ).abilities,
      ),
    ).toContain('enterAttacking');
  });

  test('the near misses are not read', () => {
    for (const line of [
      'Whenever you attack, you may put a land card from your graveyard or hand onto the battlefield.',
      'Whenever you attack, you may put a land card from your hand or library onto the battlefield.',
      'Whenever you attack, you may put a land card from your hand or your graveyard onto the battlefield.',
      'Whenever you attack, you may put a land card from your hand or graveyard into your hand.',
      'Whenever you attack, you may put two land cards from your hand or graveyard onto the battlefield.',
    ]) {
      NOT_READ(line);
    }
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('ability:chooseAlsoGraveyard', LINE, 'creature');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('ability:chooseAlsoGraveyard');
    expect(DECLARED_NEEDS).toContain('ability:chooseAlsoGraveyard');
  });
});

describe('"Halflingcycling {4}" (D-538, CR 702.29e)', () => {
  test('the real line of Hobbit Hole: a search of the library for a card with the creature type', () => {
    expect(readAll('Halflingcycling {4}', 'land').abilities).toEqual([
      {
        kind: 'keyword',
        keyword: {
          kind: 'typecycling',
          filter: { subtypes: ['Halfling'] },
          cost: [{ kind: 'mana', symbols: ['4'] }],
        },
      },
    ]);
  });

  test('another type, and the lines that are not typecycling are not read', () => {
    expect(readAll('Slivercycling {3}', 'land').abilities).toMatchObject([
      { keyword: { filter: { subtypes: ['Sliver'] } } },
    ]);
    for (const line of [
      'Halflingcycling',
      'Halflingcycling {X}',
      'Halflingcycling—Pay 2 life',
      'halflingcycling {4}',
      'Halflingscycling {4}',
      'Notatypecycling {4}',
    ]) {
      NOT_READ(line, 'land');
    }
  });
});
