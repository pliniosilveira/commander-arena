// Stage P33 (M9): the Angels slice of the engine (D-149, ENGINE_VERSION 33) read by the grammar (D-150). The lines of `REAL` are the real
// Oracle text of the twenty-three cards of the Angels precon (packages/cards/test/fixtures/corpus/golden.jsonl), names replaced by ~, each
// with the nodes the grammar produces; every other line is SYNTHETIC: the same shapes over other types, numbers and filters, the near
// misses and the lines the grammar must not read. The engine runs what is lowered in convert-grammar-engine-p33.test.ts; a missing engine
// feature is named in parser-p33-needs.test.ts.
//
// Differences of detail from "The Angels slice (D-149)" in docs/MECHANICS.md, all of them the same thing to the engine: a target filter
// carries `zone: 'battlefield'` (or `'graveyard'`); a return to the battlefield names `controller: 'you'`; and the static grant of Sephara
// names the controller of the creatures (`controller: 'you'`, with `other`).
import { describe, expect, test } from 'vitest';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const FLYING = { kind: 'keyword', keyword: { kind: 'flying' } } as const;
const VIGILANCE = { kind: 'keyword', keyword: { kind: 'vigilance' } } as const;
const CLUE = { kind: 'createToken', token: { kind: 'preset', preset: 'Clue' }, count: 1 } as const;
const ONE_W = [{ kind: 'mana', symbols: ['1'] }] as const;
const ATTACHED = { kind: 'attached', types: ['creature'] } as const;

const face = (text: string, type: FaceType = 'creature', subtypes: readonly string[] = []) =>
  readAll(text, type, subtypes);
const abilities = (text: string, type: FaceType = 'creature', subtypes: readonly string[] = []) =>
  face(text, type, subtypes).abilities;
const drop = (text: string, type: FaceType = 'creature', subtypes: readonly string[] = []) =>
  dropped(text, type, subtypes);

const triggered = (
  trigger: unknown,
  effect: unknown,
  more: Record<string, unknown> = {},
): Record<string, unknown> => ({ kind: 'triggered', trigger, effect, ...more });

