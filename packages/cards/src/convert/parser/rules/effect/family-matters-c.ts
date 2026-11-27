/**
 * Effect rules of the Family Matters deck, group C.
 *
 * - `effect.look-put-attacking-return`: "Look at the top six cards of your library. You may put a creature card from among them onto the battlefield tapped and attacking. Put the rest on
 *   the bottom of your library in a random order. Return that creature to its owner's hand at end of combat." (Arthur, Marigold Knight).
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrArg } from '../../ir/types';
import { defineRule, family } from '../registry';
import { TAKEN_CARD } from './library';
import { type Clauses, single } from './operands';

/** A number of cards: digits or a word from one to ten (X is not read). */
const NUMBER = family<IrArg>('amount', { only: ['amount.number'] });

/**
 * `effect.look-put-attacking-return`: the four sentences are one instruction (the second and fourth name the card the first one looks at, "that creature"), so `splitSentences` keeps
 * them together (`segment.ts`). The player looks at the top cards of their own library and may put one card of the kind onto the battlefield tapped and attacking (CR 508.4: it was never
 * declared as an attacker; CR 701.20a: nothing says reveal); the rest go on the bottom in a random order (CR 401.4); and a delayed triggered ability returns that creature to its owner's hand
 * at end of combat (CR 603.7, 603.7c, 511.1). The engine's `lookAtTop` taking one card onto the battlefield tapped, then `enterAttacking` and a `delayedTrigger` at the end of combat of
 * the creature put there. Not read: a count under two or X, "reveal", the card put untapped or not attacking, another place for the rest or "any order", another library, another
 * moment or place for the return, another card than "that creature".
 */
export const EFFECT_LOOK_PUT_ATTACKING_RETURN = defineRule<Clauses>({
  id: 'effect.look-put-attacking-return',
  family: 'effect',
  leading: ['look'],
  cites: [
    'CR 508.4 (Declare Attackers Step)',
    'CR 701.20a (Reveal)',
    'CR 401.4 (Library)',
    'CR 603.7c (Delayed Triggered Abilities)',
    'CR 511.1 (End of Combat Step)',
  ],
  examples: [
    "Look at the top six cards of your library. You may put a creature card from among them onto the battlefield tapped and attacking. Put the rest on the bottom of your library in a random order. Return that creature to its owner's hand at end of combat",
    'look at the top four cards of your library. you may put a creature card from among them onto the battlefield tapped and attacking. put the rest on the bottom of your library in a random order. return that creature to its owner’s hand at end of combat',
  ],
  rejects: [
    'look at the top six cards of your library. you may put a creature card from among them onto the battlefield tapped and attacking. put the rest on the bottom of your library in a random order',
    "look at the top six cards of your library. you may put a creature card from among them onto the battlefield tapped. put the rest on the bottom of your library in a random order. return that creature to its owner's hand at end of combat",
    "look at the top six cards of your library. you may put a creature card from among them onto the battlefield tapped and attacking. put the rest on the bottom of your library in any order. return that creature to its owner's hand at end of combat",
    "look at the top six cards of your library. you may put a creature card from among them onto the battlefield tapped and attacking. put the rest on the bottom of your library in a random order. return that creature to its owner's hand at the beginning of the next end step",
    'look at the top six cards of your library. you may put a creature card from among them onto the battlefield tapped and attacking. put the rest on the bottom of your library in a random order. exile that creature at end of combat',
    "look at the top six cards of your library. you may reveal a creature card from among them and put it onto the battlefield tapped and attacking. put the rest on the bottom of your library in a random order. return that creature to its owner's hand at end of combat",
    "look at the top one card of your library. you may put a creature card from among them onto the battlefield tapped and attacking. put the rest on the bottom of your library in a random order. return that creature to its owner's hand at end of combat",
    "look at the top x cards of your library. you may put a creature card from among them onto the battlefield tapped and attacking. put the rest on the bottom of your library in a random order. return that creature to its owner's hand at end of combat",
    "look at the top six cards of target player’s library. you may put a creature card from among them onto the battlefield tapped and attacking. put the rest on the bottom of your library in a random order. return that creature to its owner's hand at end of combat",
    "look at the top six cards of your library. you may put a creature card from among them onto the battlefield tapped and attacking. put the rest on the bottom of your library in a random order. return it to its owner's hand at end of combat",
  ],
  parse: single(
    'effect.look-put-attacking-return',
    sequence(
      literal('look at the top '),
      satisfy(NUMBER, (a) => a.kind === 'number' && a.value >= 2),
      literal(' cards of your library. you may put '),
      TAKEN_CARD,
      pattern(
        / from among them onto the battlefield tapped and attacking\. put the rest on the bottom of your library in a random order\. return that creature to its owner['’]s hand at end of combat(?![\p{L}\p{N}])/iu,
      ),
    ),
    ([, count, , take]) => ({ verb: 'lookPutAttackingReturn', args: { count, take } }),
  ),
});

export const FAMILY_MATTERS_C_EFFECT_RULES = [EFFECT_LOOK_PUT_ATTACKING_RETURN];
