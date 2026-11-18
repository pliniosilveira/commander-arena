/**
 * Effect rule of issue 160 (D-628): "Each player gains control of all creatures they own." (Trostani Discordant, CR 613.1b, 613.7b, 611.2a): every creature goes back to its
 * owner, as one layer 2 effect for each owner. The engine's `returnControlToOwners` of every creature on the battlefield.
 */
import { pattern } from '../../combinators';
import { defineRule, quietly } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.each-player-gains-control-of-owned';

export const EFFECT_EACH_PLAYER_GAINS_CONTROL_OF_OWNED = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 613.1b (Interaction of Continuous Effects)',
    'CR 613.7b (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: ['each player gains control of all creatures they own'],
  rejects: [
    'each player gains control of all creatures',
    'each player gains control of all permanents they own',
    'each player gains control of all creatures they control',
    'each player gain control of all creatures they own',
    'each opponent gains control of all creatures they own',
    'each player gains control of all creatures they own until end of turn',
    'each player gains control of creatures they own',
  ],
  parse: single(
    ID,
    pattern(/each player gains control of all creatures they own(?![\p{L}\p{N}])(?! until)/iu),
    () => ({ verb: 'returnControlToOwners', args: {} }),
  ),
});

export const RETURN_CONTROL_EFFECT_RULES = [EFFECT_EACH_PLAYER_GAINS_CONTROL_OF_OWNED].map(quietly);
