/**
 * SYNTHETIC CARDS FOR THE STATIC ABILITIES OF THE ARTIFACTS SLICE (D-139). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests: a lord that sets base power and toughness and adds a creature type to the other creatures its controller has,
 * and that keeps a creature type from being blocked by another ("Goblins you control can't be blocked by Walls"), over several creature
 * types and blocker filters; an Aura that stops its creature from untapping unless a player is the monarch (the enchanted creature's
 * controller, or its enchanter); permanents that let their controller cast some spells as though they had flash; and creatures that
 * exile a card with a linked ability and then have the power, toughness and creature types of the last creature card exiled with them.
 * Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the
 * definition of a real card.
 */
import type { Ability, Condition, Effect, ObjectFilter, StaticSubject } from '../../ast/types';
import type { CardType } from '../../characteristics';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOUR_CREATURES_OTHER: StaticSubject = {
  kind: 'filter',
  filter: { types: ['creature'], controller: 'you' },
  other: true,
};

/** "[Type]s you control can't be blocked by [blockers]." */
const unblockable = (type: string, blockers: ObjectFilter): Ability => ({
  kind: 'static',
  static: {
    kind: 'cantBeBlockedBy',
    subject: {
      kind: 'filter',
      filter: { types: ['creature'], subtypes: [type], controller: 'you' },
    },
    blockers,
  },
});

/** A lord: other creatures you control have base power and toughness N/N and are [Type]s in addition to their other types. */
const lord = (
  name: string,
  type: string,
  power: number,
  toughness: number,
  extra: readonly Ability[],
  oracle: string,
): CardDefinition =>
  singleFace({
    name,
    manaCost: ['6'],
    supertypes: ['legendary'],
    types: ['artifact', 'creature'],
    subtypes: [type],
    colors: [],
    colorIdentity: [],
    power: 7,
    toughness: 5,
    oracleText: oracle,
    abilities: [
      ...extra,
      {
        kind: 'static',
        static: { kind: 'setPt', subject: YOUR_CREATURES_OTHER, power, toughness },
      },
      {
        kind: 'static',
        static: {
          kind: 'setTypes',
          subject: YOUR_CREATURES_OTHER,
          additive: true,
          subtypes: [type],
        },
      },
    ],
  });

const MONARCH_OF_ENCHANTED: Condition = {
  kind: 'playerHasDesignation',
  player: { kind: 'controllerOf', of: { kind: 'attached' } },
  designation: 'monarch',
};
const YOU_MONARCH: Condition = {
  kind: 'playerHasDesignation',
  player: { kind: 'you' },
  designation: 'monarch',
};

const doesntUntapUnless = (unless: Condition): Ability => ({
  kind: 'static',
  static: {
    kind: 'restriction',
    subject: { kind: 'attached', types: ['creature'] },
    restriction: 'doesntUntap',
  },
  condition: { kind: 'not', term: unless },
});

const aura = (name: string, abilities: readonly Ability[], oracle: string): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2', 'U'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: oracle,
    abilities: [
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      ...abilities,
    ],
  });

/** A permanent whose static ability is "You may cast [spells] as though they had flash." */
const flashGiver = (name: string, spells: ObjectFilter, oracle: string): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2'],
    types: ['creature'],
    subtypes: ['Artificer'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: oracle,
    abilities: [{ kind: 'static', static: { kind: 'castAsThoughFlash', spells } }],
  });

const exileTarget = (): Effect => ({
  kind: 'exile',
  objects: { kind: 'target', id: 't1' },
  linked: true,
});

/** "As long as a card exiled with this is a creature card, this has the power, toughness and creature types of the last one." */
const takesFromExile = (also: readonly string[]): Ability => ({
  kind: 'static',
  static: {
    kind: 'takeFromLinkedExile',
    subject: { kind: 'this' },
    from: { types: ['creature'] },
    alsoSubtypes: also,
  },
});

const ABILITY_TARGET = (filter: ObjectFilter) =>
  [{ id: 't1', what: { kind: 'object', filter } }] as const;

const ARTIFACT_CREATURE: readonly CardType[] = ['artifact', 'creature'];

