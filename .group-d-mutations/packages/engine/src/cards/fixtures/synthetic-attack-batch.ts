/**
 * SYNTHETIC CARDS FOR "WHENEVER YOU ATTACK WITH N OR MORE CREATURES". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-149 (the Angels slice): a trigger that happens once when a player declares at least N attackers
 * ("Whenever you attack with two or more creatures, draw a card", "Whenever another player attacks with two or more creatures, they draw
 * a card if none of those creatures attacked you", the same with a filter, with Angels). Names start with "SYNTHETIC "; oracleId is
 * null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const YOU = { kind: 'you' } as const;

const creature = (
  name: string,
  subtypes: readonly string[],
  abilities: readonly Ability[],
  words: string,
): CardDefinition =>
  singleFace({
    name,
    manaCost: ['3', 'W'],
    types: ['creature'],
    subtypes: [...subtypes],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 4,
    toughness: 3,
    oracleText: words,
    abilities: [...abilities],
  });

export const SYNTHETIC_ATTACK_BATCH_LIST: readonly CardDefinition[] = [
  // "Flying. Whenever you attack with two or more creatures, draw a card. Whenever another player attacks with two or more creatures, they
  //  draw a card if none of those creatures attacked you."
  creature(
    'SYNTHETIC Raid Marshal',
    ['Angel', 'Soldier'],
    [
      kw('flying'),
      {
        kind: 'triggered',
        trigger: { kind: 'attackBatch', who: 'you', atLeast: 2 },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'attackBatch', who: 'opponent', atLeast: 2 },
        effect: {
          kind: 'conditional',
          condition: { kind: 'not', term: { kind: 'attackersAttackedYou' } },
          effect: { kind: 'draw', player: { kind: 'triggerPlayer' }, count: 1 },
        },
      },
    ],
    'Flying. Whenever you attack with two or more creatures, draw a card. Whenever another player attacks with two or more creatures, they draw a card if none of those creatures attacked you.',
  ),
  // "Whenever you attack with three or more Angels, you gain 2 life." (a count of matching creatures, not of every attacker)
  creature(
    'SYNTHETIC Choir Captain',
    ['Angel'],
    [
      {
        kind: 'triggered',
        trigger: {
          kind: 'attackBatch',
          who: 'you',
          atLeast: 3,
          what: { subtypes: ['Angel'] },
        },
        effect: { kind: 'gainLife', player: YOU, amount: 2 },
      },
    ],
    'Whenever you attack with three or more Angels, you gain 2 life.',
  ),
  // "Whenever an opponent attacks with two or more creatures, that player loses 1 life." (reads the attacking player)
  creature(
    'SYNTHETIC Batch Sentinel',
    ['Angel'],
    [
      {
        kind: 'triggered',
        trigger: { kind: 'attackBatch', who: 'opponent', atLeast: 2 },
        effect: { kind: 'loseLife', player: { kind: 'triggerPlayer' }, amount: 1 },
      },
    ],
    'Whenever an opponent attacks with two or more creatures, that player loses 1 life.',
  ),
];