/** The real Oracle text of the cards of the Angels precon, as the nodes the engine runs. */
const REAL: readonly (readonly [
  string,
  string,
  FaceType,
  readonly string[],
  { abilities?: unknown; spell?: unknown; alternativeCosts?: unknown },
])[] = [
  [
    'Angel of Vitality',
    'Flying\nIf you would gain life, you gain that much life plus 1 instead.\nThis creature gets +2/+2 as long as you have 25 or more life.',
    'creature',
    ['Angel'],
    {
      abilities: [
        FLYING,
        { kind: 'replacement', replacement: { kind: 'lifeGainBonus', amount: 1 } },
        {
          kind: 'static',
          static: { kind: 'modifyPt', subject: THIS, power: 2, toughness: 2 },
          condition: { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 25 } },
        },
      ],
    },
  ],
  [
    'Angel of the Ruins',
    'Flying\nWhen this creature enters, exile up to two target artifacts and/or enchantments.\nPlainscycling {2}',
    'creature',
    ['Angel'],
    {
      abilities: [
        FLYING,
        triggered(
          { kind: 'entersBattlefield', what: THIS },
          { kind: 'exile', objects: T1 },
          {
            targets: [
              {
                id: 't1',
                min: 0,
                max: 2,
                what: {
                  kind: 'object',
                  filter: {
                    zone: 'battlefield',
                    anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
                  },
                },
              },
            ],
          },
        ),
        {
          kind: 'keyword',
          keyword: {
            kind: 'typecycling',
            filter: { subtypes: ['Plains'] },
            cost: [{ kind: 'mana', symbols: ['2'] }],
          },
        },
      ],
    },
  ],
  [
    'Angelic Destiny',
    "Enchant creature\nEnchanted creature gets +4/+4, has flying and first strike, and is an Angel in addition to its other types.\nWhen enchanted creature dies, return this card to its owner's hand.",
    'enchantment',
    ['Aura'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
        { kind: 'static', static: { kind: 'modifyPt', subject: ATTACHED, power: 4, toughness: 4 } },
        {
          kind: 'static',
          static: { kind: 'grantKeyword', subject: ATTACHED, keyword: { kind: 'flying' } },
        },
        {
          kind: 'static',
          static: { kind: 'grantKeyword', subject: ATTACHED, keyword: { kind: 'firstStrike' } },
        },
        {
          kind: 'static',
          static: { kind: 'setTypes', subject: ATTACHED, additive: true, subtypes: ['Angel'] },
        },
        triggered(
          { kind: 'dies', what: { kind: 'attached' } },
          { kind: 'moveToZone', objects: { kind: 'thisCard' }, to: 'hand' },
        ),
      ],
    },
  ],
  [
    'Angelic Sleuth',
    'Flying\nWhenever another permanent you control leaves the battlefield, if it had counters on it, investigate.',
    'creature',
    ['Angel', 'Advisor'],
    {
      abilities: [
        FLYING,
        triggered(
          {
            kind: 'leavesBattlefield',
            what: { controller: 'you', other: true, hasCounter: true },
          },
          CLUE,
        ),
      ],
    },
  ],
  [
    'Archangel of Tithes',
    "Flying\nAs long as this creature is untapped, creatures can't attack you or planeswalkers you control unless their controller pays {1} for each of those creatures.\nAs long as this creature is attacking, creatures can't block unless their controller pays {1} for each of those creatures.",
    'creature',
    ['Angel'],
    {
      abilities: [
        FLYING,
        {
          kind: 'static',
          static: { kind: 'attackTax', cost: ONE_W, planeswalkers: true },
          condition: { kind: 'thisMatches', filter: { tapped: false } },
        },
        { kind: 'static', static: { kind: 'blockTax', cost: ONE_W, whileAttacking: true } },
      ],
    },
  ],
  [
    'Emeria Shepherd',
    'Flying\nLandfall — Whenever a land you control enters, you may return target nonland permanent card from your graveyard to your hand. If that land is a Plains, you may return that nonland permanent card to the battlefield instead.',
    'creature',
    ['Angel'],
    {
      abilities: [
        FLYING,
        triggered(
          { kind: 'landfall' },
          {
            kind: 'conditional',
            condition: {
              kind: 'objectMatches',
              of: { kind: 'triggerSubject' },
              filter: { subtypes: ['Plains'] },
            },
            effect: {
              kind: 'sequence',
              effects: [
                {
                  kind: 'may',
                  effect: { kind: 'moveToZone', objects: T1, to: 'battlefield', controller: 'you' },
                },
                {
                  kind: 'conditional',
                  condition: { kind: 'not', term: { kind: 'didPrevious' } },
                  effect: { kind: 'may', effect: { kind: 'moveToZone', objects: T1, to: 'hand' } },
                },
              ],
            },
            else: { kind: 'may', effect: { kind: 'moveToZone', objects: T1, to: 'hand' } },
          },
          {
            targets: [
              {
                id: 't1',
                what: {
                  kind: 'object',
                  filter: {
                    zone: 'graveyard',
                    controller: 'you',
                    anyOf: [
                      { types: ['artifact'] },
                      { types: ['creature'] },
                      { types: ['enchantment'] },
                      { types: ['planeswalker'] },
                      { types: ['battle'] },
                    ],
                  },
                },
              },
            ],
          },
        ),
      ],
    },
  ],
  [
    'Endless Atlas',
    '{2}, {T}: Draw a card. Activate only if you control three or more lands with the same name.',
    'artifact',
    [],
    {
      abilities: [
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['2'] }, { kind: 'tap' }],
          effect: { kind: 'draw', player: YOU, count: 1 },
          activateOnlyIf: { kind: 'sameNameAtLeast', filter: { types: ['land'] }, count: 3 },
        },
      ],
    },
  ],
  [
    'Exemplar of Light',
    'Flying\nWhenever you gain life, put a +1/+1 counter on ~.\nWhenever you put one or more +1/+1 counters on ~, draw a card. This ability triggers only once each turn.',
    'creature',
    ['Angel'],
    {
      abilities: [
        FLYING,
        triggered(
          { kind: 'lifeGained', who: 'you' },
          { kind: 'addCounters', objects: THIS, counter: '+1/+1', count: 1 },
        ),
        triggered(
          { kind: 'countersAdded', what: THIS, counter: '+1/+1', by: 'you' },
          { kind: 'draw', player: YOU, count: 1 },
          { oncePerTurn: true },
        ),
      ],
    },
  ],
  [
    'Exorcise',
    'Exile target artifact, enchantment, or creature with power 4 or greater.',
    'sorcery',
    [],
    {
      spell: {
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: {
                zone: 'battlefield',
                anyOf: [
                  { types: ['artifact'] },
                  { types: ['enchantment'] },
                  { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
                ],
              },
            },
          },
        ],
        effect: { kind: 'exile', objects: T1 },
      },
    },
  ],
  [
    'Firemane Commando',
    'Flying\nWhenever you attack with two or more creatures, draw a card.\nWhenever another player attacks with two or more creatures, they draw a card if none of those creatures attacked you.',
    'creature',
    ['Angel', 'Soldier'],
    {
      abilities: [
        FLYING,
        triggered(
          { kind: 'attackBatch', who: 'you', atLeast: 2 },
          { kind: 'draw', player: YOU, count: 1 },
        ),
        triggered(
          { kind: 'attackBatch', who: 'opponent', atLeast: 2 },
          {
            kind: 'conditional',
            condition: { kind: 'not', term: { kind: 'attackersAttackedYou' } },
            effect: { kind: 'draw', player: { kind: 'triggerPlayer' }, count: 1 },
          },
        ),
      ],
    },
  ],
  [
    'Giada, Font of Hope',
    'Flying, vigilance\nEach other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control.\n{T}: Add {W}. Spend this mana only to cast an Angel spell.',
    'creature',
    ['Angel'],
    {
      abilities: [
        FLYING,
        VIGILANCE,
        {
          kind: 'replacement',
          replacement: {
            kind: 'othersEnterWithCounters',
            what: { subtypes: ['Angel'], controller: 'you', other: true },
            counter: '+1/+1',
            count: { kind: 'countOf', filter: { subtypes: ['Angel'], controller: 'you' } },
          },
        },
        {
          kind: 'mana',
          cost: [{ kind: 'tap' }],
          production: { kind: 'fixed', mana: ['W'] },
          spendOnly: { subtypes: ['Angel'] },
        },
      ],
    },
  ],
  [
    'Grasp of Fate',
    'When this enchantment enters, for each opponent, exile up to one target nonland permanent that player controls until this enchantment leaves the battlefield.',
    'enchantment',
    [],
    {
      abilities: [
        triggered(
          { kind: 'entersBattlefield', what: THIS },
          { kind: 'exile', objects: T1, until: 'sourceLeaves' },
          {
            targets: [
              {
                id: 't1',
                onePerOpponent: true,
                what: {
                  kind: 'object',
                  filter: { zone: 'battlefield', notTypes: ['land'], controller: 'opponent' },
                },
              },
            ],
          },
        ),
      ],
    },
  ],
  [
    'Herald of Eternal Dawn',
    "Flash\nFlying\nYou can't lose the game and your opponents can't win the game.",
    'creature',
    ['Angel'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flash' } },
        FLYING,
        { kind: 'static', static: { kind: 'cantLoseGame' } },
        { kind: 'static', static: { kind: 'opponentsCantWin' } },
      ],
    },
  ],
  [
    'Heraldic Banner',
    'As this artifact enters, choose a color.\nCreatures you control of the chosen color get +1/+0.\n{T}: Add one mana of the chosen color.',
    'artifact',
    [],
    {
      abilities: [
        { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'color' } },
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: {
              kind: 'filter',
              filter: { types: ['creature'], controller: 'you', chosenColor: true },
            },
            power: 1,
            toughness: 0,
          },
        },
        { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'chosenColor' } },
      ],
    },
  ],
  [
    'Merchant of Truth',
    'Flying\nWhenever a nontoken creature you control dies, investigate.\nClues you control have exalted.',
    'creature',
    ['Angel', 'Detective'],
    {
      abilities: [
        FLYING,
        triggered(
          { kind: 'dies', what: { types: ['creature'], token: false, controller: 'you' } },
          CLUE,
        ),
        {
          kind: 'static',
          static: {
            kind: 'grantKeyword',
            subject: { kind: 'filter', filter: { subtypes: ['Clue'], controller: 'you' } },
            keyword: { kind: 'exalted' },
          },
        },
      ],
    },
  ],
  [
    'Metallic Mimic',
    'As this creature enters, choose a creature type.\nThis creature is the chosen type in addition to its other types.\nEach other creature you control of the chosen type enters with an additional +1/+1 counter on it.',
    'creature',
    ['Shapeshifter'],
    {
      abilities: [
        { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'creatureType' } },
        {
          kind: 'static',
          static: { kind: 'setTypes', subject: THIS, chosenType: true, additive: true },
        },
        {
          kind: 'replacement',
          replacement: {
            kind: 'othersEnterWithCounters',
            what: { types: ['creature'], controller: 'you', other: true, chosenType: true },
            counter: '+1/+1',
            count: 1,
          },
        },
      ],
    },
  ],
  [
    'Metropolis Reformer',
    'Flying, vigilance\nYou have hexproof.\nWhenever this creature is dealt damage, you gain that much life.',
    'creature',
    ['Angel', 'Cleric'],
    {
      abilities: [
        FLYING,
        VIGILANCE,
        { kind: 'static', static: { kind: 'playerHexproof' } },
        triggered(
          { kind: 'dealtDamage', what: THIS },
          { kind: 'gainLife', player: YOU, amount: { kind: 'triggerDamage' } },
        ),
      ],
    },
  ],
  [
    "Norn's Choirmaster",
    'Flying, first strike\nWhenever a commander you control enters or attacks, proliferate.',
    'creature',
    ['Phyrexian', 'Angel'],
    {
      abilities: [
        FLYING,
        { kind: 'keyword', keyword: { kind: 'firstStrike' } },
        triggered(
          { kind: 'entersBattlefield', what: { controller: 'you', commander: true } },
          { kind: 'proliferate' },
        ),
        triggered(
          { kind: 'attacks', what: { controller: 'you', commander: true } },
          { kind: 'proliferate' },
        ),
      ],
    },
  ],
  [
    "Sephara, Sky's Blade",
    "You may pay {W} and tap four untapped creatures you control with flying rather than pay this spell's mana cost.\nFlying, lifelink\nOther creatures you control with flying have indestructible.",
    'creature',
    ['Angel'],
    {
      abilities: [
        FLYING,
        { kind: 'keyword', keyword: { kind: 'lifelink' } },
        {
          kind: 'static',
          static: {
            kind: 'grantKeyword',
            subject: {
              kind: 'filter',
              filter: { types: ['creature'], keywords: ['flying'], controller: 'you' },
              other: true,
            },
            keyword: { kind: 'indestructible' },
          },
        },
      ],
      alternativeCosts: [
        {
          kind: 'tapPermanents',
          cost: [{ kind: 'mana', symbols: ['W'] }],
          filter: { types: ['creature'], keywords: ['flying'] },
          count: 4,
        },
      ],
    },
  ],
  [
    'Seraph of the Sword',
    'Flying\nPrevent all combat damage that would be dealt to this creature.',
    'creature',
    ['Angel'],
    {
      abilities: [
        FLYING,
        {
          kind: 'static',
          static: { kind: 'preventDamageToThis', subject: THIS, scope: 'combat' },
        },
      ],
    },
  ],
  [
    'Serra Avenger',
    "You can't cast ~ during your first, second, or third turns of the game.\nFlying, vigilance",
    'creature',
    ['Angel'],
    {
      abilities: [
        {
          kind: 'static',
          static: { kind: 'cantCastThis' },
          condition: { kind: 'ownTurnNumber', compare: { cmp: 'atMost', value: 3 } },
        },
        FLYING,
        VIGILANCE,
      ],
    },
  ],
  [
    'Tome of Legends',
    'This artifact enters with a page counter on it.\nWhenever your commander enters or attacks, put a page counter on this artifact.\n{1}, {T}, Remove a page counter from this artifact: Draw a card.',
    'artifact',
    ['Book'],
    {
      abilities: [
        {
          kind: 'replacement',
          replacement: { kind: 'entersWithCounters', counter: 'page', count: 1 },
        },
        triggered(
          { kind: 'entersBattlefield', what: { commander: 'yours' } },
          { kind: 'addCounters', objects: THIS, counter: 'page', count: 1 },
        ),
        triggered(
          { kind: 'attacks', what: { commander: 'yours' } },
          { kind: 'addCounters', objects: THIS, counter: 'page', count: 1 },
        ),
        {
          kind: 'activated',
          cost: [
            { kind: 'mana', symbols: ['1'] },
            { kind: 'tap' },
            { kind: 'removeCounters', counter: 'page', count: 1 },
          ],
          effect: { kind: 'draw', player: YOU, count: 1 },
        },
      ],
    },
  ],
  [
    'Vanguard Seraph',
    'Flying\nWhenever you gain life for the first time each turn, surveil 1.',
    'creature',
    ['Angel', 'Warrior'],
    {
      abilities: [
        FLYING,
        triggered(
          { kind: 'lifeGained', who: 'you', firstEachTurn: true },
          { kind: 'surveil', count: 1 },
        ),
      ],
    },
  ],
];

