/**
 * SYNTHETIC CARDS FOR MOVING CARDS BETWEEN ZONES, "YOU MAY ... IF YOU DO", REFLEXIVE TRIGGERS AND SACRIFICING ANY NUMBER.
 * NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-135: returning a creature card from the graveyard with a follow-up that reads
 * the card's creature type ("If it's a Zombie card, draw a card", "If it's an Angel, put two +1/+1 counters on it"), "you may
 * discard a card. If you do, draw a card", a reflexive trigger ("you may exile it. When you do, return target creature card ..."),
 * sacrificing any number of other permanents and drawing that many cards, an "Nth from the top" library move after a death
 * or an exile, and paying life equal to a count as the cost of an ability. Names start with "SYNTHETIC "; oracleId is null. The
 * text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect, ObjectFilter, TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const THIS = { kind: 'this' } as const;
const MOVED = { kind: 'moved' } as const;
const THIS_CARD = { kind: 'thisCard' } as const;

/** "Target creature card from your graveyard". */
const CREATURE_CARD_IN_YOUR_YARD: TargetSpec = {
  id: 't1',
  what: {
    kind: 'object',
    filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
  },
};

const spell = (
  name: string,
  manaCost: string[],
  oracleText: string,
  targets: TargetSpec[],
  effect: Effect,
  colors: ('W' | 'U' | 'B' | 'R' | 'G')[] = ['B'],
): CardDefinition =>
  singleFace({
    name,
    manaCost,
    types: ['sorcery'],
    colors,
    colorIdentity: colors,
    oracleText,
    spell: { targets, effect },
  });

/** "Return target creature card from your graveyard to your hand. If it's a [type] card, draw a card." */
const recall = (type: string): CardDefinition =>
  spell(
    `SYNTHETIC Recall ${type}`,
    ['1', 'B'],
    `Return target creature card from your graveyard to your hand. If it's a ${type} card, draw a card.`,
    [CREATURE_CARD_IN_YOUR_YARD],
    {
      kind: 'sequence',
      effects: [
        { kind: 'moveToZone', objects: T1, to: 'hand' },
        {
          kind: 'conditional',
          condition: { kind: 'objectMatches', of: T1, filter: { subtypes: [type] } },
          effect: { kind: 'draw', player: YOU, count: 1 },
        },
      ],
    },
  );

/** "Return target creature card from your graveyard to the battlefield. If it's a [type], put two +1/+1 counters on it." */
const raise = (type: string): CardDefinition =>
  spell(
    `SYNTHETIC Reanimate ${type}`,
    ['2', 'B'],
    `Return target creature card from your graveyard to the battlefield. If it's a ${type}, put two +1/+1 counters on it.`,
    [CREATURE_CARD_IN_YOUR_YARD],
    {
      kind: 'sequence',
      effects: [
        { kind: 'moveToZone', objects: T1, to: 'battlefield' },
        {
          kind: 'conditional',
          condition: { kind: 'objectMatches', of: MOVED, filter: { subtypes: [type] } },
          effect: { kind: 'addCounters', objects: MOVED, counter: '+1/+1', count: 2 },
        },
      ],
    },
  );

/** "If it's not a [type] card" reads the negation: the draw happens for the cards that are not. */
const recallOther = (type: string): CardDefinition =>
  spell(
    `SYNTHETIC Recall Non-${type}`,
    ['1', 'B'],
    `Return target creature card from your graveyard to your hand. Unless it's a ${type} card, you gain 3 life.`,
    [CREATURE_CARD_IN_YOUR_YARD],
    {
      kind: 'sequence',
      effects: [
        { kind: 'moveToZone', objects: T1, to: 'hand' },
        {
          kind: 'conditional',
          condition: {
            kind: 'not',
            term: { kind: 'objectMatches', of: T1, filter: { subtypes: [type] } },
          },
          effect: { kind: 'gainLife', player: YOU, amount: 3 },
        },
      ],
    },
  );

const entersThis = { kind: 'entersBattlefield', what: THIS } as const;

const discardThenDraw = (count: number): Effect => ({
  kind: 'sequence',
  effects: [
    { kind: 'may', effect: { kind: 'discard', player: YOU, count: 1 } },
    {
      kind: 'conditional',
      condition: { kind: 'didPrevious' },
      effect: { kind: 'draw', player: YOU, count },
    },
  ],
});

const ANY_OTHER_PERMANENT: ObjectFilter = { other: true };

