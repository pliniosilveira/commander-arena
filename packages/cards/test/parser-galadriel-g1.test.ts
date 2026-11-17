// The Galadriel deck (issue 43), group 1: the lines of Matoya, Archon Elder, Elrond, Lord of Rivendell, Galadriel of Lothlorien, Elven Farsight, Track Down, Nissa, Steward of Elements and
// Shower of Arrows. The real lines are the Oracle text of the acceptance cards of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and the near
// misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-galadriel-g1.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { readAll as readAllFace, read as readFace, withoutFeature } from './parser-p5-helpers';

const read = (text: string, type: Parameters<typeof readFace>[1] = 'creature') =>
  readFace(text, type);
const readAll = (text: string, type: Parameters<typeof readAllFace>[1] = 'creature') =>
  readAllFace(text, type);

const NOT_READ = (text: string, type: Parameters<typeof read>[1] = 'creature') => {
  const parsed = read(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.spell ?? null, text).toBeNull();
  expect(parsed.unparsed, text).toHaveLength(1);
};

const YOU = { kind: 'you' } as const;
const DRAW = { kind: 'draw', player: YOU, count: 1 } as const;

describe('"Whenever you scry or surveil" (CR 701.22, 701.25, 603.2c)', () => {
  test('the real line of Matoya: one ability for each of the two events, the same body', () => {
    expect(readAll('Whenever you scry or surveil, draw a card.').abilities).toEqual([
      { kind: 'triggered', trigger: { kind: 'scries', who: 'you' }, effect: DRAW },
      { kind: 'triggered', trigger: { kind: 'surveils', who: 'you' }, effect: DRAW },
    ]);
  });

  test('surveil alone, and another player (SYNTHETIC)', () => {
    expect(readAll('Whenever you surveil, you gain 1 life.').abilities).toMatchObject([
      { kind: 'triggered', trigger: { kind: 'surveils', who: 'you' } },
    ]);
    expect(
      readAll('Whenever an opponent scries or surveils, you gain 1 life.').abilities,
    ).toMatchObject([
      { trigger: { kind: 'scries', who: 'opponent' } },
      { trigger: { kind: 'surveils', who: 'opponent' } },
    ]);
    expect(readAll('Whenever a player surveils, you gain 1 life.').abilities).toMatchObject([
      { trigger: { kind: 'surveils', who: 'any' } },
    ]);
  });

  test('"that many" of a surveil is the cards looked at (the engine writes it for the amount of the trigger)', () => {
    expect(readAll('Whenever you surveil, you gain 1 life.').abilities).toHaveLength(1);
  });

  test('the old "whenever you scry" is untouched', () => {
    expect(readAll('Whenever you scry, you gain 1 life.').abilities).toMatchObject([
      { kind: 'triggered', trigger: { kind: 'scries', who: 'you' } },
    ]);
  });

  test.each([
    'Whenever you scry or surveil 2, you gain 1 life.',
    'Whenever you surveil 2, you gain 1 life.',
    'Whenever you surveilled, you gain 1 life.',
    'Whenever you surveil or scry, you gain 1 life.',
    'Whenever you scry, surveil, or draw a card, you gain 1 life.',
    'Whenever an opponent scry or surveil, you gain 1 life.',
    'Whenever you scry or surveils, you gain 1 life.',
    'Whenever each opponent scries or surveils, you gain 1 life.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text);
  });

  test('without the engine feature the line is dropped and says what it needs', () => {
    expect(
      withoutFeature('trigger:surveils', 'Whenever you scry or surveil, draw a card.').needs,
    ).toContain('trigger:surveils');
  });
});

