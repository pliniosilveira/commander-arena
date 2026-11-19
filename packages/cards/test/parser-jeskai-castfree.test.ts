// The Jeskai free-cast cards (deck support issue 100): Electrodominance and its relatives, read through the whole grammar. The first line of each describe is the
// real Oracle text of the acceptance card of the golden corpus (names replaced by ~); the other lines are SYNTHETIC siblings and near misses. The engine runs what is
// lowered in convert-grammar-engine-jeskai-castfree.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const X = { kind: 'x' } as const;
const FROM_HAND = (filter: object) => ({
  kind: 'castFree',
  objects: { kind: 'choose', filter: { zone: 'hand', ...filter } },
});

describe('Electrodominance: "You may cast a spell with mana value X or less from your hand without paying its mana cost." (CR 107.3a, 202.3, 608.2g, 118.9)', () => {
  test('the real text: the damage, then the free cast limited by the X of the spell', () => {
    const parsed = readAll(
      '~ deals X damage to any target. You may cast a spell with mana value X or less from your hand without paying its mana cost.',
      'instant',
    );
    expect(parsed.spell).toMatchObject({
      x: true,
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'dealDamage', amount: X },
          FROM_HAND({ notTypes: ['land'], manaValueAtMost: X }),
        ],
      },
    });
  });

  test('another type of spell (SYNTHETIC)', () => {
    const parsed = readAll(
      '~ deals X damage to any target. You may cast a creature spell with mana value X or less from your hand without paying its mana cost.',
      'sorcery',
    );
    expect(parsed.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [{ kind: 'dealDamage' }, FROM_HAND({ types: ['creature'], manaValueAtMost: X })],
    });
  });

  test.each([
    // An X nothing announces: a permanent's ability has no X of its own.
    '{T}: You may cast a spell with mana value X or less from your hand without paying its mana cost.',
  ])('not read: %s', (text) => {
    expect(dropped(text, 'artifact').reason).toBeDefined();
  });
});

describe('Velomachus Lorehold: "Whenever ~ attacks, look at the top seven cards of your library. You may cast an instant or sorcery spell with mana value less than or equal to ~\'s power from among them without paying its mana cost. Put the rest on the bottom of your library in a random order." (CR 608.2g, 118.9, 202.3, 401.4)', () => {
  const POWER = { kind: 'powerOf', of: { kind: 'this' } } as const;
  const look = (kinds: object) => ({
    kind: 'lookAtTop',
    count: 7,
    take: { filter: kinds, max: 1, to: 'castFree', manaValueAtMost: POWER },
    rest: 'bottomRandom',
  });

  test('the real text: the attack trigger looks and casts from among the cards', () => {
    const parsed = readAll(
      "Whenever ~ attacks, look at the top seven cards of your library. You may cast an instant or sorcery spell with mana value less than or equal to ~'s power from among them without paying its mana cost. Put the rest on the bottom of your library in a random order.",
      'creature',
      ['Elder', 'Dragon'],
    );
    expect(parsed.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: look({ anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] }),
      },
    ]);
  });

  test('another count and kind of spell (SYNTHETIC)', () => {
    const parsed = readAll(
      "Whenever ~ attacks, look at the top five cards of your library. You may cast a creature spell with mana value less than or equal to ~'s power from among them without paying its mana cost. Put the rest on the bottom of your library in a random order.",
      'creature',
    );
    expect(parsed.abilities).toMatchObject([
      { kind: 'triggered', effect: { ...look({ types: ['creature'] }), count: 5 } },
    ]);
  });

  test.each([
    "Whenever ~ attacks, look at the top seven cards of your library. You may cast an instant or sorcery spell with mana value less than or equal to ~'s power from among them without paying its mana cost. Put the rest into your graveyard.",
    'Whenever ~ attacks, look at the top seven cards of your library. You may cast an instant or sorcery spell with mana value less than or equal to 3 from among them without paying its mana cost. Put the rest on the bottom of your library in a random order.',
  ])('not read: %s', (text) => {
    expect(dropped(text, 'creature').reason).toBeDefined();
  });
});

