/**
 * Effect rule of issue 160 (D-629): "Each opponent attacking that player untaps all nonland permanents they control." (Curse of Bounty, CR 701.26a, 508.1): in the body
 * of "Whenever enchanted player is attacked", the opponent who declared the attackers untaps their nonland permanents. The engine's `untap` of the nonland permanents
 * controlled by `triggerPlayer`, which is the player of the attack event; the lowering reads it only in that trigger.
 */
import { pattern } from '../../combinators';
import { defineRule, quietly } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.opponent-attacking-untaps';

export const EFFECT_OPPONENT_ATTACKING_UNTAPS = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 701.26a (Tap and Untap)',
    'CR 508.1 (Declare Attackers Step)',
    'CR 303.4m (Enchantments)',
  ],
  examples: ['each opponent attacking that player untaps all nonland permanents they control'],
  rejects: [
    'each opponent attacking that player untaps all permanents they control',
    'each opponent attacking that player untaps all nonland permanents you control',
    'each opponent attacking you untaps all nonland permanents they control',
    'each opponent untaps all nonland permanents they control',
    'each player attacking that player untaps all nonland permanents they control',
    'each opponent attacking that player untap all nonland permanents they control',
  ],
  parse: single(
    ID,
    pattern(
      /each opponent attacking that player untaps all nonland permanents they control(?![\p{L}\p{N}])/iu,
    ),
    () => ({ verb: 'untapAttackingOpponents', args: {} }),
  ),
});

export const ENCHANTED_PLAYER_EFFECT_RULES = [EFFECT_OPPONENT_ATTACKING_UNTAPS].map(quietly);
