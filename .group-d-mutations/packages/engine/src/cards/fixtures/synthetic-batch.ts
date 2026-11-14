/**
 * SYNTHETIC CARDS FOR "WHENEVER ONE OR MORE <FILTER> YOU CONTROL DEAL COMBAT DAMAGE TO A PLAYER" (CR 603.2c). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-139 (the Artifacts slice): a batch trigger over a filter of the sources (artifact creatures, Goblins, any
 * creature), whom they hit (a player, an opponent) and how many of them there must be (one, two). Names start with "SYNTHETIC "; oracleId
 * is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Effect, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const watcher = (
  name: string,
  what: ObjectFilter,
  to: 'player' | 'opponent',
  atLeast: number | undefined,
  effect: Effect,
  oracle: string,
): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: oracle,
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'combatDamageBatch',
          what,
          to,
          ...(atLeast === undefined ? {} : { atLeast }),
        },
        effect,
      },
    ],
  });

export const SYNTHETIC_BATCH_LIST: readonly CardDefinition[] = [
  watcher(
    'SYNTHETIC Spy Ring',
    { types: ['artifact', 'creature'], controller: 'you' },
    'player',
    undefined,
    { kind: 'draw', player: { kind: 'you' }, count: 1 },
    'Whenever one or more artifact creatures you control deal combat damage to a player, draw a card.',
  ),
  watcher(
    'SYNTHETIC Raid Flag',
    { subtypes: ['Goblin'], controller: 'you' },
    'opponent',
    undefined,
    { kind: 'loseLife', player: { kind: 'triggerPlayer' }, amount: 1 },
    'Whenever one or more Goblins you control deal combat damage to an opponent, that player loses 1 life.',
  ),
  watcher(
    'SYNTHETIC Mob Banner',
    { types: ['creature'], controller: 'you' },
    'player',
    2,
    { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
    'Whenever two or more creatures you control deal combat damage to a player, you gain 2 life.',
  ),
];