describe('Transforming Flourish: "Destroy target artifact or creature you don\'t control. If that permanent is destroyed this way, its controller exiles cards from the top of their library until they exile a nonland card, then they may cast that card without paying its mana cost." (CR 701.8, 701.13, 608.2g, 118.9)', () => {
  const REAL =
    "Destroy target artifact or creature you don't control. If that permanent is destroyed this way, its controller exiles cards from the top of their library until they exile a nonland card, then they may cast that card without paying its mana cost.";
  const CONTROLLER = { kind: 'controllerOf', of: { kind: 'target', id: 't1' } } as const;
  const NONLAND = { notTypes: ['land'] };

  test('the real text: the destroy, then the exile and the free cast of the controller of the target, when it was destroyed', () => {
    const parsed = readAll(REAL, 'instant');
    expect(parsed.spell).toMatchObject({
      targets: [{ id: 't1' }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
          {
            kind: 'conditional',
            condition: { kind: 'thisWayAtLeast', what: 'destroyed', count: 1 },
            effect: {
              kind: 'sequence',
              effects: [
                { kind: 'exileUntilFound', players: CONTROLLER, filter: NONLAND },
                {
                  kind: 'castFree',
                  objects: { kind: 'moved' },
                  filter: NONLAND,
                  player: CONTROLLER,
                },
              ],
            },
          },
        ],
      },
    });
  });

  test('Demonstrate is a keyword of its own (CR 702.144)', () => {
    expect(readAll('Demonstrate', 'instant').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'demonstrate' } },
    ]);
  });

  test('another permanent (SYNTHETIC)', () => {
    const parsed = readAll(REAL.replace(/permanent is/g, 'creature is'), 'instant');
    expect(parsed.spell?.effect).toMatchObject({ kind: 'sequence' });
  });

  test.each([
    // The cards are exiled by the player who controlled the permanent, so "you" is another reading.
    "Destroy target artifact or creature you don't control. If that permanent is destroyed this way, you exile cards from the top of your library until you exile a nonland card, then you may cast that card without paying its mana cost.",
    "Exile target artifact or creature you don't control. If that permanent is destroyed this way, its controller exiles cards from the top of their library until they exile a nonland card, then they may cast that card without paying its mana cost.",
    "Destroy target artifact or creature you don't control. If that permanent is destroyed this way, its controller exiles cards from the top of their library until they exile a nonland card, then they may cast that card.",
  ])('not read: %s', (text) => {
    expect(dropped(text, 'instant').reason).toBeDefined();
  });
});

describe('Transcendent Dragon: "When ~ enters, if you cast it, counter target spell. If that spell is countered this way, exile it instead of putting it into its owner\'s graveyard, then you may cast it without paying its mana cost." (CR 603.4, 701.6a, 614.1a, 608.2g)', () => {
  const REAL =
    "When ~ enters, if you cast it, counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard, then you may cast it without paying its mana cost.";

  test('the real text: an enters trigger with the intervening "if you cast it"', () => {
    const parsed = readAll(REAL, 'creature', ['Dragon']);
    expect(parsed.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        interveningIf: { kind: 'wasCast' },
        targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'stack' } } }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'counter', objects: { kind: 'target', id: 't1' }, exileInstead: true },
            { kind: 'castFree', objects: { kind: 'moved' } },
          ],
        },
      },
    ]);
  });

  test('another kind of spell (SYNTHETIC)', () => {
    const parsed = readAll(
      REAL.replace('counter target spell', 'counter target noncreature spell'),
      'creature',
    );
    expect(parsed.abilities).toMatchObject([
      { kind: 'triggered', effect: { effects: [{ kind: 'counter', exileInstead: true }, {}] } },
    ]);
  });

  test.each([
    // "if you cast it" is the intervening "if" of a trigger about the permanent itself.
    "Whenever another creature enters, if you cast it, counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard, then you may cast it without paying its mana cost.",
    "When ~ enters, counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard.",
    "When ~ enters, if you cast it, counter target spell unless its controller pays {1}. If that spell is countered this way, exile it instead of putting it into its owner's graveyard, then you may cast it without paying its mana cost.",
  ])('not read: %s', (text) => {
    expect(dropped(text, 'creature').reason).toBeDefined();
  });
});