describe('"If this is the second time this ability has resolved this turn" (Elrond; CR 608.2c)', () => {
  const LINE =
    'Whenever ~ or another creature you control enters, scry 1. If this is the second time this ability has resolved this turn, the Ring tempts you.';
  const BODY = {
    kind: 'sequence',
    effects: [
      { kind: 'scry', count: 1 },
      {
        kind: 'conditional',
        condition: { kind: 'abilityResolvedTimes', times: 2 },
        effect: { kind: 'ringTempts' },
      },
    ],
  };

  test('the real line: one body for the permanent itself and for another creature you control', () => {
    expect(readAll(LINE).abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: BODY,
      },
      {
        kind: 'triggered',
        trigger: {
          kind: 'entersBattlefield',
          what: { types: ['creature'], other: true, controller: 'you' },
        },
        effect: BODY,
      },
    ]);
  });

  test('the third and the fourth time (SYNTHETIC)', () => {
    for (const [word, times] of [
      ['third', 3],
      ['fourth', 4],
    ] as const) {
      expect(
        readAll(
          `Whenever ~ enters, scry 1. If this is the ${word} time this ability has resolved this turn, you gain 1 life.`,
        ).abilities,
      ).toMatchObject([
        {
          effect: {
            effects: [{ kind: 'scry' }, { condition: { kind: 'abilityResolvedTimes', times } }],
          },
        },
      ]);
    }
  });

  test.each([
    'Whenever ~ enters, scry 1. If this is the first time this ability has resolved this turn, the Ring tempts you.',
    'Whenever ~ enters, scry 1. If this is the second time this ability has resolved, the Ring tempts you.',
    'Whenever ~ enters, scry 1. If this is the second time this spell has resolved this turn, the Ring tempts you.',
    'Whenever ~ enters, scry 1. If this is the second time you have scried this turn, the Ring tempts you.',
    'Whenever ~ enters, scry 1. If this is the fifth time this ability has resolved this turn, the Ring tempts you.',
    'Whenever ~ enters, scry 1. If this is the second time this ability has resolved this turn and you control a Ring-bearer, the Ring tempts you.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text);
  });

  test('without the engine feature the line is dropped and says what it needs', () => {
    expect(withoutFeature('condition:abilityResolvedTimes', LINE).needs).toContain(
      'condition:abilityResolvedTimes',
    );
  });
});

describe('"if you chose a creature other than ~ as your Ring-bearer" (Galadriel; CR 701.54a, 603.4)', () => {
  test('the real lines: the intervening "if" of the Ring trigger and the optional reveal of a scry', () => {
    expect(
      readAll(
        'Whenever the Ring tempts you, if you chose a creature other than ~ as your Ring-bearer, scry 3.\nWhenever you scry, you may reveal the top card of your library. If a land card is revealed this way, put it onto the battlefield tapped.',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'ringTempted' },
        interveningIf: { kind: 'ringBearerChosen', other: true },
        effect: { kind: 'scry', count: 3 },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'scries', who: 'you' },
        optional: true,
        effect: {
          kind: 'revealTop',
          player: YOU,
          ifMatches: { types: ['land'] },
          to: 'battlefield',
          tapped: true,
        },
      },
    ]);
  });

  test.each([
    'Whenever the Ring tempts you, if you chose ~ as your Ring-bearer, scry 3.',
    'Whenever the Ring tempts you, if you chose a creature as your Ring-bearer, scry 3.',
    'Whenever the Ring tempts you, if you chose an artifact other than ~ as your Ring-bearer, scry 3.',
    'Whenever the Ring tempts you, if you chose a creature other than ~ as their Ring-bearer, scry 3.',
    'Whenever you scry, if you chose a creature other than ~ as your Ring-bearer, scry 3.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text);
  });

  test('without the engine feature the line is dropped and says what it needs', () => {
    expect(
      withoutFeature(
        'condition:ringBearerChosen',
        'Whenever the Ring tempts you, if you chose a creature other than ~ as your Ring-bearer, scry 3.',
      ).needs,
    ).toContain('condition:ringBearerChosen');
  });
});

