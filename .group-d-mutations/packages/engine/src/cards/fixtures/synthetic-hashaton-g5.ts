/**
 * SYNTHETIC CARDS FOR GROUP 5 OF THE HASHATON DECK (issue 31, D-382 to D-385). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the shared primitive of Champion of Wits, Hashaton, Scarab's Fist and Renewed Solidarity: a token copy with the exceptions of a copy effect
 * (CR 707.9: "except it's a 4/4 black Zombie", "with no mana cost", "a Zombie in addition to its other types"), the Eternalize keyword (CR 702.129a), a discard trigger that names
 * the kind of card ("Whenever you discard a creature card", CR 701.9a) with a copy of the card discarded, and "for each token you control of the chosen type that entered this turn,
 * create a token that's a copy of it" (`createCopies`). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of
 * these is the definition of a real card.
 */
import type { Ability, Effect, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;

const eternalize = (...symbols: string[]): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'eternalize', cost: [{ kind: 'mana', symbols }] },
});

const LANDS_YOU = { kind: 'countOf', filter: { types: ['land'], controller: 'you' } } as const;

/** "Whenever you discard a creature card, you may pay {2}{U}. If you do, create a tapped token that's a copy of that card, except it's a 4/4 black Zombie." */
const SCARAB_TRIGGER: Ability = {
  kind: 'triggered',
  trigger: { kind: 'discarded', who: 'you', filter: { types: ['creature'] } },
  effect: {
    kind: 'mayPay',
    cost: [{ kind: 'mana', symbols: ['2', 'U'] }],
    effect: {
      kind: 'createToken',
      token: {
        kind: 'copyOf',
        object: { kind: 'triggerSubject' },
        setPt: { power: 4, toughness: 4 },
        setColors: ['B'],
        setCreatureTypes: ['Zombie'],
      },
      count: 1,
      tapped: true,
    },
  },
};

const discarding = (name: string, text: string, count: number): CardDefinition =>
  singleFace({
    name,
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: text,
    spell: { effect: { kind: 'discard', player: YOU, count } },
  });

const OF_TYPE: ObjectFilter = { controller: 'you', chosenType: true };