describe('Baral and Kari Zev: "Whenever you cast your first instant or sorcery spell each turn, you may cast a spell with lesser mana value that shares a card type with it from your hand without paying its mana cost. If you don\'t, create First Mate Ragavan, a legendary 2/1 red Monkey Pirate creature token. It gains haste until end of turn." (CR 601.2i, 202.3, 205.2a, 608.2g, 608.2c)', () => {
  const REAL =
    "Whenever you cast your first instant or sorcery spell each turn, you may cast a spell with lesser mana value that shares a card type with it from your hand without paying its mana cost. If you don't, create First Mate Ragavan, a legendary 2/1 red Monkey Pirate creature token. It gains haste until end of turn.";
  const TRIGGER = {
    kind: 'castSpell',
    filter: { stackKind: 'spell', anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] },
    by: 'you',
    firstOfKind: true,
  };
  const CAST = {
    kind: 'castFree',
    objects: {
      kind: 'choose',
      filter: {
        zone: 'hand',
        notTypes: ['land'],
        manaValueBelow: { kind: 'manaValueOf', of: { kind: 'triggerSubject' } },
        sharesCardTypeWith: 'triggerSubject',
      },
    },
  };

  test('the real text: the first-of-kind cast trigger, the free cast, and the token that "if you don\'t" makes, with haste', () => {
    const parsed = readAll(REAL, 'creature', ['Human']);
    expect(parsed.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: TRIGGER,
        effect: {
          kind: 'sequence',
          effects: [
            CAST,
            {
              kind: 'conditional',
              condition: { kind: 'not', term: { kind: 'didPrevious' } },
              effect: {
                kind: 'sequence',
                effects: [
                  {
                    kind: 'createToken',
                    token: {
                      kind: 'custom',
                      definition: { name: 'First Mate Ragavan', supertypes: ['legendary'] },
                    },
                  },
                  {
                    kind: 'grantKeyword',
                    objects: { kind: 'moved' },
                    keyword: { kind: 'haste' },
                    duration: 'untilEndOfTurn',
                  },
                ],
              },
            },
          ],
        },
      },
    ]);
  });

  test('the free cast alone, of any cast trigger (SYNTHETIC)', () => {
    const parsed = readAll(
      'Whenever you cast an instant or sorcery spell, you may cast a spell with lesser mana value that shares a card type with it from your hand without paying its mana cost.',
      'creature',
    );
    expect(parsed.abilities).toMatchObject([
      { kind: 'triggered', trigger: { kind: 'castSpell', by: 'you' }, effect: CAST },
    ]);
  });

  test('another kind of first spell (SYNTHETIC)', () => {
    const parsed = readAll(
      'Whenever you cast your first creature spell each turn, draw a card.',
      'creature',
    );
    expect(parsed.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: { types: ['creature'] }, firstOfKind: true },
      },
    ]);
  });

  test.each([
    // The spell "it" is the one of a cast trigger.
    'When ~ enters, you may cast a spell with lesser mana value that shares a card type with it from your hand without paying its mana cost.',
    // A forced cast is no offer.
    "Whenever you cast your first instant or sorcery spell each turn, cast a spell with lesser mana value that shares a card type with it from your hand without paying its mana cost. If you don't, draw a card.",
    // (The same line with "your first spell each turn" is read since Rashmi's trigger: a `castSpell` trigger with `nth: 1`.)
  ])('not read: %s', (text) => {
    expect(dropped(text, 'creature').reason).toBeDefined();
  });
});
