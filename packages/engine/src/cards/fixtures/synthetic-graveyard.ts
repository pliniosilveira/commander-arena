/**
 * SYNTHETIC CARDS FOR CASTING FROM THE GRAVEYARD, ABILITIES THAT WORK FROM THE GRAVEYARD AND "ENTERS UNTAPPED". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-135: "{T}: You may cast target [type] creature card from your graveyard this turn",
 * "{M}: Return this card from your graveyard to the battlefield with a +1/+1 counter on it. This ability costs {4} less to activate
 * if an opponent controls four or more nonbasic lands", and a land that enters tapped unless a condition holds and has an enters
 * trigger that fires only if it entered untapped. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST
 * does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Condition, Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const THIS = { kind: 'this' } as const;

/** "{T}: You may cast target [type] creature card from your graveyard this turn." on a 2/2 of that type. */
const chanter = (type: string): CardDefinition =>
  singleFace({
    name: `SYNTHETIC Grave Chanter ${type}`,
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: [type, 'Warlock'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText: `{T}: You may cast target ${type} creature card from your graveyard this turn.`,
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: {
                zone: 'graveyard',
                types: ['creature'],
                subtypes: [type],
                controller: 'you',
              },
            },
          },
        ],
        effect: { kind: 'mayCast', objects: T1, duration: 'untilEndOfTurn' },
      },
    ],
  });

const NONBASIC_LANDS: Condition = {
  kind: 'opponentControlsAtLeast',
  filter: { types: ['land'], notSupertypes: ['basic'] },
  count: 4,
};

/** "{4}{B}{B}: Return this card from your graveyard to the battlefield with a +1/+1 counter on it. This ability costs {4} less ..." */
const revenant = (type: string): CardDefinition =>
  singleFace({
    name: `SYNTHETIC Revenant ${type}`,
    manaCost: ['2'],
    types: ['artifact', 'creature'],
    subtypes: [type],
    colors: [],
    colorIdentity: ['B'],
    power: 3,
    toughness: 1,
    oracleText:
      "This creature can't block. {4}{B}{B}: Return this card from your graveyard to the battlefield with a +1/+1 counter on it. This ability costs {4} less to activate if an opponent controls four or more nonbasic lands.",
    abilities: [
      {
        kind: 'static',
        static: { kind: 'restriction', subject: { kind: 'this' }, restriction: 'cantBlock' },
      },
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['4', 'B', 'B'] }],
        functionsIn: 'graveyard',
        costReducedIf: { generic: 4, condition: NONBASIC_LANDS },
        effect: {
          kind: 'moveToZone',
          objects: THIS,
          to: 'battlefield',
          controller: 'owner',
          withCounters: { counter: '+1/+1', count: 1 },
        },
      },
    ],
  });

const gain = (amount: number): Effect => ({ kind: 'gainLife', player: YOU, amount });

const SWAMP_MANA: Ability = {
  kind: 'mana',
  cost: [{ kind: 'tap' }],
  production: { kind: 'fixed', mana: ['B'] },
};

export const SYNTHETIC_GRAVEYARD_LIST: readonly CardDefinition[] = [
  chanter('Zombie'),
  chanter('Goblin'),
  chanter('Angel'),
  revenant('Zombie'),
  revenant('Dinosaur'),
  // "This land enters tapped unless you control three or more other Swamps. When this land enters untapped, you may put target
  // creature card from your graveyard on top of your library."
  singleFace({
    name: 'SYNTHETIC Haunted Cottage',
    manaCost: null,
    types: ['land'],
    subtypes: ['Swamp'],
    colors: [],
    colorIdentity: ['B'],
    oracleText:
      '({T}: Add {B}.) This land enters tapped unless you control three or more other Swamps. When this land enters untapped, you may put target creature card from your graveyard on top of your library.',
    abilities: [
      SWAMP_MANA,
      {
        kind: 'replacement',
        replacement: {
          kind: 'entersTapped',
          unless: { kind: 'controlsAtLeast', filter: { subtypes: ['Swamp'] }, count: 3 },
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS, tapped: false },
        optional: true,
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
            },
          },
        ],
        effect: { kind: 'moveToZone', objects: T1, to: 'library', position: 'top' },
      },
    ],
  }),
  // "This land enters tapped. When this land enters tapped, you gain 1 life." (the other way round)
  singleFace({
    name: 'SYNTHETIC Sulking Tarn',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['U'],
    oracleText:
      '{T}: Add {U}. This land enters tapped. When this land enters tapped, you gain 1 life.',
    abilities: [
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['U'] } },
      { kind: 'replacement', replacement: { kind: 'entersTapped' } },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS, tapped: true },
        effect: gain(1),
      },
    ],
  }),
  // "When another land enters untapped under your control, you gain 1 life." (a filter subject)
  singleFace({
    name: 'SYNTHETIC Eager Gardener',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Elf'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText: 'Whenever a land enters untapped under your control, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'entersBattlefield',
          what: { types: ['land'], controller: 'you' },
          tapped: false,
        },
        effect: gain(1),
      },
    ],
  }),
];