describe('the real cards of the Angels precon (D-149): every line reads, as these nodes', () => {
  test('there are twenty-three of them, each once', () => {
    expect(new Set(REAL.map(([name]) => name)).size).toBe(23);
  });

  test.each(REAL)('%s', (name, text, type, subtypes, expected) => {
    const parsed = face(text.replaceAll(name, '~'), type, subtypes);
    expect(parsed.unparsed).toEqual([]);
    if (expected.abilities !== undefined) expect(parsed.abilities).toEqual(expected.abilities);
    if (expected.spell !== undefined) expect(parsed.spell).toEqual(expected.spell);
    if (expected.alternativeCosts !== undefined) {
      expect(parsed.alternativeCosts).toEqual(expected.alternativeCosts);
    }
  });
});

describe('gaining life (CR 119.9, 119.10, 614.1a)', () => {
  test.each([
    ['you gain life', { kind: 'lifeGained', who: 'you' }],
    [
      'you gain life for the first time each turn',
      { kind: 'lifeGained', who: 'you', firstEachTurn: true },
    ],
    ['an opponent gains life', { kind: 'lifeGained', who: 'opponent' }],
    ['a player gains life', { kind: 'lifeGained', who: 'any' }],
    [
      'an opponent gains life for the first time each turn',
      { kind: 'lifeGained', who: 'opponent', firstEachTurn: true },
    ],
  ])('Whenever %s', (words, trigger) => {
    expect(abilities(`Whenever ${words}, draw a card.`)).toEqual([
      triggered(trigger, { kind: 'draw', player: YOU, count: 1 }),
    ]);
  });

  test('"that player" is the one who gained the life', () => {
    expect(abilities('Whenever an opponent gains life, that player loses 1 life.')).toEqual([
      triggered(
        { kind: 'lifeGained', who: 'opponent' },
        { kind: 'loseLife', player: { kind: 'triggerPlayer' }, amount: 1 },
      ),
    ]);
  });

  test.each([1, 2, 3])('the replacement of a gain of life plus %i', (n) => {
    const word = ['', 'one', 'two', 'three'][n];
    for (const amount of [String(n), word]) {
      expect(
        abilities(`If you would gain life, you gain that much life plus ${amount} instead.`),
      ).toEqual([{ kind: 'replacement', replacement: { kind: 'lifeGainBonus', amount: n } }]);
    }
  });

  test.each([
    'Whenever you gain 3 life, draw a card.',
    'Whenever you gain life for the first time, draw a card.',
    'Whenever you gain life for the second time each turn, draw a card.',
    'Whenever you gain life this turn, draw a card.',
    'Whenever each opponent gains life, draw a card.',
    'If an opponent would gain life, they gain that much life plus 1 instead.',
    'If you would gain life, you gain that much life plus X instead.',
    'If you would gain life, you gain twice that much life instead.',
    'If you would gain life, you gain that much life instead.',
    'If you would lose life, you lose that much life plus 1 instead.',
  ])('is not read: %s', (text) => {
    expect(drop(text)).toMatchObject({ reason: expect.stringMatching(/unrecognised|notRunnable/) });
  });
});