export const SYNTHETIC_STATICS_ARTIFACTS_LIST: readonly CardDefinition[] = [
  // "Juggernauts you control can't be blocked by Walls. Other creatures you control have base power and toughness 5/3 and are
  // Juggernauts in addition to their other creature types."
  lord(
    'SYNTHETIC Juggernaut Lord',
    'Juggernaut',
    5,
    3,
    [unblockable('Juggernaut', { subtypes: ['Wall'] })],
    "Juggernauts you control can't be blocked by Walls. Other creatures you control have base power and toughness 5/3 and are Juggernauts in addition to their other creature types.",
  ),
  // The same shapes over other types and another blocker filter: Elves, Goblins, creatures with flying.
  lord(
    'SYNTHETIC Elf Banner',
    'Elf',
    1,
    1,
    [unblockable('Elf', { subtypes: ['Goblin'] })],
    "Elves you control can't be blocked by Goblins. Other creatures you control have base power and toughness 1/1 and are Elves in addition to their other creature types.",
  ),
  lord(
    'SYNTHETIC Ground Standard',
    'Bear',
    2,
    2,
    [unblockable('Bear', { keywords: ['flying'] })],
    "Bears you control can't be blocked by creatures with flying. Other creatures you control have base power and toughness 2/2 and are Bears in addition to their other creature types.",
  ),
  // "This creature can't be blocked by creatures with power 2 or less." (the subject is the creature itself)
  singleFace({
    name: 'SYNTHETIC Bully Brute',
    manaCost: ['3', 'R'],
    types: ['creature'],
    subtypes: ['Ogre'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 4,
    toughness: 4,
    oracleText: "This creature can't be blocked by creatures with power 2 or less.",
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'cantBeBlockedBy',
          subject: { kind: 'this' },
          blockers: { power: { cmp: 'atMost', value: 2 } },
        },
      },
    ],
  }),
  // A plain Juggernaut (artifact creature) and a Wall for the boards.
  singleFace({
    name: 'SYNTHETIC Dust Juggernaut',
    manaCost: ['4'],
    types: [...ARTIFACT_CREATURE],
    subtypes: ['Juggernaut'],
    colors: [],
    colorIdentity: [],
    power: 5,
    toughness: 3,
    oracleText: '',
  }),
  singleFace({
    name: 'SYNTHETIC Brick Wall',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Wall'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 0,
    toughness: 5,
    oracleText: 'Defender',
    abilities: [{ kind: 'keyword', keyword: { kind: 'defender' } }],
  }),
  // ---- An Aura that keeps a creature tapped unless a player is the monarch
  // "When this Aura enters, tap enchanted creature and you become the monarch. Enchanted creature doesn't untap during its controller's
  // untap step unless that player is the monarch."
  aura(
    'SYNTHETIC Chill Chains',
    [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'tap', objects: { kind: 'attached' } },
            { kind: 'becomeMonarch', player: { kind: 'you' } },
          ],
        },
      },
      doesntUntapUnless(MONARCH_OF_ENCHANTED),
    ],
    "When this Aura enters, tap enchanted creature and you become the monarch. Enchanted creature doesn't untap during its controller's untap step unless that player is the monarch.",
  ),
  // "Enchanted creature doesn't untap during its controller's untap step unless you're the monarch." (the Aura's controller)
  aura(
    'SYNTHETIC Monarch Leash',
    [doesntUntapUnless(YOU_MONARCH)],
    "Enchanted creature doesn't untap during its controller's untap step unless you're the monarch.",
  ),
  // ---- "You may cast [spells] as though they had flash."
  flashGiver(
    'SYNTHETIC Swift Artisan',
    { types: ['artifact'], controller: 'you' },
    'You may cast artifact spells as though they had flash.',
  ),
  flashGiver(
    'SYNTHETIC Swift Summoner',
    { types: ['creature'], controller: 'you' },
    'You may cast creature spells as though they had flash.',
  ),
  flashGiver(
    'SYNTHETIC Swift Cheapskate',
    { manaValue: { cmp: 'atMost', value: 2 }, controller: 'you' },
    'You may cast spells with mana value 2 or less as though they had flash.',
  ),
  // ---- "exiled with this creature"
  // "When this creature enters, you may exile target nontoken creature. As long as a card exiled with this creature is a creature card,
  // this creature has the power, toughness and creature types of the last creature card exiled with it. It's still a Shapeshifter."
  singleFace({
    name: 'SYNTHETIC Shape Twin',
    manaCost: ['6'],
    types: [...ARTIFACT_CREATURE],
    subtypes: ['Shapeshifter'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 4,
    oracleText:
      "When this creature enters, you may exile target nontoken creature. As long as a card exiled with this creature is a creature card, this creature has the power, toughness and creature types of the last creature card exiled with it. It's still a Shapeshifter.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        optional: true,
        targets: ABILITY_TARGET({ types: ['creature'], token: false }),
        effect: exileTarget(),
      },
      takesFromExile(['Shapeshifter']),
    ],
  }),
  // "{1}: Exile target creature card from a graveyard. As long as a card exiled with this creature is a creature card, this creature
  // has the power, toughness and creature types of the last creature card exiled with it. It's still a Mimic."
  singleFace({
    name: 'SYNTHETIC Grave Mimic',
    manaCost: ['2'],
    types: ['creature'],
    subtypes: ['Mimic'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText:
      "{1}: Exile target creature card from a graveyard. As long as a card exiled with this creature is a creature card, this creature has the power, toughness and creature types of the last creature card exiled with it. It's still a Mimic.",
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1'] }],
        targets: ABILITY_TARGET({ zone: 'graveyard', types: ['creature'] }),
        effect: exileTarget(),
      },
      takesFromExile(['Mimic']),
    ],
  }),
];
