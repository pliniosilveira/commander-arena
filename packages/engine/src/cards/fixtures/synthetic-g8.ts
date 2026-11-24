/**
 * SYNTHETIC CARDS FOR EXILE-WORKING TRIGGERS, EXPLOIT AND A TAPPED REPLICATE COST. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the Mind Flayarrrs deck, group 8. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST
 * does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const suspend = (count: number, ...cost: string[]): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'suspend', count, cost: [{ kind: 'mana', symbols: cost }] },
});

const watching: Ability = {
  kind: 'triggered',
  trigger: { kind: 'putIntoGraveyard', who: 'opponent', from: 'anywhere' },
  interveningIf: { kind: 'thisSuspended' },
  functionsIn: 'exile',
  optional: true,
  effect: { kind: 'removeCounters', objects: { kind: 'this' }, counter: 'time', count: 1 },
};

export const SYNTHETIC_G8_LIST: readonly CardDefinition[] = [
  // The same with one time counter: removing it casts the card at once.
  singleFace({
    name: 'SYNTHETIC Exile Watcher Quick',
    manaCost: ['4', 'B'],
    types: ['creature'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText:
      "Suspend 1—{B}\nWhenever a card is put into an opponent's graveyard from anywhere, if this card is suspended, you may remove a time counter from this card.",
    abilities: [suspend(1, 'B'), watching],
  }),
  // "Suspend 3—{B}. Whenever a card is put into an opponent's graveyard from anywhere, if this card is suspended, you may remove a time counter from this card."
  singleFace({
    name: 'SYNTHETIC Exile Watcher',
    manaCost: ['4', 'B'],
    types: ['creature'],
    subtypes: ['Horror'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 4,
    toughness: 4,
    oracleText:
      "Suspend 3—{B}\nWhenever a card is put into an opponent's graveyard from anywhere, if this card is suspended, you may remove a time counter from this card.",
    abilities: [suspend(3, 'B'), watching],
  }),
];