describe('counters put on a permanent, and an ability that triggers once each turn (CR 122.6, 603.2)', () => {
  test.each([
    [
      'you put one or more +1/+1 counters on ~',
      { kind: 'countersAdded', what: THIS, counter: '+1/+1', by: 'you' },
    ],
    [
      'you put one or more page counters on ~',
      { kind: 'countersAdded', what: THIS, counter: 'page', by: 'you' },
    ],
    ['you put one or more counters on ~', { kind: 'countersAdded', what: THIS, by: 'you' }],
    [
      'you put one or more +1/+1 counters on a creature you control',
      {
        kind: 'countersAdded',
        what: { types: ['creature'], controller: 'you' },
        counter: '+1/+1',
        by: 'you',
      },
    ],
    [
      'one or more +1/+1 counters are put on ~',
      { kind: 'countersAdded', what: THIS, counter: '+1/+1', by: 'any' },
    ],
  ])('Whenever %s', (words, trigger) => {
    expect(abilities(`Whenever ${words}, draw a card.`)).toEqual([
      triggered(trigger, { kind: 'draw', player: YOU, count: 1 }),
    ]);
  });

  test('"This ability triggers only once each turn." sets oncePerTurn on the ability before it', () => {
    expect(
      abilities(
        'Whenever you gain life, draw a card. This ability triggers only once each turn.',
        'creature',
      ),
    ).toEqual([
      triggered(
        { kind: 'lifeGained', who: 'you' },
        { kind: 'draw', player: YOU, count: 1 },
        { oncePerTurn: true },
      ),
    ]);
    // Two events, one limit each (CR 603.2c).
    expect(
      abilities(
        'Whenever ~ enters or attacks, draw a card. This ability triggers only once each turn.',
      ),
    ).toEqual([
      triggered(
        { kind: 'entersBattlefield', what: THIS },
        { kind: 'draw', player: YOU, count: 1 },
        { oncePerTurn: true },
      ),
      triggered(
        { kind: 'attacks', what: THIS },
        { kind: 'draw', player: YOU, count: 1 },
        { oncePerTurn: true },
      ),
    ]);
  });

  test.each([
    'Whenever you put a +1/+1 counter on ~, draw a card.',
    'Whenever you put one or more +1/+1 counters on it, draw a card.',
    'Whenever you put two or more +1/+1 counters on ~, draw a card.',
    'Whenever you put one or more +1/+1 counter on ~, draw a card.',
    'Whenever you put one or more +1/+1 counters on target creature, draw a card.',
    // The sentence says something about the ability before it, and is read there alone.
    'This ability triggers only once each turn. Whenever you gain life, draw a card.',
    'Whenever you gain life, draw a card. This ability triggers only once each combat.',
    'Whenever you gain life, draw a card. This ability triggers only once each turn. Draw a card.',
    '{T}: Draw a card. This ability triggers only once each turn.',
    // Nothing for the limit to apply to.
    'Whenever you gain life, this ability triggers only once each turn.',
  ])('is not read: %s', (text) => {
    expect(drop(text)).toMatchObject({ reason: expect.stringMatching(/unrecognised|notRunnable/) });
  });

  test('the sentence alone, in a spell, is read and not run', () => {
    expect(
      drop('Draw a card. This ability triggers only once each turn.', 'sorcery'),
    ).toMatchObject({
      reason: 'notRunnable',
    });
  });
});

describe('attacking with several creatures (CR 508.1, 603.2)', () => {
  test.each([
    [2, 'two or more creatures', undefined],
    [3, 'three or more creatures', undefined],
    [3, 'three or more Angels', { subtypes: ['Angel'] }],
    [2, 'two or more artifact creatures', { types: ['artifact', 'creature'] }],
    [4, 'four or more Soldiers', { subtypes: ['Soldier'] }],
  ])('Whenever you attack with %s: %s', (atLeast, words, what) => {
    expect(abilities(`Whenever you attack with ${words}, draw a card.`)).toEqual([
      triggered(
        { kind: 'attackBatch', who: 'you', atLeast, ...(what === undefined ? {} : { what }) },
        { kind: 'draw', player: YOU, count: 1 },
      ),
    ]);
  });

  test.each(['another player', 'an opponent'])(
    'Whenever %s attacks, "they" is that player',
    (who) => {
      expect(
        abilities(`Whenever ${who} attacks with two or more creatures, they gain 1 life.`),
      ).toEqual([
        triggered(
          { kind: 'attackBatch', who: 'opponent', atLeast: 2 },
          { kind: 'gainLife', player: { kind: 'triggerPlayer' }, amount: 1 },
        ),
      ]);
    },
  );

  test.each([
    [
      'none of those creatures attacked you',
      { kind: 'not', term: { kind: 'attackersAttackedYou' } },
    ],
    ['one or more of those creatures attacked you', { kind: 'attackersAttackedYou' }],
  ])('"if %s" ends the sentence', (words, condition) => {
    expect(
      abilities(
        `Whenever another player attacks with two or more creatures, you draw a card if ${words}.`,
      ),
    ).toEqual([
      triggered(
        { kind: 'attackBatch', who: 'opponent', atLeast: 2 },
        { kind: 'conditional', condition, effect: { kind: 'draw', player: YOU, count: 1 } },
      ),
    ]);
  });

  test.each([
    'Whenever you attack with a creature, draw a card.',
    'Whenever you attack with one or more creatures, draw a card.',
    'Whenever you attack with two creatures, draw a card.',
    'Whenever you attack with two or more creatures you control, draw a card.',
    'Whenever you attack with two or more creatures or planeswalkers, draw a card.',
    'Whenever a player attacks with two or more creatures, draw a card.',
    'Whenever each opponent attacks with two or more creatures, draw a card.',
    'Whenever another player attacks you with two or more creatures, draw a card.',
    'Whenever another player attacks with two or more creatures, you draw a card if none of those creatures attacked you or a planeswalker you control.',
  ])('is not read: %s', (text) => {
    expect(drop(text)).toMatchObject({ reason: 'unrecognised' });
  });

  test('"none of those creatures attacked you" says nothing outside the trigger of an attack', () => {
    expect(
      drop('Whenever you gain life, you draw a card if none of those creatures attacked you.'),
    ).toMatchObject({ reason: expect.stringMatching(/unrecognised|notRunnable/) });
  });
});

