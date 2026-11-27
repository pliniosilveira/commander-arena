// Turning a permanent face up and a face-down creature entering (CR 701.40b, 708.2, 708.8, 603.2): "Whenever you turn a permanent face up", "Whenever a permanent you control is turned
// face up, if it's a creature, ...", "When ~ is turned face up", "Whenever a face-down creature you control enters", and the Kheru Spellsnatcher counter. Read by
// `trigger.turned-face-up`, `trigger.you-turn-face-up`, the modifier "face-down" and `effect.counter-exile-cast-while-exiled`, and lowered to the engine's `turnedFaceUp` trigger, its
// `isFaceDown` filter, `subjectMatches` and `mayPlay`. The same ASTs are what src/cards/fixtures/synthetic-turn-up.ts plays in test/scenario-xx-turn-up-triggers.test.ts.
import { describe, expect, test } from 'vitest';
import { read, readAll } from './parser-p5-helpers';

const IT = { kind: 'triggerSubject' };
const CREATURE = { kind: 'subjectMatches', filter: { types: ['creature'] } };

describe('"turned face up" triggers', () => {
  test('"Whenever you turn a permanent face up, put a +1/+1 counter on it." (Growing Dread)', () => {
    const face = readAll(
      'Whenever you turn a permanent face up, put a +1/+1 counter on it.',
      'enchantment',
    );
    expect(face.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'turnedFaceUp', what: {}, by: 'you' },
        effect: { kind: 'addCounters', objects: IT, counter: '+1/+1', count: 1 },
      },
    ]);
  });

  test('"Whenever a permanent you control is turned face up, if it\'s a creature, you may have it fight target creature you don\'t control." (Temur War Shaman)', () => {
    const face = readAll(
      "Whenever a permanent you control is turned face up, if it's a creature, you may have it fight target creature you don't control.",
      'enchantment',
    );
    expect(face.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'turnedFaceUp', what: { controller: 'you' } },
        optional: true,
        interveningIf: CREATURE,
        targets: [{ id: 't1', what: { kind: 'object', filter: { controller: 'opponent' } } }],
        effect: { kind: 'fight', fighters: IT, against: { kind: 'target', id: 't1' } },
      },
    ]);
  });

  test('"..., if it\'s a creature, it gets +2/+2 until end of turn." (Trail of Mystery)', () => {
    const face = readAll(
      "Whenever a permanent you control is turned face up, if it's a creature, it gets +2/+2 until end of turn.",
      'enchantment',
    );
    expect(face.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'turnedFaceUp', what: { controller: 'you' } },
        interveningIf: CREATURE,
        effect: {
          kind: 'modifyPt',
          objects: IT,
          power: 2,
          toughness: 2,
          duration: 'untilEndOfTurn',
        },
      },
    ]);
  });

  test('"When ~ is turned face up, ..." is the ability of the permanent itself', () => {
    const face = readAll('When ~ is turned face up, you gain 3 life.', 'creature');
    expect(face.abilities).toMatchObject([
      { kind: 'triggered', trigger: { kind: 'turnedFaceUp', what: { kind: 'this' } } },
    ]);
  });

  test('a permanent of any controller: "Whenever a permanent is turned face up"', () => {
    const face = readAll('Whenever a permanent is turned face up, you gain 1 life.', 'enchantment');
    expect(face.abilities).toMatchObject([
      { kind: 'triggered', trigger: { kind: 'turnedFaceUp', what: {} } },
    ]);
  });

  test.each([
    'Whenever a permanent you control is turned face down, you gain 1 life.',
    'Whenever you turn a permanent face down, you gain 1 life.',
    'Whenever an opponent turns a permanent face up, you gain 1 life.',
    'Whenever a permanent you control is turned face up or dies, you gain 1 life.',
    'Whenever you turn ~ face up, you gain 1 life.',
  ])('%s stays unread', (text) => {
    expect(read(text, 'enchantment').unparsed).not.toEqual([]);
  });
});

describe('"Whenever a face-down creature you control enters"', () => {
  test('a face-down creature entering is an enters trigger whose subject is face down (They Came from the Pipes)', () => {
    const face = readAll(
      'Whenever a face-down creature you control enters, draw a card.',
      'enchantment',
    );
    expect(face.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'entersBattlefield',
          what: { types: ['creature'], controller: 'you', facing: 'down' },
        },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ]);
  });

  test('with a search of the library (Trail of Mystery)', () => {
    const face = readAll(
      'Whenever a face-down creature you control enters, you may search your library for a basic land card, reveal it, put it into your hand, then shuffle.',
      'enchantment',
    );
    expect(face.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { facing: 'down' } },
        optional: true,
        effect: { kind: 'search' },
      },
    ]);
  });

  test('"face-down" is not read where the engine cannot match it: a spell or a cost', () => {
    expect(read('Counter target face-down creature spell.', 'instant').unparsed).not.toEqual([]);
  });
});

describe('"Counter target spell. If that spell is countered this way, exile it instead ... You may cast that card without paying its mana cost for as long as it remains exiled." (Kheru Spellsnatcher)', () => {
  const TEXT =
    "When ~ is turned face up, counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard. You may cast that card without paying its mana cost for as long as it remains exiled.";

  test('it is a counter that exiles, then a free cast of the card exiled for as long as it stays there', () => {
    const face = readAll(TEXT, 'creature');
    expect(face.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'turnedFaceUp', what: { kind: 'this' } },
        targets: [
          { id: 't1', what: { kind: 'object', filter: { zone: 'stack', stackKind: 'spell' } } },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'counter', objects: { kind: 'target', id: 't1' }, exileInstead: true },
            {
              kind: 'mayPlay',
              objects: { kind: 'moved' },
              free: true,
              castOnly: true,
              lasts: 'whileExiled',
            },
          ],
        },
      },
    ]);
  });

  test.each([
    "When ~ is turned face up, counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard.",
    "When ~ is turned face up, counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard. You may cast that card without paying its mana cost.",
    "When ~ is turned face up, counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard. You may cast that card for as long as it remains exiled.",
  ])('a shorter or different text stays unread: %s', (text) => {
    expect(read(text, 'creature').unparsed).not.toEqual([]);
  });
});