describe('"reveal the top card of your library. If ... draw a card" (Track Down, Elven Farsight; CR 701.20a, 608.2c)', () => {
  test('the real line of Track Down: reveal, then a creature or land card draws a card', () => {
    expect(
      readAll(
        "Scry 3, then reveal the top card of your library. If it's a creature or land card, draw a card. (To scry 3, look at the top three cards of your library, then put any number of them on the bottom and the rest on top in any order.)",
        'sorcery',
      ).spell,
    ).toEqual({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'scry', count: 3 },
          {
            kind: 'revealTop',
            player: YOU,
            ifMatches: { anyOf: [{ types: ['creature'] }, { types: ['land'] }] },
            onMatch: DRAW,
          },
        ],
      },
    });
  });

  test('the real line of Elven Farsight: the same with "you may reveal"; the offer is the engine\'s may', () => {
    expect(
      readAll(
        'Scry 3, then you may reveal the top card of your library. If a creature card is revealed this way, draw a card.',
        'sorcery',
      ).spell,
    ).toEqual({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'scry', count: 3 },
          {
            kind: 'may',
            effect: {
              kind: 'revealTop',
              player: YOU,
              ifMatches: { types: ['creature'] },
              onMatch: DRAW,
            },
          },
        ],
      },
    });
  });

  test('where the card goes: the battlefield untapped, the hand (SYNTHETIC)', () => {
    expect(
      readAll(
        'Reveal the top card of your library. If a land card is revealed this way, put it onto the battlefield.',
        'sorcery',
      ).spell?.effect,
    ).toEqual({
      kind: 'revealTop',
      player: YOU,
      ifMatches: { types: ['land'] },
      to: 'battlefield',
    });
    expect(
      readAll(
        "Reveal the top card of your library. If it's an artifact card, put it into your hand.",
        'sorcery',
      ).spell?.effect,
    ).toEqual({
      kind: 'revealTop',
      player: YOU,
      ifMatches: { types: ['artifact'] },
      to: 'hand',
    });
  });

  test.each([
    "Reveal the top card of your library. If it's a land card, exile it.",
    "Reveal the top card of your library. If it's a land card, draw two cards.",
    "Reveal the top card of your library. If it's a land card, draw a card and gain 1 life.",
    "Reveal the top card of target player's library. If it's a land card, draw a card.",
    'Reveal the top two cards of your library. If a land card is revealed this way, draw a card.',
    'Reveal the top card of your library. If a land is revealed this way, draw a card.',
    'Scry 3, then you may reveal the top card of your library. Draw a card.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'sorcery');
  });

  test('without the engine feature the line is dropped and says what it needs', () => {
    expect(
      withoutFeature(
        'effect:revealTop',
        "Reveal the top card of your library. If it's a land card, draw a card.",
        'sorcery',
      ).needs,
    ).toContain('effect:revealTop');
  });
});

describe('"Look at the top card of your library. If it\'s a land card or a creature card with mana value ..." (Nissa; CR 401.2, 202.3)', () => {
  // Nissa's line is a loyalty ability, read with the whole card in convert-grammar-engine-galadriel-g1.test.ts; here it is the body of a trigger of a creature (SYNTHETIC wrapper).
  const WRAP = (body: string) => `Whenever ~ attacks, ${body}`;
  const LINE =
    "Look at the top card of your library. If it's a land card or a creature card with mana value less than or equal to the number of loyalty counters on ~, you may put that card onto the battlefield.";

  test('the real line: a look at one card, the limit read as the effect resolves, the card stays on top unless it is put', () => {
    expect(readAll(WRAP(LINE)).abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: {
          kind: 'lookAtTop',
          count: 1,
          take: {
            filter: { anyOf: [{ types: ['land'] }, { types: ['creature'] }] },
            max: 1,
            to: 'battlefield',
            manaValueAtMost: { kind: 'countersOn', of: { kind: 'this' }, counter: 'loyalty' },
          },
          rest: 'top',
        },
      },
    ]);
  });

  test('another card type for the second kind (SYNTHETIC)', () => {
    expect(
      readAll(
        WRAP(
          "Look at the top card of your library. If it's a land card or an artifact card with mana value less than or equal to the number of loyalty counters on ~, you may put that card onto the battlefield.",
        ),
      ).abilities,
    ).toMatchObject([
      {
        effect: { take: { filter: { anyOf: [{ types: ['land'] }, { types: ['artifact'] }] } } },
      },
    ]);
  });

  test.each([
    "Look at the top card of your library. If it's a land card or a creature card, you may put that card onto the battlefield.",
    "Look at the top card of your library. If it's a creature card or a land card with mana value less than or equal to the number of loyalty counters on ~, you may put that card onto the battlefield.",
    "Look at the top card of your library. If it's a land card or a land card with mana value less than or equal to the number of loyalty counters on ~, you may put that card onto the battlefield.",
    "Look at the top card of your library. If it's a land card or a creature card with mana value less than or equal to the number of loyalty counters on ~, you may put that card into your hand.",
    "Look at the top card of your library. If it's a land card or a creature card with mana value less than or equal to the number of loyalty counters on ~, you may put that card onto the battlefield tapped.",
    "Look at the top card of your library. If it's a land card or a creature card with mana value less than or equal to the number of loyalty counters on ~, put that card onto the battlefield.",
    "Look at the top card of your library. If it's a land card or a creature card with mana value less than or equal to the number of loyalty counters on ~, you may put that card onto the battlefield and gain 1 life.",
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(WRAP(text));
  });

  test('without the engine feature the line is dropped and says what it needs', () => {
    expect(withoutFeature('effect:lookAtTop', WRAP(LINE)).needs).toContain('effect:lookAtTop');
  });
});