describe('commanders as the subject of a trigger (CR 903.3) and proliferate (CR 701.34)', () => {
  test.each([
    ['a commander you control', { controller: 'you', commander: true }],
    ['another commander you control', { controller: 'you', commander: true, other: true }],
    ['a commander', { commander: true }],
    ['your commander', { commander: 'yours' }],
  ])('%s enters or attacks', (subject, what) => {
    expect(abilities(`Whenever ${subject} enters or attacks, you gain 2 life.`)).toEqual([
      triggered({ kind: 'entersBattlefield', what }, { kind: 'gainLife', player: YOU, amount: 2 }),
      triggered({ kind: 'attacks', what }, { kind: 'gainLife', player: YOU, amount: 2 }),
    ]);
  });

  test('your commander dies', () => {
    expect(abilities('Whenever your commander dies, draw a card.')).toEqual([
      triggered(
        { kind: 'dies', what: { commander: 'yours' } },
        { kind: 'draw', player: YOU, count: 1 },
      ),
    ]);
  });

  test('proliferate, as a spell, in a trigger and with another instruction', () => {
    expect(face('Proliferate.', 'sorcery').spell).toEqual({ effect: { kind: 'proliferate' } });
    expect(abilities('When ~ enters, proliferate.')).toEqual([
      triggered({ kind: 'entersBattlefield', what: THIS }, { kind: 'proliferate' }),
    ]);
    expect(face('Draw a card, then proliferate.', 'sorcery').spell).toEqual({
      effect: {
        kind: 'sequence',
        effects: [{ kind: 'draw', player: YOU, count: 1 }, { kind: 'proliferate' }],
      },
    });
  });

  test.each([
    'Whenever your commanders enter, draw a card.',
    'Whenever a commander creature enters, draw a card.',
    'Whenever ~ and your commander enter, draw a card.',
    'Whenever you cast your commander, draw a card.',
    'Proliferate twice.',
    'Proliferate target creature.',
  ])('is not read: %s', (text) => {
    expect(drop(text, 'sorcery')).toMatchObject({
      reason: expect.stringMatching(/unrecognised|notRunnable/),
    });
  });
});

describe('permanents that enter with counters (CR 614.1c, 614.12, 122.6)', () => {
  test.each([
    [
      'Each other Zombie you control enters with an additional +1/+1 counter on it.',
      { subtypes: ['Zombie'], controller: 'you', other: true },
      '+1/+1',
      1,
    ],
    [
      'Each other creature you control enters with two additional +1/+1 counters on it.',
      { types: ['creature'], controller: 'you', other: true },
      '+1/+1',
      2,
    ],
    [
      'Each other Elf you control enters with an additional -1/-1 counter on it.',
      { subtypes: ['Elf'], controller: 'you', other: true },
      '-1/-1',
      1,
    ],
    [
      'Each other nontoken creature you control enters with an additional +1/+1 counter on it.',
      { types: ['creature'], token: false, controller: 'you', other: true },
      '+1/+1',
      1,
    ],
    [
      'Each other creature you control of the chosen type enters with an additional +1/+1 counter on it.',
      { types: ['creature'], controller: 'you', other: true, chosenType: true },
      '+1/+1',
      1,
    ],
  ])('%s', (text, what, counter, count) => {
    expect(abilities(text)).toEqual([
      {
        kind: 'replacement',
        replacement: { kind: 'othersEnterWithCounters', what, counter, count },
      },
    ]);
  });

  test.each([
    [
      'Each other Zombie you control enters with an additional +1/+1 counter on it for each creature you control.',
      { kind: 'countOf', filter: { types: ['creature'], controller: 'you' } },
    ],
    [
      'Each other Zombie you control enters with an additional +1/+1 counter on it for each Zombie you already control.',
      { kind: 'countOf', filter: { subtypes: ['Zombie'], controller: 'you' } },
    ],
  ])('counted: %s', (text, count) => {
    expect(abilities(text)).toEqual([
      {
        kind: 'replacement',
        replacement: {
          kind: 'othersEnterWithCounters',
          what: { subtypes: ['Zombie'], controller: 'you', other: true },
          counter: '+1/+1',
          count,
        },
      },
    ]);
  });

  test.each([
    'Each creature you control enters with an additional +1/+1 counter on it.',
    'Each other creature enters with an additional +1/+1 counter on it.',
    'Each other creature you control enters with a +1/+1 counter on it.',
    'Each other creature you control enters with an additional +1/+1 counter.',
    'Each other creature an opponent controls enters with an additional +1/+1 counter on it.',
    'Each other creature you control enters with X additional +1/+1 counters on it.',
    'Each other creature you control enters with two additional +1/+1 counter on it.',
    'Each other creature you control enters with an additional +1/+1 counters on it.',
    'Each other creature you control enters with two additional +1/+1 counters on it for each creature you control.',
    'Each other creature you control enters tapped with an additional +1/+1 counter on it.',
  ])('is not read: %s', (text) => {
    expect(drop(text)).toMatchObject({ reason: expect.stringMatching(/unrecognised|notRunnable/) });
  });
});

describe("protections, prevented damage and a card that can't be cast early (CR 702.11b, 104.3, 615.1, 101.2)", () => {
  test('the protections of a player', () => {
    expect(abilities('You have hexproof.')).toEqual([
      { kind: 'static', static: { kind: 'playerHexproof' } },
    ]);
    expect(abilities("You can't lose the game.")).toEqual([
      { kind: 'static', static: { kind: 'cantLoseGame' } },
    ]);
    expect(abilities("Your opponents can't win the game.")).toEqual([
      { kind: 'static', static: { kind: 'opponentsCantWin' } },
    ]);
    expect(abilities("You can't lose the game and your opponents can't win the game.")).toEqual([
      { kind: 'static', static: { kind: 'cantLoseGame' } },
      { kind: 'static', static: { kind: 'opponentsCantWin' } },
    ]);
  });

  test.each([
    ['Prevent all damage that would be dealt to ~.', 'all'],
    ['Prevent all combat damage that would be dealt to ~.', 'combat'],
    ['Prevent all noncombat damage that would be dealt to ~.', 'noncombat'],
  ])('%s', (text, scope) => {
    expect(abilities(text)).toEqual([
      { kind: 'static', static: { kind: 'preventDamageToThis', subject: THIS, scope } },
    ]);
  });

  test.each([
    ['first turn', 1],
    ['first or second turns', 2],
    ['first, second, or third turns', 3],
    ['first, second, third, or fourth turns', 4],
  ])("You can't cast ~ during your %s of the game", (words, value) => {
    expect(abilities(`You can't cast ~ during your ${words} of the game.`)).toEqual([
      {
        kind: 'static',
        static: { kind: 'cantCastThis' },
        condition: { kind: 'ownTurnNumber', compare: { cmp: 'atMost', value } },
      },
    ]);
  });

  test.each([
    'You have shroud.',
    'You have hexproof until end of turn.',
    'You have hexproof as long as you control a Dragon.',
    'Each opponent has hexproof.',
    "You can't win the game.",
    "Your opponents can't lose the game.",
    "You can't lose the game as long as you control a Dragon.",
    "Each player can't lose the game.",
    'Prevent all combat damage that would be dealt to you.',
    'Prevent all combat damage that would be dealt to ~ this turn.',
    'Prevent the next 3 damage that would be dealt to ~.',
    "You can't cast ~ during your second turn of the game.",
    "You can't cast ~ during your first, third, or fourth turns of the game.",
    "You can't cast ~ during your first and second turns of the game.",
    "You can't cast creature spells during your first turn of the game.",
    "You can't cast ~ during your first turn.",
  ])('is not read: %s', (text) => {
    expect(drop(text)).toMatchObject({ reason: expect.stringMatching(/unrecognised|notRunnable/) });
  });
});

