/**
 * Effect rules of group 5 of the Gisa deck (issue 41, D-478 to D-483): "have target player lose life equal to ..." (Gempalm Polluter), the words after "you may" of
 * "you may have target player lose life equal to the number of Zombies on the battlefield".
 */
import { chain, literal, map, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import type { Clauses } from './operands';
import { lifeAction } from './player';

/**
 * `effect.have-player-life`: "have target player lose life equal to the number of Zombies on the battlefield", "have each opponent lose 2 life", "have target opponent gain 3
 * life" (CR 119.3, 608.2d): the instruction of a player that another player's ability makes them follow; it is the life instruction `effect.player` reads with "have" before
 * the player and the plain verb after it. The "you may" before it is the sentence's (the controller of the ability chooses). One player noun of the player family, one
 * life instruction, nothing else of "have": "have ~ ..." and the other verbs after "have" are other rules.
 */
export const EFFECT_HAVE_PLAYER_LIFE = defineRule<Clauses>({
  id: 'effect.have-player-life',
  family: 'effect',
  leading: ['have'],
  cites: ['CR 119.3 (Life)', 'CR 608.2d (Resolving Spells and Abilities)', 'CR 115.1 (Targets)'],
  examples: [
    'have target player lose life equal to the number of Zombies on the battlefield',
    'have target opponent lose 2 life',
    'have each opponent lose 1 life',
    'have target player gain 3 life',
    'have target player lose life equal to the number of creatures you control',
  ],
  rejects: [
    'have target player loses 2 life',
    'have target player lose life',
    'have target player lose 2',
    'have you lose 2 life',
    'have target creature lose 2 life',
    'have target player lose 2 life and draw a card',
    'have lose 2 life',
    'target player lose 2 life',
    'have target player draw a card',
  ],
  parse: map(
    chain(
      sequence(
        literal('have '),
        // A player other than "you": "have you lose 2 life" is not a thing a card says.
        satisfy(family<IrNoun>('noun', { only: ['noun.player'] }), (noun) => noun.det !== 'you'),
        literal(' '),
      ),
      ([, subject]) => lifeAction(subject, true, 'effect.have-player-life'),
    ),
    (clause): Clauses => [clause],
  ),
});

export const GISA_G5_EFFECT_RULES = [EFFECT_HAVE_PLAYER_LIFE];
