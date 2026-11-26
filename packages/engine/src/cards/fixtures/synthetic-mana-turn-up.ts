/**
 * SYNTHETIC CARDS FOR MANA THAT CAN BE SPENT ONLY TO TURN PERMANENTS FACE UP, AND FOR THE COST "EXILE A FACE-DOWN PERMANENT YOU CONTROL FACE UP". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of `ManaAbility.spendOnly.turnFaceUp` (CR 106.6, 701.40b): a rock with "{T}: Add {G}{G}{G}{G}. Spend this mana only to turn permanents face up." and a
 * sorcery to show that the mana pays nothing else. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of
 * these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_MANA_TURN_UP_LIST: readonly CardDefinition[] = [
  // "Exile a face-down permanent you control face up: You may play that card this turn." (the cost `exilePermanent`, the card it exiled is `moved`)
  singleFace({
    name: 'SYNTHETIC Unveiling Altar',
    manaCost: ['3', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Exile a face-down permanent you control face up: You may play that card this turn.',
    abilities: [
      {
        kind: 'activated',
        cost: [
          {
            kind: 'exilePermanent',
            filter: { zone: 'battlefield', controller: 'you', facing: 'down' },
          },
        ],
        effect: { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Unmasking Rock',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: ['G'],
    oracleText: '{T}: Add {G}{G}{G}{G}. Spend this mana only to turn permanents face up.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['G', 'G', 'G', 'G'] },
        spendOnly: { turnFaceUp: true },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Green Sorcery',
    manaCost: ['G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'You gain 2 life.',
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 } },
  }),
];