describe('a tax on blocking (CR 509.1b, 509.1d, 118.12a)', () => {
  test.each([
    ['{1}', ['1']],
    ['{2}', ['2']],
    ['{W}', ['W']],
    ['{1}{W}', ['1', 'W']],
  ])(
    "creatures can't block unless their controller pays %s for each of those creatures",
    (cost, symbols) => {
      expect(
        abilities(
          `Creatures can't block unless their controller pays ${cost} for each of those creatures.`,
        ),
      ).toEqual([
        { kind: 'static', static: { kind: 'blockTax', cost: [{ kind: 'mana', symbols }] } },
      ]);
      expect(
        abilities(
          `As long as ~ is attacking, creatures can't block unless their controller pays ${cost} for each of those creatures.`,
        ),
      ).toEqual([
        {
          kind: 'static',
          static: { kind: 'blockTax', cost: [{ kind: 'mana', symbols }], whileAttacking: true },
        },
      ]);
    },
  );

  test.each([
    "As long as ~ is untapped, creatures can't block unless their controller pays {1} for each of those creatures.",
    "As long as ~ is attacking, creatures can't block unless their controller pays {X} for each of those creatures.",
    "As long as ~ is attacking, creatures can't block unless their controller pays 2 life for each of those creatures.",
    "As long as ~ is attacking, creatures can't block unless their controller pays {1}.",
    "As long as ~ is attacking, creatures you control can't block unless their controller pays {1} for each of those creatures.",
    "As long as ~ is attacking, creatures can't attack unless their controller pays {1} for each of those creatures.",
    "As long as ~ is attacking, creatures can't block unless you pay {1} for each of those creatures.",
  ])('is not read: %s', (text) => {
    expect(drop(text)).toMatchObject({ reason: expect.stringMatching(/unrecognised|notRunnable/) });
  });
});

describe('exiling until the source leaves, a slot for each opponent, and a choice of types (CR 610.3, 115.1)', () => {
  test.each([
    ['nonland permanent', { notTypes: ['land'] }],
    ['artifact or enchantment', { anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }] }],
    ['creature', { types: ['creature'] }],
  ])('for each opponent, exile up to one target %s that player controls', (words, filter) => {
    expect(
      abilities(
        `When ~ enters, for each opponent, exile up to one target ${words} that player controls until ~ leaves the battlefield.`,
        'enchantment',
      ),
    ).toEqual([
      triggered(
        { kind: 'entersBattlefield', what: THIS },
        { kind: 'exile', objects: T1, until: 'sourceLeaves' },
        {
          targets: [
            {
              id: 't1',
              onePerOpponent: true,
              what: {
                kind: 'object',
                filter: { zone: 'battlefield', ...filter, controller: 'opponent' },
              },
            },
          ],
        },
      ),
    ]);
  });

  test('without the "until" the cards stay exiled', () => {
    const [ability] = abilities(
      'When ~ enters, for each opponent, exile up to one target creature that player controls.',
      'enchantment',
    );
    expect(ability).toMatchObject({ effect: { kind: 'exile', objects: T1 } });
    expect(JSON.stringify(ability)).not.toContain('until');
  });

  test('exile one target until the source leaves, of an opponent', () => {
    expect(
      abilities(
        'When ~ enters, exile target creature an opponent controls until ~ leaves the battlefield.',
        'enchantment',
      ),
    ).toEqual([
      triggered(
        { kind: 'entersBattlefield', what: THIS },
        { kind: 'exile', objects: T1, until: 'sourceLeaves' },
        {
          targets: [
            {
              id: 't1',
              what: {
                kind: 'object',
                filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
              },
            },
          ],
        },
      ),
    ]);
  });

  test.each([
    ['up to two target artifacts and/or enchantments', 2],
    ['up to three target artifacts and/or creatures', 3],
  ])('%s', (words, max) => {
    const [ability] = abilities(`When ~ enters, exile ${words}.`);
    expect(ability).toMatchObject({
      kind: 'triggered',
      targets: [{ id: 't1', min: 0, max, what: { kind: 'object' } }],
    });
  });

  test.each([
    [
      'artifact, enchantment, or creature with power 4 or greater',
      [
        { types: ['artifact'] },
        { types: ['enchantment'] },
        { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
      ],
    ],
    [
      'artifact or creature with toughness 2 or less',
      [{ types: ['artifact'] }, { types: ['creature'], toughness: { cmp: 'atMost', value: 2 } }],
    ],
    [
      'enchantment, planeswalker, or creature with power 1',
      [
        { types: ['enchantment'] },
        { types: ['planeswalker'] },
        { types: ['creature'], power: { cmp: 'equal', value: 1 } },
      ],
    ],
  ])('exile target %s', (words, anyOf) => {
    expect(face(`Exile target ${words}.`, 'sorcery').spell?.targets).toEqual([
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', anyOf } } },
    ]);
  });

  test.each([
    'For each opponent, exile target creature that player controls.',
    'For each opponent, exile up to two target creatures that player controls.',
    'For each opponent, exile up to one target creature you control.',
    'For each opponent, exile up to one target creature that player controls until end of turn.',
    'For each player, exile up to one target creature that player controls.',
    'For each opponent, destroy up to one target creature that player controls.',
    'Exile target creature card from a graveyard until ~ leaves the battlefield.',
    'Exile all creatures until ~ leaves the battlefield.',
    'Destroy target artifact, enchantment, or creature with mana value 3 or less.',
    'Exile target creature or planeswalker with power 4 or greater.',
    'Exile target artifact or enchantment with power 4 or greater.',
    'Exile target artifact, enchantment, or creature with power 4 or greater or toughness 3.',
  ])('is not read: %s', (text) => {
    expect(drop(text, 'sorcery')).toMatchObject({
      reason: expect.stringMatching(/unrecognised|notRunnable/),
    });
  });

  test('"until" and "for each opponent" belong to an ability of a permanent, not to a spell', () => {
    expect(
      drop(
        'For each opponent, exile up to one target creature that player controls until ~ leaves the battlefield.',
        'sorcery',
      ),
    ).toMatchObject({ reason: 'notRunnable' });
  });
});

