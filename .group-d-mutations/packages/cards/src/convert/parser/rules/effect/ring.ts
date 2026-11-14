/**
 * Effect rule of stage P45 (D-197): the Ring tempts you (CR 701.54). "The Ring tempts you." is a keyword action of the controller of the spell or
 * ability: they get the emblem named The Ring if they have none, choose a creature they control as their Ring-bearer (CR 701.54a) and the Ring has
 * tempted them one more time (CR 701.54c); the engine's `ringTempts` (`rules/ring.ts`) does all of it.
 */
import { literal } from '../../combinators';
import { defineRule } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.ring-tempts`: "the Ring tempts you" (CR 701.54a). Only "you": no card of the engine's list says another player, and the engine's node has
 * no operand. The words after it ("..., then draw a card" is a second clause the sentence rules split off) are not part of this one.
 */
export const EFFECT_RING_TEMPTS = defineRule<Clauses>({
  id: 'effect.ring-tempts',
  family: 'effect',
  leading: ['the'],
  cites: ['CR 701.54a (The Ring Tempts You)', 'CR 701.54c (The Ring Tempts You)'],
  examples: ['the Ring tempts you', 'The Ring tempts you'],
  rejects: [
    'the Ring tempts target player',
    'the Ring tempts each opponent',
    'the Ring tempts',
    'the Ring tempts you twice',
    'the Ring tempts you and you draw a card',
    'the Ring tempt you',
    'Ring tempts you',
    'the Ring tempts yourself',
  ],
  parse: single('effect.ring-tempts', literal('the ring tempts you'), () => ({
    verb: 'ringTempts',
    args: {},
  })),
});

export const RING_EFFECT_RULES = [EFFECT_RING_TEMPTS];
