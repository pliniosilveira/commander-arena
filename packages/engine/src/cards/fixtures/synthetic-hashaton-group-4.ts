/**
 * SYNTHETIC CARDS FOR "AMASS" AND FOR "BECOMES AN AVATAR IN ADDITION TO ITS OTHER TYPES AND GAINS FOUR KEYWORDS". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-367 to D-371 (group 4 of the Hashaton deck, issue 31): the effect `amass` (CR 701.47a) that creates a 0/0 black Army creature token
 * when its controller has no Army, chooses an Army, puts +1/+1 counters on it and makes it the creature type in addition to its other types; two token replacement effects that
 * change what an amass makes; and the spell that gives a creature a type in addition to its other types and four keywords until end of turn. Names start
 * with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect, TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const kw = (keyword: Extract<Ability, { kind: 'keyword' }>['keyword']): Ability => ({
  kind: 'keyword',
  keyword,
});

/** "Amass Zombies 2." */
const AMASS_ZOMBIES_2: Effect = { kind: 'amass', subtype: 'Zombie', count: 2 };

/** A 0/0 black Army creature token of one more creature type (what a replacement effect adds beside the one the amass makes). */
const armyToken = (subtype: string): TokenDefinition => ({
  name: `${subtype} Army`,
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: [subtype, 'Army'],
  colors: ['B'],
  power: 0,
  toughness: 0,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
});

const creature = (
  name: string,
  subtypes: readonly string[],
  power: number,
  toughness: number,
  oracleText: string,
  abilities: readonly Ability[] = [],
): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2'],
    types: ['creature'],
    subtypes,
    colors: [],
    colorIdentity: [],
    power,
    toughness,
    oracleText,
    abilities,
  });

export const SYNTHETIC_HASHATON_GROUP_4_LIST: readonly CardDefinition[] = [
  // "Amass Zombies 2."
  singleFace({
    name: 'SYNTHETIC Amass Rite',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Amass Zombies 2.',
    spell: { effect: AMASS_ZOMBIES_2 },
  }),
  // "Amass Orcs 1." (another creature type, to see the token and the type change)
  singleFace({
    name: 'SYNTHETIC Amass Orcs Rite',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Amass Orcs 1.',
    spell: { effect: { kind: 'amass', subtype: 'Orc', count: 1 } },
  }),
  // "Amass Zombies X." (X read as the effect resolves, CR 608.2h)
  singleFace({
    name: 'SYNTHETIC Amass X Rite',
    manaCost: ['X', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Amass Zombies X.',
    spell: { effect: { kind: 'amass', subtype: 'Zombie', count: { kind: 'x' } }, x: true },
  }),
  // "When this creature enters, amass Zombies 2." (the shape of the real card's trigger)
  singleFace({
    name: 'SYNTHETIC Amass Watcher',
    manaCost: ['2', 'B'],
    types: ['creature'],
    subtypes: ['Zombie', 'Wizard'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 3,
    oracleText: 'When this creature enters, amass Zombies 2.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: AMASS_ZOMBIES_2,
      },
    ],
  }),
  // Two Army creature cards, of different creature types, to be chosen between.
  creature('SYNTHETIC Orc Army Veteran', ['Orc', 'Army'], 2, 2, ''),
  creature('SYNTHETIC Soldier Army Recruit', ['Soldier', 'Army'], 1, 1, ''),
  // "If one or more creature tokens would be created under your control, those tokens plus an additional 0/0 black Orc Army creature token are created
  // instead." (a second Army made as the first is, to be chosen between)
  singleFace({
    name: 'SYNTHETIC Army Recruiter',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Construct'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 4,
    oracleText:
      'If one or more creature tokens would be created under your control, those tokens plus an additional 0/0 black Orc Army creature token are created instead.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'tokensInstead',
          what: { types: ['creature'], token: true },
          mode: 'plus',
          token: { kind: 'custom', definition: armyToken('Orc') },
        },
      },
    ],
  }),
  // "If one or more creature tokens would be created under your control, that many 1/1 white Soldier creature tokens are created instead." (no Army is made)
  singleFace({
    name: 'SYNTHETIC Soldier Maker',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Construct'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 4,
    oracleText:
      'If one or more creature tokens would be created under your control, that many 1/1 white Soldier creature tokens are created instead.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'tokensInstead',
          what: { types: ['creature'], token: true },
          mode: 'thatMany',
          token: {
            kind: 'custom',
            definition: {
              name: 'Soldier',
              manaCost: null,
              supertypes: [],
              types: ['creature'],
              subtypes: ['Soldier'],
              colors: ['W'],
              power: 1,
              toughness: 1,
              loyalty: null,
              defense: null,
              oracleText: '',
              abilities: [],
            },
          },
        },
      },
    ],
  }),
  // "Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains flying, first strike, lifelink, and hexproof."
  singleFace({
    name: 'SYNTHETIC Avatar Surge',
    manaCost: ['W'],
    types: ['instant'],
    subtypes: ['Lesson'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains flying, first strike, lifelink, and hexproof.',
    spell: {
      targets: [
        { id: 't1', what: { kind: 'object', filter: { types: ['creature'], controller: 'you' } } },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'setTypes',
            objects: { kind: 'target', id: 't1' },
            subtypes: ['Avatar'],
            additive: true,
            duration: 'untilEndOfTurn',
          },
          ...(['flying', 'firstStrike', 'lifelink', 'hexproof'] as const).map(
            (keyword): Effect => ({
              kind: 'grantKeyword',
              objects: { kind: 'target', id: 't1' },
              keyword: { kind: keyword },
              duration: 'untilEndOfTurn',
            }),
          ),
        ],
      },
    },
  }),
  // A creature to give the keywords to that has one of them already and is not hexproof.
  creature('SYNTHETIC Winged Bear', ['Bear'], 2, 2, 'Flying', [kw({ kind: 'flying' })]),
];