describe('mana spent only on some spells, and mana of the chosen color (CR 106.6, 106.1b, 607.2d)', () => {
  test.each([
    ['an Angel spell', { subtypes: ['Angel'] }],
    ['a Dragon spell', { subtypes: ['Dragon'] }],
    ['creature spells', { types: ['creature'] }],
    ['an artifact or creature spell', { types: ['artifact', 'creature'] }],
    ['artifact spells', { types: ['artifact'] }],
  ])('Spend this mana only to cast %s', (words, spendOnly) => {
    expect(abilities(`{T}: Add {G}. Spend this mana only to cast ${words}.`, 'land')).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['G'] },
        spendOnly,
      },
    ]);
  });

  test('mana of the chosen color', () => {
    expect(abilities('{T}: Add one mana of the chosen color.', 'artifact')).toEqual([
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'chosenColor' } },
    ]);
  });

  test.each([
    '{T}: Add {G}. Spend this mana only to cast spells.',
    '{T}: Add {G}. Spend this mana only to cast a creature spell of the chosen type.',
    '{T}: Add {G}. Spend this mana only to cast a red creature spell.',
    '{T}: Add {G}. Spend this mana only to activate abilities.',
    '{T}: Add {G}. Spend this mana only to cast an Angel spell. Draw a card.',
    '{T}: Add one mana of the chosen type.',
    '{T}: Add two mana of the chosen color.',
    'Spend this mana only to cast an Angel spell.',
  ])('is not read: %s', (text) => {
    expect(drop(text, 'land')).toMatchObject({
      reason: expect.stringMatching(/unrecognised|notRunnable/),
    });
  });
});

describe('an Aura that makes the creature something else, and a card that returns itself (CR 205.1b, 400.7)', () => {
  test.each([
    ['Angel', 'an Angel'],
    ['Zombie', 'a Zombie'],
    ['Knight', 'a Knight'],
  ])(
    'Enchanted creature gets +2/+2, has flying, and is %s in addition to its other types',
    (type, phrase) => {
      expect(
        abilities(
          `Enchant creature\nEnchanted creature gets +2/+2, has flying, and is ${phrase} in addition to its other types.`,
          'enchantment',
          ['Aura'],
        ).slice(1),
      ).toEqual([
        { kind: 'static', static: { kind: 'modifyPt', subject: ATTACHED, power: 2, toughness: 2 } },
        {
          kind: 'static',
          static: { kind: 'grantKeyword', subject: ATTACHED, keyword: { kind: 'flying' } },
        },
        {
          kind: 'static',
          static: { kind: 'setTypes', subject: ATTACHED, additive: true, subtypes: [type] },
        },
      ]);
    },
  );

  test('a creature that is something in addition to its types alone', () => {
    expect(
      abilities(
        'Enchant creature\nEnchanted creature is a Zombie in addition to its other types.',
        'enchantment',
        ['Aura'],
      ).slice(1),
    ).toEqual([
      {
        kind: 'static',
        static: { kind: 'setTypes', subject: ATTACHED, additive: true, subtypes: ['Zombie'] },
      },
    ]);
  });

  test("return this card to its owner's hand", () => {
    expect(
      abilities(
        "Enchant creature\nWhen enchanted creature dies, return this card to its owner's hand.",
        'enchantment',
        ['Aura'],
      ).slice(1),
    ).toEqual([
      triggered(
        { kind: 'dies', what: { kind: 'attached' } },
        { kind: 'moveToZone', objects: { kind: 'thisCard' }, to: 'hand' },
      ),
    ]);
  });

  test.each([
    'Enchanted creature is an Angel in addition to its other types and draws a card.',
    'Enchanted creature is an Angel.',
    'Enchanted creature is Angel in addition to its other types.',
    'Enchanted creature gets +1/+1, and is a Banana in addition to its other types.',
    "When enchanted creature dies, return this card to its owner's library.",
    'When enchanted creature dies, return this card to your hand.',
  ])('is not read: %s', (text) => {
    expect(drop(text, 'enchantment', ['Aura'])).toMatchObject({
      reason: expect.stringMatching(/unrecognised|notRunnable/),
    });
  });
});

describe('a card put back by an effect and a test of the permanent that triggered it (CR 608.2c, 614.1a)', () => {
  const RETURN =
    'Whenever a land you control enters, you may return target nonland permanent card from your graveyard to your hand.';

  const target = (anyOf: unknown) => [
    {
      id: 't1',
      what: { kind: 'object', filter: { zone: 'graveyard', controller: 'you', anyOf } },
    },
  ];

  const PERMANENT_CARDS = [
    { types: ['artifact'] },
    { types: ['creature'] },
    { types: ['enchantment'] },
    { types: ['planeswalker'] },
    { types: ['battle'] },
  ];

  test.each([
    ['Plains', { subtypes: ['Plains'] }],
    ['Forest', { subtypes: ['Forest'] }],
  ])(
    '"If that land is a %s, you may return that card to the battlefield instead." offers both',
    (land, filter) => {
      const [ability] = abilities(
        `${RETURN} If that land is a ${land}, you may return that nonland permanent card to the battlefield instead.`,
      );
      expect(ability).toEqual(
        triggered(
          { kind: 'landfall' },
          {
            kind: 'conditional',
            condition: { kind: 'objectMatches', of: { kind: 'triggerSubject' }, filter },
            effect: {
              kind: 'sequence',
              effects: [
                {
                  kind: 'may',
                  effect: { kind: 'moveToZone', objects: T1, to: 'battlefield', controller: 'you' },
                },
                {
                  kind: 'conditional',
                  condition: { kind: 'not', term: { kind: 'didPrevious' } },
                  effect: { kind: 'may', effect: { kind: 'moveToZone', objects: T1, to: 'hand' } },
                },
              ],
            },
            else: { kind: 'may', effect: { kind: 'moveToZone', objects: T1, to: 'hand' } },
          },
          { targets: target(PERMANENT_CARDS) },
        ),
      );
    },
  );

  test('when the first instruction is not optional it still happens if the instead is declined', () => {
    const [ability] = abilities(
      'Whenever a land you control enters, return target nonland permanent card from your graveyard to your hand. If that land is a Plains, you may return that nonland permanent card to the battlefield instead.',
    );
    expect(ability).toMatchObject({
      effect: {
        kind: 'conditional',
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'may' },
            {
              kind: 'conditional',
              condition: { kind: 'not', term: { kind: 'didPrevious' } },
              effect: { kind: 'moveToZone', objects: T1, to: 'hand' },
            },
          ],
        },
        else: { kind: 'moveToZone', objects: T1, to: 'hand' },
      },
    });
  });

  test.each([
    ['nonland permanent card', PERMANENT_CARDS],
    [
      'permanent card',
      [...PERMANENT_CARDS.slice(0, 3), { types: ['land'] }, ...PERMANENT_CARDS.slice(3)],
    ],
    [
      'noncreature permanent card',
      [
        { types: ['artifact'] },
        { types: ['enchantment'] },
        { types: ['land'] },
        { types: ['planeswalker'] },
        { types: ['battle'] },
      ],
    ],
  ])('return target %s from your graveyard', (words, anyOf) => {
    expect(
      face(`Return target ${words} from your graveyard to your hand.`, 'sorcery').spell?.targets,
    ).toEqual(target(anyOf));
  });

  test.each([
    `${RETURN} If that land is a Plains, you may return that nonland permanent card to the battlefield.`,
    `${RETURN} If that land is a Plains or a Forest, you may return that nonland permanent card to the battlefield instead.`,
    `${RETURN} If that land is Plains, you may return that nonland permanent card to the battlefield instead.`,
    `${RETURN} If that land is a Plains, you may return that permanent to the battlefield instead.`,
    'Whenever a land you control enters, you may return target creature from the battlefield to your hand. If that land is a Plains, you may return that card to the battlefield instead.',
    'Whenever a land you control enters, exile target creature you control. Return that card to the battlefield.',
    'Whenever a land you control enters, exile target creature you control. If that land is a Plains, return that card to the battlefield.',
  ])('is not read: %s', (text) => {
    expect(drop(text)).toMatchObject({
      reason: expect.stringMatching(/unrecognised|notRunnable|unboundReference/),
    });
  });
});

