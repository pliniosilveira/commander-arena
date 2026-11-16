/**
 * SYNTHETIC CARDS FOR GROUP 1 OF THE GALADRIEL DECK (issue 43, D-1600 and later). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real cards of the group need from the engine, written out by hand (the cards package checks that the grammar lowers the real Oracle text to these
 * same nodes): a creature that scries when a creature of its controller enters and makes the Ring tempt its controller the second time that ability resolves in a turn, a creature that
 * scries 3 when the Ring tempts its controller and the Ring-bearer chosen is another creature and that may reveal the top card whenever its controller scries (a land goes onto the
 * battlefield tapped), a creature that draws a card whenever its controller scries or surveils, a sorcery that scries 3 and then may reveal the top card (a creature card draws a
 * card), a sorcery that scries 3 and then reveals the top card (a creature or land card draws a card), a planeswalker whose printed loyalty is X (it enters with X loyalty counters)
 * with a scry, a look at the top card that puts a land or a small creature onto the battlefield and a minus that makes two lands into creatures, an instant that destroys an artifact,
 * an enchantment or a creature with flying and scries 1, and a spell that surveils. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not
 * Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const END = 'untilEndOfTurn' as const;

/** "If this is the second time this ability has resolved this turn, the Ring tempts you." after "scry 1". */
const WARDEN_EFFECT: Effect = {
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

const LAND_OR_CREATURE_UP_TO_LOYALTY: Effect = {
  kind: 'lookAtTop',
  count: 1,
  take: {
    filter: { anyOf: [{ types: ['land'] }, { types: ['creature'] }] },
    max: 1,
    to: 'battlefield',
    manaValueAtMost: { kind: 'countersOn', of: { kind: 'this' }, counter: 'loyalty' },
  },
  rest: 'top',
};

const TWO_LANDS = [
  {
    id: 't1',
    what: {
      kind: 'object',
      filter: { zone: 'battlefield', types: ['land'], controller: 'you' },
    },
    min: 0,
    max: 2,
  },
] as const;

const walkerAbility = (
  change: number,
  effect: Effect,
  targets?: Extract<Ability, { kind: 'activated' }>['targets'],
): Ability => ({
  kind: 'activated',
  cost: [{ kind: 'loyalty', change }],
  effect,
  ...(targets === undefined ? {} : { targets }),
});

export const SYNTHETIC_GALADRIEL_G1_LIST: readonly CardDefinition[] = [
  // "Whenever this creature or another creature you control enters, scry 1. If this is the second time this ability has resolved this turn, the Ring tempts you."
  // (two engine abilities, one for each event, with one body)
  singleFace({
    name: 'SYNTHETIC Rivendell Warden',
    manaCost: ['2', 'U'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Elf', 'Noble'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 3,
    toughness: 2,
    oracleText:
      'Whenever this creature or another creature you control enters, scry 1. If this is the second time this ability has resolved this turn, the Ring tempts you.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: WARDEN_EFFECT,
      },
      {
        kind: 'triggered',
        trigger: {
          kind: 'entersBattlefield',
          what: { types: ['creature'], other: true, controller: 'you' },
        },
        effect: WARDEN_EFFECT,
      },
    ],
  }),
  // "Whenever the Ring tempts you, if you chose a creature other than this creature as your Ring-bearer, scry 3.
  //  Whenever you scry, you may reveal the top card of your library. If a land card is revealed this way, put it onto the battlefield tapped."
  singleFace({
    name: 'SYNTHETIC Lorien Lady',
    manaCost: ['1', 'G', 'U'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Elf', 'Noble'],
    colors: ['U', 'G'],
    colorIdentity: ['U', 'G'],
    power: 3,
    toughness: 3,
    oracleText:
      'Whenever the Ring tempts you, if you chose a creature other than this creature as your Ring-bearer, scry 3.\nWhenever you scry, you may reveal the top card of your library. If a land card is revealed this way, put it onto the battlefield tapped.',
    abilities: [
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
    ],
  }),
  // "Whenever you scry or surveil, draw a card." (two engine abilities, one for each event)
  singleFace({
    name: 'SYNTHETIC Archon Seer',
    manaCost: ['2', 'U'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Human', 'Warlock'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 4,
    oracleText: 'Whenever you scry or surveil, draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'scries', who: 'you' },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'surveils', who: 'you' },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ],
  }),
  // "Scry 3, then you may reveal the top card of your library. If a creature card is revealed this way, draw a card."
  singleFace({
    name: 'SYNTHETIC Far Sight',
    manaCost: ['G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Scry 3, then you may reveal the top card of your library. If a creature card is revealed this way, draw a card.',
    spell: {
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
              onMatch: { kind: 'draw', player: YOU, count: 1 },
            },
          },
        ],
      },
    },
  }),
  // "Scry 3, then reveal the top card of your library. If it's a creature or land card, draw a card."
  singleFace({
    name: 'SYNTHETIC Run Down',
    manaCost: ['1', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      "Scry 3, then reveal the top card of your library. If it's a creature or land card, draw a card.",
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'scry', count: 3 },
          {
            kind: 'revealTop',
            player: YOU,
            ifMatches: { anyOf: [{ types: ['creature'] }, { types: ['land'] }] },
            onMatch: { kind: 'draw', player: YOU, count: 1 },
          },
        ],
      },
    },
  }),
  // "+2: Scry 2.
  //  0: Look at the top card of your library. If it's a land card or a creature card with mana value less than or equal to the number of loyalty counters on this planeswalker, you may put that card onto the battlefield.
  //  −6: Untap up to two target lands you control. They become 5/5 Elemental creatures with flying and haste until end of turn. They're still lands."
  // (the printed loyalty is X: the planeswalker enters with X loyalty counters)
  singleFace({
    name: 'SYNTHETIC Seer of Elements',
    manaCost: ['X', 'G', 'U'],
    supertypes: ['legendary'],
    types: ['planeswalker'],
    subtypes: ['Nissa'],
    colors: ['U', 'G'],
    colorIdentity: ['U', 'G'],
    loyalty: 0,
    oracleText:
      "+2: Scry 2.\n0: Look at the top card of your library. If it's a land card or a creature card with mana value less than or equal to the number of loyalty counters on this planeswalker, you may put that card onto the battlefield.\n−6: Untap up to two target lands you control. They become 5/5 Elemental creatures with flying and haste until end of turn. They're still lands.",
    abilities: [
      {
        kind: 'replacement',
        replacement: { kind: 'entersWithCounters', counter: 'loyalty', count: { kind: 'x' } },
      },
      walkerAbility(2, { kind: 'scry', count: 2 }),
      walkerAbility(0, LAND_OR_CREATURE_UP_TO_LOYALTY),
      walkerAbility(
        -6,
        {
          kind: 'sequence',
          effects: [
            { kind: 'untap', objects: T1 },
            {
              kind: 'setTypes',
              objects: T1,
              types: ['creature'],
              subtypes: ['Elemental'],
              additive: true,
              duration: END,
            },
            { kind: 'setPt', objects: T1, power: 5, toughness: 5, duration: END },
            { kind: 'grantKeyword', objects: T1, keyword: { kind: 'flying' }, duration: END },
            { kind: 'grantKeyword', objects: T1, keyword: { kind: 'haste' }, duration: END },
          ],
        },
        TWO_LANDS,
      ),
    ],
  }),
  // "Destroy target artifact, enchantment, or creature with flying. Scry 1."
  singleFace({
    name: 'SYNTHETIC Arrow Rain',
    manaCost: ['2', 'G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Destroy target artifact, enchantment, or creature with flying. Scry 1.',
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
                { types: ['creature'], keywords: ['flying'] },
              ],
            },
          },
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'destroy', objects: T1 },
          { kind: 'scry', count: 1 },
        ],
      },
    },
  }),
  // "Surveil 2." (a surveil that is not a creature's ability)
  singleFace({
    name: 'SYNTHETIC Quiet Look',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Surveil 2.',
    spell: { effect: { kind: 'surveil', count: 2 } },
  }),
];
