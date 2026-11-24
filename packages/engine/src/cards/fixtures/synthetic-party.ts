/**
 * SYNTHETIC CARDS FOR THE PARTY MECHANIC (CR 700.8). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of `partySize`, the number of creatures in a player's party: a characteristic-defining power, an enters trigger that drains by it, a spell
 * whose cost is reduced by it, and a trigger whose intervening "if" is "you have a full party" (`amountIs` of it at least 4). Names start with "SYNTHETIC "; oracleId is
 * null. The text describes what the AST does; it is not Oracle text.
 */
import type { Amount, Condition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const PARTY: Amount = { kind: 'partySize' };
const FULL_PARTY: Condition = {
  kind: 'amountIs',
  amount: PARTY,
  compare: { cmp: 'atLeast', value: 4 },
};

const member = (name: string, subtypes: string[]): CardDefinition =>
  singleFace({
    name,
    manaCost: ['1'],
    types: ['creature'],
    subtypes,
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: '',
  });

export const SYNTHETIC_PARTY_LIST: readonly CardDefinition[] = [
  member('SYNTHETIC Party Cleric', ['Human', 'Cleric']),
  member('SYNTHETIC Party Rogue', ['Human', 'Rogue']),
  member('SYNTHETIC Party Warrior', ['Human', 'Warrior']),
  member('SYNTHETIC Party Wizard', ['Human', 'Wizard']),
  // Two of the four types on one creature: it fills one slot (CR 700.8b).
  member('SYNTHETIC Party Cleric Rogue', ['Human', 'Cleric', 'Rogue']),
  member('SYNTHETIC Party Rogue Warrior', ['Human', 'Rogue', 'Warrior']),
  member('SYNTHETIC Party Warrior Wizard', ['Human', 'Warrior', 'Wizard']),
  member('SYNTHETIC Party Commoner', ['Human', 'Peasant']),
  // "~'s power is equal to the number of creatures in your party."
  singleFace({
    name: 'SYNTHETIC Party Scribe',
    manaCost: ['W'],
    types: ['creature'],
    subtypes: ['Human', 'Cleric'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: '*',
    toughness: 2,
    oracleText: "~'s power is equal to the number of creatures in your party.",
    abilities: [{ kind: 'static', static: { kind: 'characteristicPt', power: PARTY } }],
  }),
  // "When ~ enters, each opponent loses X life and you gain X life, where X is the number of creatures in your party."
  singleFace({
    name: 'SYNTHETIC Party Leech',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Vampire', 'Cleric'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 1,
    oracleText:
      'When ~ enters, each opponent loses X life and you gain X life, where X is the number of creatures in your party.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: PARTY },
            { kind: 'gainLife', player: { kind: 'you' }, amount: PARTY },
          ],
        },
      },
    ],
  }),
  // "This spell costs {1} less to cast for each creature in your party. You gain 5 life."
  singleFace({
    name: 'SYNTHETIC Party Rite',
    manaCost: ['4', 'B', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'This spell costs {1} less to cast for each creature in your party.\nYou gain 5 life.',
    abilities: [
      {
        kind: 'static',
        static: { kind: 'costReduction', spells: { kind: 'this' }, amount: PARTY },
      },
    ],
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 5 } },
  }),
  // "At the beginning of combat on your turn, if you have a full party, you gain 3 life."
  singleFace({
    name: 'SYNTHETIC Party Banner',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Peasant'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 1,
    oracleText:
      'At the beginning of combat on your turn, if you have a full party, you gain 3 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        interveningIf: FULL_PARTY,
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
      },
    ],
  }),
];