describe('"They become 5/5 Elemental creatures with flying and haste until end of turn. They\'re still lands." (Nissa; CR 205.1b, 613.4b)', () => {
  const LINE =
    "Untap up to two target lands you control. They become 5/5 Elemental creatures with flying and haste until end of turn. They're still lands.";
  const T1 = { kind: 'target', id: 't1' } as const;

  test('the real line: untap, then the same targets become creatures in addition to their types, with the keywords', () => {
    const spell = readAll(LINE, 'sorcery').spell;
    expect(spell?.targets).toEqual([
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: { zone: 'battlefield', types: ['land'], controller: 'you' },
        },
        min: 0,
        max: 2,
      },
    ]);
    expect(spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'untap', objects: T1 },
        {
          kind: 'setTypes',
          objects: T1,
          types: ['creature'],
          subtypes: ['Elemental'],
          additive: true,
          duration: 'untilEndOfTurn',
        },
        { kind: 'setPt', objects: T1, power: 5, toughness: 5, duration: 'untilEndOfTurn' },
        {
          kind: 'grantKeyword',
          objects: T1,
          keyword: { kind: 'flying' },
          duration: 'untilEndOfTurn',
        },
        {
          kind: 'grantKeyword',
          objects: T1,
          keyword: { kind: 'haste' },
          duration: 'untilEndOfTurn',
        },
      ],
    });
  });

  test('no keywords, and other numbers (SYNTHETIC)', () => {
    expect(
      readAll(
        "Untap up to two target lands you control. They become 3/3 Elemental creatures until end of turn. They're still lands.",
        'sorcery',
      ).spell?.effect,
    ).toMatchObject({
      effects: [
        { kind: 'untap' },
        { kind: 'setTypes', additive: true },
        { kind: 'setPt', power: 3, toughness: 3 },
      ],
    });
  });

  test.each([
    'Untap up to two target lands you control. They become 5/5 Elemental creatures with flying and haste until end of turn.',
    "Untap up to two target lands you control. They become 5/5 Elemental creatures with flying and haste until end of turn. They're lands.",
    "Untap up to two target lands you control. They become 5/5 Elemental creatures with flying and haste until your next turn. They're still lands.",
    "Untap up to two target lands you control. They become Elemental creatures with flying and haste until end of turn. They're still lands.",
    "Untap up to two target lands you control. They become 5/5 blue Elemental creatures with flying and haste until end of turn. They're still lands.",
    "They become 5/5 Elemental creatures with flying and haste until end of turn. They're still lands.",
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'sorcery');
  });
});

describe('"Destroy target artifact, enchantment, or creature with flying" (Shower of Arrows; CR 115.1, 702.9)', () => {
  const T1 = { kind: 'target', id: 't1' } as const;

  test('the real line: a keyword said of the last type, the creature', () => {
    const spell = readAll(
      'Destroy target artifact, enchantment, or creature with flying. Scry 1.',
      'instant',
    ).spell;
    expect(spell?.targets).toEqual([
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: {
            zone: 'battlefield',
            anyOf: [
              { types: ['artifact'] },
              { types: ['enchantment'] },
              { types: ['creature'], keywords: ['flying'] },
            ],
          },
        },
      },
    ]);
    expect(spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'destroy', objects: T1 },
        { kind: 'scry', count: 1 },
      ],
    });
  });

  test('"without flying" (SYNTHETIC)', () => {
    expect(
      readAll('Destroy target artifact, enchantment, or creature without flying.', 'instant').spell
        ?.targets?.[0]?.what,
    ).toMatchObject({
      filter: { anyOf: [{}, {}, { types: ['creature'], notKeywords: ['flying'] }] },
    });
  });

  test('the power comparison of the same phrase still reads', () => {
    expect(
      readAll(
        'Destroy target artifact, enchantment, or creature with power 4 or greater.',
        'instant',
      ).spell?.targets?.[0]?.what,
    ).toMatchObject({
      filter: { anyOf: [{}, {}, { types: ['creature'], power: { cmp: 'atLeast', value: 4 } }] },
    });
  });

  test.each([
    'Destroy target artifact, enchantment, or land with flying.',
    'Destroy target artifact with flying, enchantment, or creature.',
    'Destroy target artifact, enchantment, or creature with flying and power 4 or greater.',
    'Destroy target artifact, enchantment, or creature with flying or reach.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'instant');
  });
});
