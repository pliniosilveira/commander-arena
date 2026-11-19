/**
 * Effect rules of Finale of Revelation (issue 337): "you have no maximum hand size for the rest of the game".
 */
import { literal } from '../../combinators';
import { defineRule } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.no-max-hand-size-game`: "you have no maximum hand size for the rest of the game" (CR 402.2, 514.1): the player has none from now on, so a cleanup
 * step makes them discard nothing. An instruction of a spell or ability (the engine's `noMaxHandSizeForGame`), not the static ability of a permanent
 * ("You have no maximum hand size", `static.no-maximum-hand-size`). Another duration ("this turn", "until end of turn") and another player are not read.
 */
export const EFFECT_NO_MAX_HAND_SIZE_GAME = defineRule<Clauses>({
  id: 'effect.no-max-hand-size-game',
  family: 'effect',
  leading: ['you'],
  cites: ['CR 402.2 (Hand Size)', 'CR 514.1 (Cleanup Step)'],
  examples: ['you have no maximum hand size for the rest of the game'],
  rejects: [
    'you have no maximum hand size',
    'you have no maximum hand size this turn',
    'you have no maximum hand size until end of turn',
    'you have no maximum hand size for the rest of the turn',
    'target player has no maximum hand size for the rest of the game',
    'each player has no maximum hand size for the rest of the game',
    'you have a maximum hand size of ten for the rest of the game',
  ],
  parse: single(
    'effect.no-max-hand-size-game',
    literal('you have no maximum hand size for the rest of the game'),
    () => ({ verb: 'noMaxHandSizeForGame', args: {} }),
  ),
});

export const FINALE_EFFECT_RULES = [EFFECT_NO_MAX_HAND_SIZE_GAME];
