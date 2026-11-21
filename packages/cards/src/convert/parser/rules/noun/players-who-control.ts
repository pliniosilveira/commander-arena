/**
 * Noun rule: the players who control a permanent of a kind.
 */
import { literal, map, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family, node } from '../registry';

/**
 * `noun.each-player-who-controls`: "each player who controls a creature with power 4 or greater" (Shatter the Sky; CR 102.1, 109.4, 101.4): the players still in the game with at least
 * one battlefield permanent of the kind, each read as the controller in turn, in the order of CR 101.4. The kind is the one `noun.a-permanent` reads after "a" or "an" (a count of two or more
 * and "another" are not read: the engine's `PlayerSelector` `eachPlayerControlling` asks for one). Not read: another group ("each opponent who controls", "target player who controls"),
 * a kind that names a controller of its own ("a creature you control").
 */
export const NOUN_EACH_PLAYER_WHO_CONTROLS = defineRule<IrNoun>({
  id: 'noun.each-player-who-controls',
  family: 'noun',
  leading: ['each'],
  cites: [
    'CR 102.1 (Players)',
    'CR 109.4 (Objects and Players)',
    'CR 101.4 (Handling Simultaneous Decisions)',
  ],
  examples: [
    'each player who controls a creature with power 4 or greater',
    'Each player who controls a creature with power 4 or greater',
    'each player who controls a legendary creature',
  ],
  rejects: [
    'each player who controls',
    'each player who controls two creatures',
    'each player who controls another creature',
    'each opponent who controls a creature',
    'target player who controls a creature',
    'each player who controls a creature you control',
    'each players who controls a creature',
    'each player who control a creature',
  ],
  parse: node<IrNoun, IrNoun>(
    'noun.each-player-who-controls',
    map(
      sequence(
        literal('each player who controls '),
        satisfy(
          family<IrNoun>('noun', { only: ['noun.a-permanent'] }),
          (of) => !of.other && of.count === undefined && of.filter.controller === undefined,
        ),
      ),
      ([, of]) => of,
    ),
    (of) => ({
      kind: 'noun',
      det: 'eachPlayerControlling',
      filter: { raw: 'each player who controls' },
      upTo: false,
      plural: true,
      other: false,
      of,
    }),
  ),
});

export const PLAYERS_WHO_CONTROL_NOUN_RULES = [NOUN_EACH_PLAYER_WHO_CONTROLS];
