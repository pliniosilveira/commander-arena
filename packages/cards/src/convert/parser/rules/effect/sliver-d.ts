/**
 * Effect rules of the Sliver Swarm deck, group D (issue 133).
 *
 * - `effect.each-player-chooses-creature-type`: "Each player chooses a creature type." (Harsh Mercy, CR 101.4, 205.3m, 608.2d): every player chooses one, the active player first, and what
 *   the rest of the text calls "a type chosen this way" is any of them. The engine's `chooseCreatureType` with `players`.
 */
import { pattern } from '../../combinators';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly } from '../registry';
import { type Clauses, single } from './operands';

const EACH_PLAYER_CHOOSES = 'effect.each-player-chooses-creature-type';

export const EFFECT_EACH_PLAYER_CHOOSES_CREATURE_TYPE = defineRule<Clauses>({
  id: EACH_PLAYER_CHOOSES,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 101.4 (Strictly Speaking)',
    'CR 205.3m (Creature Types)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: ['each player chooses a creature type', 'Each player chooses a creature type'],
  rejects: [
    'each player chooses a creature',
    'each player chooses two creature types',
    'each player chooses any creature type',
    'each opponent chooses a creature type',
    'each player chooses a creature type and draws a card',
    'each player chooses a color',
    'each players chooses a creature type',
  ],
  parse: single(
    EACH_PLAYER_CHOOSES,
    pattern(
      new RegExp(`each player chooses a creature type${BOUNDARY}(?!\\s+and${BOUNDARY})`, 'iu'),
    ),
    () => ({ verb: 'eachPlayerChoosesCreatureType', args: {} }),
  ),
});

export const SLIVER_D_EFFECT_RULES = [EFFECT_EACH_PLAYER_CHOOSES_CREATURE_TYPE].map(quietly);
