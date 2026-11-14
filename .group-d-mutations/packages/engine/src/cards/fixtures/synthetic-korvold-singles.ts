/**
 * SYNTHETIC CARDS FOR THE EXPENSIVE SINGLES OF THE KORVOLD DECK. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-187 (the Korvold slice 7a): a sacrifice of one or more Treasures that makes a reflexive ability with "up to that many target
 * creatures" (CR 603.12), a static +1/+0 for each time a creature has attacked this turn, a landfall ability that adds a combat phase after a main phase and
 * untaps the creatures at its beginning (CR 500.8), and an Adventure that exiles the top two cards of an opponent's library face down and lets its caster
 * look at and play them (CR 406.3, 406.3a). Names start with "SYNTHETIC "; oracleId is null. The text has the wording of the real cards the shapes come from
 * (the owner's request file of 2026-10-29); it is not their definition, and the powers, toughnesses and mana costs the file does not give are invented.
 */
import type { Ability, TargetSpec } from '../../ast/types';
import type { CardDefinition, CardFace } from '../definition';
import { kw, singleFace } from './helpers';

const TREASURE = {
  kind: 'createToken',
  token: { kind: 'preset', preset: 'Treasure' },
  count: 1,
} as const;

/** "Whenever you attack, you may sacrifice one or more Treasures. When you do, up to that many target creatures gain double strike until end of turn." */
const TREASURE_ATTACK: Ability = {
  kind: 'triggered',
  trigger: { kind: 'attackBatch', who: 'you', atLeast: 1 },
  effect: {
    kind: 'sequence',
    effects: [
      {
        kind: 'may',
        effect: {
          kind: 'sacrifice',
          objects: {
            kind: 'choose',
            filter: { subtypes: ['Treasure'], controller: 'you' },
            anyNumber: true,
            atLeastOne: true,
          },
        },
      },
      {
        kind: 'reflexive',
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { types: ['creature'] } },
            upToThatMany: true,
          } satisfies TargetSpec,
        ],
        effect: {
          kind: 'grantKeyword',
          objects: { kind: 'target', id: 't1' },
          keyword: { kind: 'doubleStrike' },
          duration: 'untilEndOfTurn',
        },
      },
    ],
  },
};

const face = (input: {
  name: string;
  manaCost: readonly string[];
  types: CardFace['types'];
  subtypes?: CardFace['subtypes'];
  colors: CardFace['colors'];
  power?: number;
  toughness?: number;
  oracleText: string;
  abilities?: readonly Ability[];
  spell?: CardFace['spell'];
}): CardFace => ({
  name: input.name,
  manaCost: input.manaCost,
  supertypes: [],
  types: input.types,
  subtypes: input.subtypes ?? [],
  colors: input.colors,
  power: input.power ?? null,
  toughness: input.toughness ?? null,
  loyalty: null,
  defense: null,
  oracleText: input.oracleText,
  abilities: input.abilities ?? [],
  spell: input.spell ?? null,
});

export const SYNTHETIC_KORVOLD_SINGLES_LIST: readonly CardDefinition[] = [
  // "When this creature enters, create a Treasure token. Whenever you attack, you may sacrifice one or more Treasures. When you do, up to that many
  //  target creatures gain double strike until end of turn."
  singleFace({
    name: 'SYNTHETIC Treasure Raider',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Dragon', 'Rogue', 'Warrior'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      'When this creature enters, create a Treasure token.\nWhenever you attack, you may sacrifice one or more Treasures. When you do, up to that many target creatures gain double strike until end of turn.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: TREASURE,
      },
      TREASURE_ATTACK,
    ],
  }),
  // "Each creature you control gets +1/+0 for each time it has attacked this turn.
  //  Landfall — Whenever a land you control enters, if it's your main phase, there's an additional combat phase after this phase. At the beginning of
  //  that combat, untap all creatures you control."
  singleFace({
    name: 'SYNTHETIC Furious Minotaur',
    manaCost: ['4', 'R', 'R'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Minotaur', 'Warrior'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 6,
    toughness: 6,
    oracleText:
      "Each creature you control gets +1/+0 for each time it has attacked this turn.\nLandfall — Whenever a land you control enters, if it's your main phase, there's an additional combat phase after this phase. At the beginning of that combat, untap all creatures you control.",
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
          power: { kind: 'timesAttacked' },
          toughness: 0,
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'landfall' },
        interveningIf: { kind: 'yourMainPhase' },
        effect: {
          kind: 'extraCombat',
          atBeginning: {
            kind: 'untap',
            objects: { kind: 'each', filter: { types: ['creature'], controller: 'you' } },
          },
        },
      },
    ],
  }),
  // "Flying, trample. Whenever this creature attacks, create a Treasure token."
  // // "Exile the top two cards of target opponent's library face down. You may look at and play those cards for as long as they remain exiled." (Adventure)
  {
    oracleId: null,
    name: 'SYNTHETIC Feast Dragon // Taste of Riches',
    layout: 'adventure',
    faces: [
      face({
        name: 'Feast Dragon',
        manaCost: ['2', 'R', 'R'],
        types: ['creature'],
        subtypes: ['Dragon'],
        colors: ['R'],
        power: 4,
        toughness: 4,
        oracleText: 'Flying, trample\nWhenever this creature attacks, create a Treasure token.',
        abilities: [
          kw('flying'),
          kw('trample'),
          {
            kind: 'triggered',
            trigger: { kind: 'attacks', what: { kind: 'this' } },
            effect: TREASURE,
          },
        ],
      }),
      face({
        name: 'Taste of Riches',
        manaCost: ['2', 'B'],
        types: ['instant'],
        subtypes: ['Adventure'],
        colors: ['B'],
        oracleText:
          "Exile the top two cards of target opponent's library face down. You may look at and play those cards for as long as they remain exiled. (Then exile this card. You may cast the creature later from exile.)",
        spell: {
          targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'exileTop',
                count: 2,
                from: { kind: 'target', id: 't1' },
                faceDown: true,
              },
              {
                kind: 'mayPlay',
                objects: { kind: 'moved' },
                lasts: 'whileExiled',
                lookAt: true,
              },
            ],
          },
        },
      }),
    ],
    colorIdentity: ['B', 'R'],
    support: 'supported',
  },
];
