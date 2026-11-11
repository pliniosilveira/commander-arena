/**
 * SYNTHETIC COUNTED POWER AND TOUGHNESS CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-109 and D-115: a static "+1/+1 for each ..." on an
 * Equipment, an Aura, a creature and a lord (CR 611.3a), characteristic-defining power and toughness
 * ("~'s power and toughness are each equal to the number of cards in your hand", "~'s power is equal to
 * the number of creatures you control", CR 604.3, 208.2a, 613.4a), "All creatures get -X/-X until end of
 * turn", "Target creature gets +X/+0 until end of turn" (CR 107.3a), a count that is locked in when a
 * spell resolves (CR 611.2c, 608.2h) and base power and toughness from a count (CR 613.4b). Names start
 * with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and
 * none of these is the definition of a real card.
 */
import type { Ability, CountAmount, Effect, ObjectFilter, TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const X = { kind: 'x' } as const;
const THIS = { kind: 'this' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const END = 'untilEndOfTurn' as const;
const CREATURE_TARGET: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
};

const count = (filter: ObjectFilter): CountAmount => ({ kind: 'countOf', filter });
const ARTIFACTS_YOU = count({ types: ['artifact'], controller: 'you' });
const OTHER_CREATURES_YOU = count({ types: ['creature'], controller: 'you', other: true });
const CREATURES_YOU = count({ types: ['creature'], controller: 'you' });
const ELVES_YOU = count({ types: ['creature'], subtypes: ['Elf'], controller: 'you' });
const CARDS_IN_HAND = count({ zone: 'hand', controller: 'you' });
const LANDS_YOU = count({ types: ['land'], controller: 'you' });
const CREATURE_CARDS_IN_GRAVEYARD = count({
  zone: 'graveyard',
  types: ['creature'],
  controller: 'you',
});

const staticAbility = (effect: Extract<Ability, { kind: 'static' }>['static']): Ability => ({
  kind: 'static',
  static: effect,
});
const enchant = (filter: ObjectFilter): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'enchant', filter },
});
const equip = (...symbols: string[]): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols }] },
});

const instant = (
  name: string,
  manaCost: string[],
  color: 'G' | 'U' | 'R' | 'B' | 'W',
  oracleText: string,
  spell: { x?: true; targets?: TargetSpec[]; effect: Effect },
  type: 'instant' | 'sorcery' = 'instant',
): CardDefinition =>
  singleFace({
    name,
    manaCost,
    types: [type],
    colors: [color],
    colorIdentity: [color],
    oracleText,
    spell,
  });