export const SYNTHETIC_RECURSION_LIST: readonly CardDefinition[] = [
  recall('Zombie'),
  recall('Goblin'),
  recall('Angel'),
  raise('Angel'),
  raise('Zombie'),
  recallOther('Zombie'),
  // ---- "You may ... If you do ..." (CR 608.2c, 603.12)
  // "When this creature enters, you may discard a card. If you do, draw two cards."
  singleFace({
    name: 'SYNTHETIC Pitch Reunion',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Goblin'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 1,
    toughness: 1,
    oracleText: 'When this creature enters, you may discard a card. If you do, draw two cards.',
    abilities: [{ kind: 'triggered', trigger: entersThis, effect: discardThenDraw(2) }],
  }),
  // "Whenever you cast a creature spell, you may discard a card. If you do, draw a card."
  singleFace({
    name: 'SYNTHETIC Pitch Monument',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'Whenever you cast a creature spell, you may discard a card. If you do, draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { stackKind: 'spell', types: ['creature'] },
          by: 'you',
        },
        effect: discardThenDraw(1),
      },
    ],
  }),
  // "You may mill two cards. If you do, you gain 2 life." (the count of cards actually milled)
  spell(
    'SYNTHETIC Mill For Life',
    ['U'],
    'You may mill two cards. If you do, you gain 2 life.',
    [],
    {
      kind: 'sequence',
      effects: [
        { kind: 'may', effect: { kind: 'mill', player: YOU, count: 2 } },
        {
          kind: 'conditional',
          condition: { kind: 'didPrevious' },
          effect: { kind: 'gainLife', player: YOU, amount: 2 },
        },
      ],
    },
    ['U'],
  ),
  // "You may draw two cards. If you do, you gain 2 life." (the draws count together: a second draw that finds nothing still leaves the first done)
  spell(
    'SYNTHETIC Draw For Life',
    ['U'],
    'You may draw two cards. If you do, you gain 2 life.',
    [],
    {
      kind: 'sequence',
      effects: [
        { kind: 'may', effect: { kind: 'draw', player: YOU, count: 2 } },
        {
          kind: 'conditional',
          condition: { kind: 'didPrevious' },
          effect: { kind: 'gainLife', player: YOU, amount: 2 },
        },
      ],
    },
    ['U'],
  ),
  // "Discard a card. Then you may discard a card. If you do, draw two cards." (what the first discard did does not count)
  spell(
    'SYNTHETIC Double Discard',
    ['1', 'R'],
    'Discard a card. Then you may discard a card. If you do, draw two cards.',
    [],
    {
      kind: 'sequence',
      effects: [{ kind: 'discard', player: YOU, count: 1 }, discardThenDraw(2)],
    },
    ['R'],
  ),
  // ---- Reflexive triggers (CR 603.12)
  // "When this creature dies, you may exile it. When you do, return target creature card from your graveyard to your hand."
  singleFace({
    name: 'SYNTHETIC Keen Butler',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 2,
    oracleText:
      'When this creature dies, you may exile it. When you do, return target creature card from your graveyard to your hand.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: THIS },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'may', effect: { kind: 'exile', objects: THIS_CARD } },
            {
              kind: 'reflexive',
              targets: [CREATURE_CARD_IN_YOUR_YARD],
              effect: { kind: 'moveToZone', objects: T1, to: 'hand' },
            },
          ],
        },
      },
    ],
  }),
  // "When this creature enters, you may sacrifice another creature. When you do, this deals 3 damage to any target."
  singleFace({
    name: 'SYNTHETIC Heart Striker',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Goblin'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      'When this creature enters, you may sacrifice another creature. When you do, this creature deals 3 damage to any target.',
    abilities: [
      {
        kind: 'triggered',
        trigger: entersThis,
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'may',
              effect: {
                kind: 'sacrifice',
                objects: { kind: 'choose', filter: { types: ['creature'], other: true } },
              },
            },
            {
              kind: 'reflexive',
              targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
              effect: { kind: 'dealDamage', amount: 3, to: T1 },
            },
          ],
        },
      },
    ],
  }),
  // ---- Any number of permanents, then that many cards; a library move after a death or an exile
  // "When this enters, sacrifice any number of other permanents, then draw that many cards." and
  // "When this dies or is put into exile from the battlefield, you may put it into its owner's library third from the top."
  singleFace({
    name: 'SYNTHETIC Greedy God',
    manaCost: ['3', 'B', 'B'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Zombie', 'God'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 5,
    toughness: 6,
    oracleText:
      "When this creature enters, sacrifice any number of other permanents, then draw that many cards. When this creature dies or is put into exile from the battlefield, you may put it into its owner's library third from the top.",
    abilities: [
      {
        kind: 'triggered',
        trigger: entersThis,
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'sacrifice',
              objects: { kind: 'choose', filter: ANY_OTHER_PERMANENT, anyNumber: true },
            },
            { kind: 'draw', player: YOU, count: { kind: 'thisWay', what: 'sacrificed' } },
          ],
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'leavesBattlefield', what: THIS, to: ['graveyard', 'exile'] },
        effect: {
          kind: 'may',
          effect: { kind: 'moveToZone', objects: THIS_CARD, to: 'library', position: 3 },
        },
      },
    ],
  }),
  // ---- Life paid equal to a count, as the cost of an ability
  // "{1}, {T}, Pay life equal to the number of colors in your commanders' color identity: Draw a card."
  singleFace({
    name: 'SYNTHETIC Tithe Well',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText:
      "{1}, {T}, Pay life equal to the number of colors in your commanders' color identity: Draw a card.",
    abilities: [
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['1'] },
          { kind: 'tap' },
          { kind: 'payLife', amount: { kind: 'commanderColors' } },
        ],
        effect: { kind: 'draw', player: YOU, count: 1 },
      } satisfies Ability,
    ],
  }),
  // "{T}, Pay life equal to the creatures you control: Draw a card." (another count, a free cost)
  singleFace({
    name: 'SYNTHETIC Blood Well',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}, Pay life equal to the number of creatures you control: Draw a card.',
    abilities: [
      {
        kind: 'activated',
        cost: [
          { kind: 'tap' },
          {
            kind: 'payLife',
            amount: { kind: 'countOf', filter: { types: ['creature'], controller: 'you' } },
          },
        ],
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ],
  }),
];