describe('a grant to the creatures that have a keyword, and an alternative cost that taps creatures (CR 613.8, 118.9)', () => {
  test.each([
    ['flying', 'indestructible', ['flying'], 'indestructible'],
    ['haste', 'vigilance', ['haste'], 'vigilance'],
  ])('Other creatures you control with %s have %s', (has, gives, keywords, keyword) => {
    expect(abilities(`Other creatures you control with ${has} have ${gives}.`)).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', keywords },
            other: true,
          },
          keyword: { kind: keyword },
        },
      },
    ]);
  });

  test('a keyword in the subject is read only for a grant of a keyword', () => {
    expect(drop('Other creatures you control with flying get +1/+1.')).toMatchObject({
      reason: 'notRunnable',
    });
    expect(drop('Creatures without flying you control get +1/+1.')).toMatchObject({
      reason: 'notRunnable',
    });
  });

  test.each([
    [
      '{W}',
      'four',
      'creatures you control with flying',
      4,
      [{ kind: 'mana', symbols: ['W'] }],
      { types: ['creature'], keywords: ['flying'] },
    ],
    [
      '{1}{W}',
      'three',
      'creatures you control',
      3,
      [{ kind: 'mana', symbols: ['1', 'W'] }],
      { types: ['creature'] },
    ],
    [
      '{G}',
      'two',
      'Elves you control',
      2,
      [{ kind: 'mana', symbols: ['G'] }],
      { subtypes: ['Elf'] },
    ],
  ])(
    "You may pay %s and tap %s untapped %s rather than pay ~'s mana cost",
    (cost, number, words, count, mana, filter) => {
      expect(
        face(
          `You may pay ${cost} and tap ${number} untapped ${words} rather than pay ~'s mana cost.`,
        ).alternativeCosts,
      ).toEqual([{ kind: 'tapPermanents', cost: mana, filter, count }]);
    },
  );

  test.each([
    "You may pay {W} rather than pay ~'s mana cost.",
    "You may tap four untapped creatures you control with flying rather than pay ~'s mana cost.",
    "You may pay {W} and tap four untapped creatures with flying rather than pay ~'s mana cost.",
    "You may pay {X} and tap four untapped creatures you control rather than pay ~'s mana cost.",
    "You may pay {W} and tap an untapped creature you control rather than pay ~'s mana cost.",
    "You may pay {W} and tap four untapped creatures an opponent controls rather than pay ~'s mana cost.",
    "You may pay {W} and sacrifice a creature rather than pay ~'s mana cost.",
    "If you control a commander, you may pay {W} and tap four untapped creatures you control rather than pay ~'s mana cost.",
  ])('is not read: %s', (text) => {
    expect(drop(text)).toMatchObject({ reason: expect.stringMatching(/unrecognised|notRunnable/) });
  });
});

describe('a count of lands with the same name, and counters the permanent had (CR 201.2, 603.10a)', () => {
  test.each([
    ['three or more lands', { types: ['land'] }, 3],
    ['two or more artifacts', { types: ['artifact'] }, 2],
    ['four or more creatures', { types: ['creature'] }, 4],
  ])('Activate only if you control %s with the same name', (words, filter, count) => {
    expect(
      abilities(
        `{2}, {T}: Draw a card. Activate only if you control ${words} with the same name.`,
        'artifact',
      ),
    ).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2'] }, { kind: 'tap' }],
        effect: { kind: 'draw', player: YOU, count: 1 },
        activateOnlyIf: { kind: 'sameNameAtLeast', filter, count },
      },
    ]);
  });

  test('as the intervening "if" of a trigger', () => {
    expect(
      abilities(
        'When ~ enters, if you control three or more lands with the same name, draw a card.',
      ),
    ).toEqual([
      triggered(
        { kind: 'entersBattlefield', what: THIS },
        { kind: 'draw', player: YOU, count: 1 },
        { interveningIf: { kind: 'sameNameAtLeast', filter: { types: ['land'] }, count: 3 } },
      ),
    ]);
  });

  test.each([
    ['it had counters on it', true],
    ['it had a +1/+1 counter on it', '+1/+1'],
    ['it had a page counter on it', 'page'],
    ['it had +1/+1 counters on it', '+1/+1'],
  ])(
    '"if %s" is part of the filter of the trigger about the permanent that left',
    (words, hasCounter) => {
      for (const [event, kind] of [
        ['leaves the battlefield', 'leavesBattlefield'],
        ['dies', 'dies'],
      ] as const) {
        expect(
          abilities(`Whenever another creature you control ${event}, if ${words}, draw a card.`),
        ).toEqual([
          triggered(
            { kind, what: { types: ['creature'], controller: 'you', other: true, hasCounter } },
            { kind: 'draw', player: YOU, count: 1 },
          ),
        ]);
      }
    },
  );

  test.each([
    'When ~ enters, if you control three or more lands, draw a card with the same name.',
    '{2}, {T}: Draw a card. Activate only if you control three lands with the same name.',
    '{2}, {T}: Draw a card. Activate only if you control a land with the same name.',
    '{2}, {T}: Draw a card. Activate only if you control three or more lands with the same name as ~.',
    'When ~ dies, if it had counters on it, draw a card.',
    'Whenever ~ becomes tapped, if it had counters on it, draw a card.',
    'Whenever another creature you control becomes tapped, if it had counters on it, draw a card.',
    'Whenever another creature you control dies, if it had no counters on it, draw a card.',
    'Whenever another creature you control dies, if it had two +1/+1 counters on it, draw a card.',
  ])('is not read or not run: %s', (text) => {
    expect(drop(text, 'artifact')).toMatchObject({
      reason: expect.stringMatching(/unrecognised|notRunnable/),
    });
  });
});