export const SYNTHETIC_PT_LIST: readonly CardDefinition[] = [
  // ---- Static "+N/+N for each ..."
  // "Equipped creature gets +1/+1 for each artifact you control. Equip {1}"
  singleFace({
    name: 'SYNTHETIC Artisan Blade',
    manaCost: ['1'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Equipped creature gets +1/+1 for each artifact you control. Equip {1}',
    abilities: [
      staticAbility({
        kind: 'modifyPt',
        subject: { kind: 'attached' },
        power: ARTIFACTS_YOU,
        toughness: ARTIFACTS_YOU,
      }),
      equip('1'),
    ],
  }),
  // "Enchant creature. Enchanted creature gets +1/+1 for each artifact you control."
  singleFace({
    name: 'SYNTHETIC Artisan Aura',
    manaCost: ['1', 'U'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Enchant creature. Enchanted creature gets +1/+1 for each artifact you control.',
    abilities: [
      enchant({ types: ['creature'] }),
      staticAbility({
        kind: 'modifyPt',
        subject: { kind: 'attached' },
        power: ARTIFACTS_YOU,
        toughness: ARTIFACTS_YOU,
      }),
    ],
  }),
  // "Enchant creature. Enchanted creature gets -1/-1 for each creature card in your graveyard."
  singleFace({
    name: 'SYNTHETIC Grave Chill Aura',
    manaCost: ['B'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Enchant creature. Enchanted creature gets -1/-1 for each creature card in your graveyard.',
    abilities: [
      enchant({ types: ['creature'] }),
      staticAbility({
        kind: 'modifyPt',
        subject: { kind: 'attached' },
        power: { kind: 'times', factor: -1, of: CREATURE_CARDS_IN_GRAVEYARD },
        toughness: { kind: 'times', factor: -1, of: CREATURE_CARDS_IN_GRAVEYARD },
      }),
    ],
  }),
  // "This creature gets +1/+1 for each other creature you control."
  singleFace({
    name: 'SYNTHETIC Pack Wolf',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Wolf'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText: 'This creature gets +1/+1 for each other creature you control.',
    abilities: [
      staticAbility({
        kind: 'modifyPt',
        subject: THIS,
        power: OTHER_CREATURES_YOU,
        toughness: OTHER_CREATURES_YOU,
      }),
    ],
  }),
  // "Other creatures you control get +1/+1 for each Elf you control."
  singleFace({
    name: 'SYNTHETIC Elf Chanter',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Elf'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText: 'Other creatures you control get +1/+1 for each Elf you control.',
    abilities: [
      staticAbility({
        kind: 'modifyPt',
        subject: {
          kind: 'filter',
          filter: { types: ['creature'], controller: 'you' },
          other: true,
        },
        power: ELVES_YOU,
        toughness: ELVES_YOU,
      }),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Elf Scout',
    manaCost: ['G'],
    types: ['creature'],
    subtypes: ['Elf', 'Scout'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText: '',
  }),
  singleFace({
    name: 'SYNTHETIC Stone Golem',
    manaCost: ['2'],
    types: ['artifact', 'creature'],
    subtypes: ['Golem'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
  // ---- Characteristic-defining power and toughness
  // "This creature's power and toughness are each equal to the number of cards in your hand."
  singleFace({
    name: 'SYNTHETIC Hand Hydra',
    manaCost: ['2', 'U'],
    types: ['creature'],
    subtypes: ['Hydra'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: '*',
    toughness: '*',
    oracleText:
      "This creature's power and toughness are each equal to the number of cards in your hand.",
    abilities: [
      staticAbility({ kind: 'characteristicPt', power: CARDS_IN_HAND, toughness: CARDS_IN_HAND }),
    ],
  }),
  // "This creature's power and toughness are each equal to the number of lands you control."
  singleFace({
    name: 'SYNTHETIC Land Lurker',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Elemental'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: '*',
    toughness: '*',
    oracleText:
      "This creature's power and toughness are each equal to the number of lands you control.",
    abilities: [
      staticAbility({ kind: 'characteristicPt', power: LANDS_YOU, toughness: LANDS_YOU }),
    ],
  }),
  // "This creature's power is equal to the number of creatures you control." (printed */3)
  singleFace({
    name: 'SYNTHETIC Horde Hound',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Hound'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: '*',
    toughness: 3,
    oracleText: "This creature's power is equal to the number of creatures you control.",
    abilities: [staticAbility({ kind: 'characteristicPt', power: CREATURES_YOU })],
  }),
  // "This creature's power and toughness are each equal to the number of creature cards in your graveyard."
  singleFace({
    name: 'SYNTHETIC Grave Ghoul',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: '*',
    toughness: '*',
    oracleText:
      "This creature's power and toughness are each equal to the number of creature cards in your graveyard.",
    abilities: [
      staticAbility({
        kind: 'characteristicPt',
        power: CREATURE_CARDS_IN_GRAVEYARD,
        toughness: CREATURE_CARDS_IN_GRAVEYARD,
      }),
    ],
  }),
  // A characteristic-defining ability and a dies trigger that reads its last-known power.
  // "~'s power and toughness are each equal to the number of cards in your hand. When this creature
  // dies, you gain life equal to its power."
  singleFace({
    name: 'SYNTHETIC Lifeline Hydra',
    manaCost: ['3', 'U'],
    types: ['creature'],
    subtypes: ['Hydra'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: '*',
    toughness: '*',
    oracleText:
      "This creature's power and toughness are each equal to the number of cards in your hand. When this creature dies, you gain life equal to its power.",
    abilities: [
      staticAbility({ kind: 'characteristicPt', power: CARDS_IN_HAND, toughness: CARDS_IN_HAND }),
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: THIS },
        effect: {
          kind: 'gainLife',
          player: YOU,
          amount: { kind: 'powerOf', of: THIS },
        },
      },
    ],
  }),
  // ---- Amounts in effects
  instant(
    'SYNTHETIC Withering Surge',
    ['X', 'B'],
    'B',
    'All creatures get -X/-X until end of turn.',
    {
      x: true,
      effect: {
        kind: 'modifyPt',
        objects: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'] } },
        power: { kind: 'times', factor: -1, of: X },
        toughness: { kind: 'times', factor: -1, of: X },
        duration: END,
      },
    },
    'sorcery',
  ),
  instant(
    'SYNTHETIC Surge Strike',
    ['X', 'R'],
    'R',
    'Target creature gets +X/+0 until end of turn.',
    {
      x: true,
      targets: [CREATURE_TARGET],
      effect: { kind: 'modifyPt', objects: T1, power: X, toughness: 0, duration: END },
    },
  ),
  instant(
    'SYNTHETIC Mass Rally',
    ['2', 'W'],
    'W',
    'Creatures you control get +1/+1 until end of turn for each creature you control.',
    {
      effect: {
        kind: 'modifyPt',
        objects: {
          kind: 'each',
          filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
        },
        power: CREATURES_YOU,
        toughness: CREATURES_YOU,
        duration: END,
      },
    },
    'sorcery',
  ),
  instant(
    'SYNTHETIC Land Shape',
    ['1', 'G'],
    'G',
    'Target creature has base power and toughness each equal to the number of lands you control until end of turn.',
    {
      targets: [CREATURE_TARGET],
      effect: { kind: 'setPt', objects: T1, power: LANDS_YOU, toughness: LANDS_YOU, duration: END },
    },
  ),
  instant(
    'SYNTHETIC Base Four',
    ['U'],
    'U',
    'Target creature has base power and toughness 4/4 until end of turn.',
    {
      targets: [CREATURE_TARGET],
      effect: { kind: 'setPt', objects: T1, power: 4, toughness: 4, duration: END },
    },
  ),
  instant(
    'SYNTHETIC Dress Down',
    ['1', 'U'],
    'U',
    'Target creature loses all abilities until end of turn.',
    {
      targets: [CREATURE_TARGET],
      effect: { kind: 'loseAllAbilities', objects: T1, duration: END },
    },
  ),
  // "{X}{R}: This creature gets +X/+0 until end of turn."
  singleFace({
    name: 'SYNTHETIC Rage Bear',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText: '{X}{R}: This creature gets +X/+0 until end of turn.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['X', 'R'] }],
        effect: { kind: 'modifyPt', objects: THIS, power: X, toughness: 0, duration: END },
      },
    ],
  }),
];
