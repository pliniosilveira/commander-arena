/**
 * SYNTHETIC CARDS FOR ENCORE, DEVOUR AND RIOT. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-185 (the Korvold slice 6): Encore (CR 702.141a), Devour (CR 702.82a) and Riot (CR 702.136a), and the static abilities of a
 * card that gives riot to a group and makes the creature spells of its controller uncounterable (CR 101.2, 614.12). Names start with "SYNTHETIC "; oracleId is
 * null. The text has the wording of the real cards the shapes come from (the owner's request file of 2026-10-29); it is not their definition, and the
 * powers, toughnesses and mana costs the file does not give are invented.
 */
import type { Ability, TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const TREASURE: Ability = {
  kind: 'triggered',
  trigger: { kind: 'dies', what: { kind: 'this' } },
  effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
};

/** "Nontoken creatures you control have riot." */
const GIVES_RIOT: Ability = {
  kind: 'static',
  static: {
    kind: 'grantKeyword',
    subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you', token: false } },
    keyword: { kind: 'riot' },
  },
};

/** "Creature spells you control can't be countered." */
const UNCOUNTERABLE: Ability = {
  kind: 'static',
  static: {
    kind: 'spellsCantBeCountered',
    spells: { types: ['creature'], controller: 'you' },
  },
};

const DRAGON_TOKEN: TokenDefinition = {
  name: 'Dragon',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Dragon'],
  colors: ['R', 'G'],
  power: 1,
  toughness: 1,
  loyalty: null,
  defense: null,
  oracleText: 'Flying, devour 2',
  abilities: [kw('flying'), { kind: 'keyword', keyword: { kind: 'devour', count: 2 } }],
};

export const SYNTHETIC_KORVOLD_KEYWORDS_LIST: readonly CardDefinition[] = [
  // "When this creature dies, create a Treasure token. Encore {3}{R}"
  singleFace({
    name: 'SYNTHETIC Encore Pilferer',
    manaCost: ['R'],
    types: ['creature'],
    subtypes: ['Goblin', 'Pirate'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 1,
    oracleText:
      'When this creature dies, create a Treasure token.\nEncore {3}{R} ({3}{R}, Exile this card from your graveyard: For each opponent, create a token copy that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.)',
    abilities: [
      TREASURE,
      {
        kind: 'keyword',
        keyword: { kind: 'encore', cost: [{ kind: 'mana', symbols: ['3', 'R'] }] },
      },
    ],
  }),
  // A creature with Encore that is not a "dies" creature, so the graveyard card can be a creature the controller put there on purpose.
  singleFace({
    name: 'SYNTHETIC Encore Bear',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: 'Encore {1}{G}',
    abilities: [
      {
        kind: 'keyword',
        keyword: { kind: 'encore', cost: [{ kind: 'mana', symbols: ['1', 'G'] }] },
      },
    ],
  }),
  // "Flying. At the beginning of each upkeep, create a 1/1 red and green Dragon creature token with flying and devour 2."
  singleFace({
    name: 'SYNTHETIC Dragon Broodmother',
    manaCost: ['2', 'R', 'R', 'R', 'G'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R', 'G'],
    colorIdentity: ['R', 'G'],
    power: 4,
    toughness: 4,
    oracleText:
      'Flying\nAt the beginning of each upkeep, create a 1/1 red and green Dragon creature token with flying and devour 2. (As the token enters, you may sacrifice any number of creatures. It enters with twice that many +1/+1 counters on it.)',
    abilities: [
      kw('flying'),
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'each' },
        effect: {
          kind: 'createToken',
          token: { kind: 'custom', definition: DRAGON_TOKEN },
          count: 1,
        },
      },
    ],
  }),
  // A card with Devour on it: "Devour 2".
  singleFace({
    name: 'SYNTHETIC Devouring Brute',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Ogre'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      'Devour 2 (As this enters, you may sacrifice any number of creatures. This creature enters with twice that many +1/+1 counters on it.)',
    abilities: [{ kind: 'keyword', keyword: { kind: 'devour', count: 2 } }],
  }),
  // "Riot" (a creature with riot of its own).
  singleFace({
    name: 'SYNTHETIC Riot Goblin',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Goblin'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 1,
    oracleText: 'Riot (This creature enters with your choice of a +1/+1 counter or haste.)',
    abilities: [{ kind: 'keyword', keyword: { kind: 'riot' } }],
  }),
  // A plain creature, to enter under the card that gives riot.
  singleFace({
    name: 'SYNTHETIC Plain Ogre',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Ogre'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 2,
    oracleText: '',
  }),
  // A creature with both Riot and Devour.
  singleFace({
    name: 'SYNTHETIC Riotous Devourer',
    manaCost: ['3', 'R'],
    types: ['creature'],
    subtypes: ['Ogre'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText: 'Riot\nDevour 1',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'riot' } },
      { kind: 'keyword', keyword: { kind: 'devour', count: 1 } },
    ],
  }),
  // "Creature spells you control can't be countered. Nontoken creatures you control have riot."
  singleFace({
    name: 'SYNTHETIC Rhythm of the Wild',
    manaCost: ['1', 'R', 'G'],
    types: ['enchantment'],
    colors: ['R', 'G'],
    colorIdentity: ['R', 'G'],
    oracleText:
      "Creature spells you control can't be countered.\nNontoken creatures you control have riot. (They enter with your choice of a +1/+1 counter or haste.)",
    abilities: [UNCOUNTERABLE, GIVES_RIOT],
  }),
  // A creature that makes a Dragon with devour when it enters, to make a token ask while another permanent is on the battlefield.
  singleFace({
    name: 'SYNTHETIC Riot Token Maker',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Shaman'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 1,
    toughness: 1,
    oracleText: 'When this creature enters, create a 2/2 red Goblin creature token with riot.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'createToken',
          token: {
            kind: 'custom',
            definition: {
              name: 'Goblin',
              manaCost: null,
              supertypes: [],
              types: ['creature'],
              subtypes: ['Goblin'],
              colors: ['R'],
              power: 2,
              toughness: 2,
              loyalty: null,
              defense: null,
              oracleText: 'Riot',
              abilities: [{ kind: 'keyword', keyword: { kind: 'riot' } }],
            },
          },
          count: 1,
        },
      },
    ],
  }),
  // A card with Riot and Encore: its token copy asks for the riot choice as it enters.
  singleFace({
    name: 'SYNTHETIC Encore Rioter',
    manaCost: ['R'],
    types: ['creature'],
    subtypes: ['Goblin'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 1,
    oracleText: 'Riot\nEncore {1}{R}',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'riot' } },
      {
        kind: 'keyword',
        keyword: { kind: 'encore', cost: [{ kind: 'mana', symbols: ['1', 'R'] }] },
      },
    ],
  }),
  // A land that is a creature as it is played, with riot (a land is played, not cast: the question waits in the hand).
  singleFace({
    name: 'SYNTHETIC Riot Grove',
    manaCost: null,
    types: ['land', 'creature'],
    subtypes: ['Dryad'],
    colors: [],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText: 'Riot\n{T}: Add {G}.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'riot' } },
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['G'] } },
    ],
  }),
];