export const SYNTHETIC_HASHATON_G5_LIST: readonly CardDefinition[] = [
  // "Eternalize {1}{U}" on a 2/1 creature (the shape of Champion of Wits, with a cheaper cost).
  singleFace({
    name: 'SYNTHETIC Wit Champion',
    manaCost: ['2', 'U'],
    types: ['creature'],
    subtypes: ['Snake', 'Wizard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 1,
    oracleText: 'Eternalize {1}{U}',
    abilities: [eternalize('1', 'U')],
  }),
  // The shape of Champion of Wits as a whole: "When this creature enters, you may draw cards equal to its power. If you do, discard two cards." and Eternalize.
  singleFace({
    name: 'SYNTHETIC Wit Rummager',
    manaCost: ['2', 'U'],
    types: ['creature'],
    subtypes: ['Snake', 'Wizard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 1,
    oracleText:
      'When this creature enters, you may draw cards equal to its power. If you do, discard two cards.\nEternalize {1}{U}',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'may',
              effect: {
                kind: 'draw',
                player: YOU,
                count: { kind: 'powerOf', of: { kind: 'this' } },
              },
            },
            {
              kind: 'conditional',
              condition: { kind: 'didPrevious' },
              effect: { kind: 'discard', player: YOU, count: 2 },
            },
          ],
        },
      },
      eternalize('1', 'U'),
    ],
  }),
  // A creature whose power and toughness are defined by an ability (CR 604.3): the copy that is "4/4" does not copy it (CR 707.9d).
  singleFace({
    name: 'SYNTHETIC Lurker Eternal',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Elemental'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: '*',
    toughness: '*',
    oracleText:
      "This creature's power and toughness are each equal to the number of lands you control.\nEternalize {1}{G}",
    abilities: [
      {
        kind: 'static',
        static: { kind: 'characteristicPt', power: LANDS_YOU, toughness: LANDS_YOU },
      },
      eternalize('1', 'G'),
    ],
  }),
  // Devoid defines the color (CR 604.3, 702.114a): the copy that "is black" does not copy it.
  singleFace({
    name: 'SYNTHETIC Void Eternal',
    manaCost: ['2', 'B'],
    types: ['creature'],
    subtypes: ['Eldrazi'],
    colors: [],
    colorIdentity: ['B'],
    power: 3,
    toughness: 3,
    oracleText: 'Devoid\nEternalize {1}{B}',
    abilities: [{ kind: 'keyword', keyword: { kind: 'devoid' } }, eternalize('1', 'B')],
  }),
  // Changeling defines the creature types (CR 604.3, 702.73a): a copy that "is a Zombie" does not copy it, a copy that "is a Zombie in addition" does.
  singleFace({
    name: 'SYNTHETIC Shifting Brute',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: [],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 2,
    oracleText: 'Changeling\nEternalize {U}',
    abilities: [{ kind: 'keyword', keyword: { kind: 'changeling' } }, eternalize('U')],
  }),
  // A creature that is also an artifact, to see what a copy keeps of its other types.
  singleFace({
    name: 'SYNTHETIC Eternal Automaton',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Construct'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: 'Eternalize {2}',
    abilities: [eternalize('2')],
  }),
  // "Whenever you discard a creature card, you may pay {2}{U}. If you do, create a tapped token that's a copy of that card, except it's a 4/4 black Zombie."
  singleFace({
    name: 'SYNTHETIC Scarab Fist',
    manaCost: ['W', 'B'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Zombie', 'Wizard'],
    colors: ['W', 'B'],
    colorIdentity: ['W', 'U', 'B'],
    power: 1,
    toughness: 3,
    oracleText:
      "Whenever you discard a creature card, you may pay {2}{U}. If you do, create a tapped token that's a copy of that card, except it's a 4/4 black Zombie.",
    abilities: [SCARAB_TRIGGER],
  }),
  // Another card kind in the same trigger (a land card), to show that the filter decides which discards trigger it.
  singleFace({
    name: 'SYNTHETIC Scarab Watcher',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText: 'Whenever you discard a land card, you gain 2 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'discarded', who: 'you', filter: { types: ['land'] } },
        effect: { kind: 'gainLife', player: YOU, amount: 2 },
      },
    ],
  }),
  discarding('SYNTHETIC Tidy Discard', 'Discard a card.', 1),
  discarding('SYNTHETIC Pair Discard', 'Discard two cards.', 2),
  // "Create two 1/1 red Goblin creature tokens."
  singleFace({
    name: 'SYNTHETIC Goblin Sower',
    manaCost: ['R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Create two 1/1 red Goblin creature tokens.',
    spell: {
      effect: {
        kind: 'createToken',
        count: 2,
        token: {
          kind: 'custom',
          definition: {
            name: 'Goblin',
            manaCost: null,
            supertypes: [],
            types: ['creature'],
            subtypes: ['Goblin'],
            colors: ['R'],
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
  }),
  // "As this enters, choose a creature type. Creatures you control of the chosen type get +1/+0. At the beginning of your end step, for each token you control of the chosen
  // type that entered this turn, create a token that's a copy of it."
  singleFace({
    name: 'SYNTHETIC Solidarity Echo',
    manaCost: ['2', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      "As this enchantment enters, choose a creature type.\nCreatures you control of the chosen type get +1/+0.\nAt the beginning of your end step, for each token you control of the chosen type that entered this turn, create a token that's a copy of it.",
    abilities: [
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'creatureType' } },
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'filter', filter: { types: ['creature'], ...OF_TYPE } },
          power: 1,
          toughness: 0,
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        effect: {
          kind: 'createCopies',
          objects: {
            kind: 'each',
            filter: { ...OF_TYPE, token: true, enteredThisTurn: true },
          },
        } satisfies Effect,
      },
    ],
  }),
];
