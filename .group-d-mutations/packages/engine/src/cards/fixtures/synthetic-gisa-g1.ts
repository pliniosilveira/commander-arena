/**
 * SYNTHETIC CARDS FOR GROUP 1 OF THE GISA DECK (issue 41, D-472 TO D-477). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real cards of the group need from the engine, written out by hand (the cards package checks that the grammar lowers the real Oracle
 * text to these same nodes): Afflict N and a group that has it (CR 702.130), a group that has a landwalk (CR 702.14), a cost that taps an untapped creature of a type the
 * controller controls (CR 118.3, 701.26), a land that becomes a basic land type (CR 305.7), the log of combat damage by a creature type (CR 120.2a) and a trigger on an attack
 * with a power filter on a token (CR 603.2). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these
 * is the definition of a real card.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const END = 'untilEndOfTurn' as const;
const THIS = { kind: 'this' } as const;
const YOU = { kind: 'you' } as const;

/** "Tap an untapped Zombie you control": one untapped Zombie, the source itself included (it is not a {T} cost, CR 302.6). */
const TAP_A_ZOMBIE = {
  kind: 'tapPermanents',
  filter: { subtypes: ['Zombie'], controller: 'you' },
  count: 1,
} as const;

export const AFFLICT_MONARCH = 'SYNTHETIC Afflict Monarch';
export const WALK_MASTER = 'SYNTHETIC Walk Master';
export const TRAIL_SCOUT = 'SYNTHETIC Trail Scout';
export const HORDE_BANNER = 'SYNTHETIC Horde Banner';
export const GISA_ZOMBIE = 'SYNTHETIC Gisa Zombie';

const monarchAbilities: readonly Ability[] = [
  { kind: 'keyword', keyword: { kind: 'afflict', count: 3 } },
  {
    kind: 'static',
    static: {
      kind: 'grantKeyword',
      subject: { kind: 'filter', filter: { subtypes: ['Zombie'], controller: 'you' }, other: true },
      keyword: { kind: 'afflict', count: 3 },
    },
  },
  {
    kind: 'triggered',
    trigger: { kind: 'step', step: 'main2', whose: 'you' },
    interveningIf: { kind: 'combatDamagedBy', filter: { subtypes: ['Zombie'] } },
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'mill', player: YOU, count: 3 },
        {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
            optional: true,
          },
          to: 'hand',
        },
      ],
    },
  },
];

const masterAbilities: readonly Ability[] = [
  {
    kind: 'static',
    static: {
      kind: 'grantKeyword',
      subject: {
        kind: 'filter',
        filter: { types: ['creature'], subtypes: ['Zombie'] },
        other: true,
      },
      keyword: { kind: 'landwalk', landType: 'Swamp' },
    },
  },
  {
    kind: 'static',
    static: {
      kind: 'grantAbility',
      subject: { kind: 'filter', filter: { subtypes: ['Zombie'] }, other: true },
      ability: {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['B'] }],
        effect: { kind: 'regenerate', objects: THIS, duration: END },
      },
    },
  },
];

const scoutAbilities: readonly Ability[] = [
  {
    kind: 'activated',
    cost: [TAP_A_ZOMBIE],
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['land'] } } },
    ],
    effect: {
      kind: 'setTypes',
      objects: { kind: 'target', id: 't1' },
      subtypes: ['Swamp'],
      duration: END,
    },
  },
  {
    kind: 'activated',
    cost: [TAP_A_ZOMBIE],
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
    ],
    effect: {
      kind: 'grantKeyword',
      objects: { kind: 'target', id: 't1' },
      keyword: { kind: 'landwalk', landType: 'Swamp' },
      duration: END,
    },
  },
];

const bannerAbilities: readonly Ability[] = [
  {
    kind: 'triggered',
    trigger: { kind: 'upkeep', whose: 'you' },
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'loseLife', player: YOU, amount: 1 },
        { kind: 'amass', subtype: 'Zombie', count: 1 },
      ],
    },
  },
  {
    kind: 'triggered',
    trigger: {
      kind: 'attacks',
      what: {
        subtypes: ['Zombie'],
        token: true,
        controller: 'you',
        power: { cmp: 'atLeast', value: 6 },
      },
    },
    effect: {
      kind: 'grantKeyword',
      objects: { kind: 'triggerSubject' },
      keyword: { kind: 'lifelink' },
      duration: END,
    },
  },
];

export const SYNTHETIC_GISA_G1_LIST: readonly CardDefinition[] = [
  // A plain Zombie: the body the group has and gives things to.
  singleFace({
    name: GISA_ZOMBIE,
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
  // "Afflict 3. Other Zombies you control have afflict 3. At the beginning of your second main phase, if a player was dealt combat damage by a Zombie this turn,
  // mill three cards, then you may return a creature card from your graveyard to your hand."
  singleFace({
    name: AFFLICT_MONARCH,
    manaCost: ['3', 'B'],
    types: ['creature'],
    subtypes: ['Zombie', 'Noble'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 4,
    toughness: 4,
    oracleText:
      'Afflict 3. Other Zombies you control have afflict 3. At the beginning of your second main phase, if a player was dealt combat damage by a Zombie this turn, mill three cards, then you may return a creature card from your graveyard to your hand.',
    abilities: monarchAbilities,
  }),
  // "Other Zombie creatures have swampwalk. Other Zombies have '{B}: Regenerate this permanent.'"
  singleFace({
    name: WALK_MASTER,
    manaCost: ['1', 'B', 'B'],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 3,
    oracleText:
      "Other Zombie creatures have swampwalk. Other Zombies have '{B}: Regenerate this permanent.'",
    abilities: masterAbilities,
  }),
  // "Tap an untapped Zombie you control: Target land becomes a Swamp until end of turn. Tap an untapped Zombie you control: Target creature gains swampwalk until end of turn."
  singleFace({
    name: TRAIL_SCOUT,
    manaCost: ['B', 'B', 'B'],
    types: ['creature'],
    subtypes: ['Zombie', 'Scout'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText:
      'Tap an untapped Zombie you control: Target land becomes a Swamp until end of turn. Tap an untapped Zombie you control: Target creature gains swampwalk until end of turn.',
    abilities: scoutAbilities,
  }),
  // "At the beginning of your upkeep, you lose 1 life and amass Zombies 1. Whenever a Zombie token you control with power 6 or greater attacks, it gains lifelink until end
  // of turn."
  singleFace({
    name: HORDE_BANNER,
    manaCost: ['1', 'B'],
    types: ['enchantment'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'At the beginning of your upkeep, you lose 1 life and amass Zombies 1. Whenever a Zombie token you control with power 6 or greater attacks, it gains lifelink until end of turn.',
    abilities: bannerAbilities,
  }),
];
