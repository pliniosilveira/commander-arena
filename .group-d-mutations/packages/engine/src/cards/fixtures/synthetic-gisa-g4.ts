/**
 * SYNTHETIC CARDS FOR GROUP 4 OF THE GISA DECK (ISSUE 41, D-459 TO D-462). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the group added to the engine: a return from the graveyard with haste, a delayed exile and "If it would leave the battlefield, exile it instead"
 * (`delayedTrigger` of an `exile` of `moved`, `exileIfLeaves`, CR 603.7c, 614.1a), a static ability that reduces the cost of the activated abilities of the creature cards in a graveyard
 * (`abilityCostReduction` of `ofObjects`, CR 601.2f, 113.6b), an ability that works from the hand with a reveal cost and can be activated only in its controller's turn (`revealThis`,
 * CR 701.20a, `activateOnlyIf` of `yourTurn`) and a linked exile that puts the creature cards it exiled onto the battlefield as 1/1 Spirits with flying counters (`linkedExile` with a
 * filter, `setTypes` with a base power and toughness, CR 607.2a). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the
 * definition of a real card (the real ones are read from the golden corpus by the grammar, and have the same abilities).
 */
import type { Ability, Cost } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const mana = (...symbols: string[]): Cost => ({ kind: 'mana', symbols });
const T1 = { kind: 'target', id: 't1' } as const;
const MOVED = { kind: 'moved' } as const;

/** "{2}{B}{B}, {T}: Return target creature card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step. If it would leave ..." */
const WHIP_ABILITY: Ability = {
  kind: 'activated',
  cost: [mana('2', 'B', 'B'), { kind: 'tap' }],
  targets: [
    {
      id: 't1',
      what: {
        kind: 'object',
        filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
      },
    },
  ],
  effect: {
    kind: 'sequence',
    effects: [
      { kind: 'moveToZone', objects: T1, to: 'battlefield', controller: 'you' },
      { kind: 'grantKeyword', objects: MOVED, keyword: { kind: 'haste' }, duration: 'permanent' },
      {
        kind: 'delayedTrigger',
        at: { step: 'endStep', whose: 'each' },
        effect: { kind: 'exile', objects: MOVED },
      },
      { kind: 'exileIfLeaves', objects: MOVED },
    ],
  },
  timing: 'sorcery',
};

export const SYNTHETIC_GISA_G4_LIST: readonly CardDefinition[] = [
  // "Creatures you control have lifelink." and the reanimation with a delayed exile.
  singleFace({
    name: 'SYNTHETIC Grave Whip',
    manaCost: ['2', 'B', 'B'],
    supertypes: ['legendary'],
    types: ['enchantment', 'artifact'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Creatures you control have lifelink.\n{2}{B}{B}, {T}: Return target creature card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step. If it would leave the battlefield, exile it instead of putting it anywhere else. Activate only as a sorcery.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
          keyword: { kind: 'lifelink' },
        },
      },
      WHIP_ABILITY,
    ],
  }),
  // "Activated abilities of creature cards in your graveyard cost {1} less to activate." and the Zombie mill.
  singleFace({
    name: 'SYNTHETIC Grave Tools',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'Activated abilities of creature cards in your graveyard cost {1} less to activate.\nTap an untapped Zombie you control: Target player mills a card.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'abilityCostReduction',
          abilities: 'ofObjects',
          objects: { zone: 'graveyard', types: ['creature'], controller: 'you' },
          amount: 1,
        },
      },
      {
        kind: 'activated',
        cost: [
          { kind: 'tapPermanents', filter: { subtypes: ['Zombie'], controller: 'you' }, count: 1 },
        ],
        targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
        effect: { kind: 'mill', player: T1, count: 1 },
      },
    ],
  }),
  // An ability that works from the hand: a reveal cost, only in its controller's turn; and the creatures with the counter die when it enters.
  singleFace({
    name: 'SYNTHETIC Prey Hunter',
    manaCost: ['4', 'B', 'B'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Elder', 'Dinosaur'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 7,
    toughness: 7,
    oracleText:
      'Deathtouch\n{B}, Reveal this card from your hand: Put a prey counter on target creature. Activate only during your turn.\nWhen this creature enters, destroy each creature your opponents control with a prey counter on it.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'deathtouch' } },
      {
        kind: 'activated',
        cost: [mana('B'), { kind: 'revealThis' }],
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          },
        ],
        effect: { kind: 'addCounters', objects: T1, counter: 'prey', count: 1 },
        functionsIn: 'hand',
        activateOnlyIf: { kind: 'yourTurn' },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'destroy',
          objects: {
            kind: 'each',
            filter: {
              zone: 'battlefield',
              types: ['creature'],
              controller: 'opponent',
              hasCounter: 'prey',
            },
          },
        },
      },
    ],
  }),
  // A linked exile: {T}: exile a card from a graveyard; {6}, {T}, sacrifice: the creature cards come back as 1/1 Spirits with flying counters.
  singleFace({
    name: 'SYNTHETIC Soul Vacuum',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{T}: Exile target card from a graveyard.\n{6}, {T}, Sacrifice this artifact: Put each creature card exiled with this artifact onto the battlefield under your control with a flying counter on it. Each of them is a 1/1 Spirit in addition to its other types. Activate only as a sorcery.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'graveyard' } } }],
        effect: { kind: 'exile', objects: T1, linked: true },
      },
      {
        kind: 'activated',
        cost: [mana('6'), { kind: 'tap' }, { kind: 'sacrifice', what: { kind: 'this' } }],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'moveToZone',
              objects: { kind: 'linkedExile', filter: { types: ['creature'] } },
              to: 'battlefield',
              controller: 'you',
              withCounters: { counter: 'flying', count: 1 },
            },
            {
              kind: 'setTypes',
              objects: MOVED,
              types: ['creature'],
              subtypes: ['Spirit'],
              additive: true,
              basePt: { power: 1, toughness: 1 },
              duration: 'permanent',
            },
          ],
        },
        timing: 'sorcery',
      },
    ],
  }),
];
