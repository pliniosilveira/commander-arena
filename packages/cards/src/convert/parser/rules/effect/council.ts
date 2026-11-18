/**
 * Effect rule of issue 103 (Selvala's Stampede, a council's dilemma card): revealing cards until one of a kind is revealed for each vote for an option (CR 701.38b, 701.20), the
 * cards found put onto the battlefield, and the rest shuffled into the library (CR 701.24). The vote itself is `effect.vote`; the votes counted are `amount.for-each-vote`.
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrAmount, IrNameArg, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, single } from './operands';

const RULE = 'effect.reveal-until-votes';

/**
 * `effect.reveal-until-votes`: "reveal cards from the top of your library until you reveal a creature card for each wild vote. Put those creature cards onto the battlefield, then
 * shuffle the rest into your library" (CR 701.20 Reveal: one card at a time until as many cards of the kind as the number are revealed, all the library when it holds fewer; CR 701.38b:
 * the number is the votes for one option; CR 110.2a: the cards enter under your control; CR 701.24: the cards revealed and not put onto the battlefield are shuffled into the library).
 * Two sentences that `splitSentences` keeps together. The kind is a library card noun ("a creature card"), and the second sentence names the same kind in the plural: the engine's
 * `revealUntil` with a `count` and the rest left in the library, then a `shuffle`. Not read: another place ("into your hand"), tapped, a rest put elsewhere, "any order", a number that
 * is not a vote count, or a different kind in the second sentence.
 */
export const EFFECT_REVEAL_UNTIL_VOTES = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20 (Reveal)',
    'CR 701.38b (Vote)',
    'CR 701.24 (Shuffle)',
    'CR 110.2a (Permanents)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'reveal cards from the top of your library until you reveal a creature card for each wild vote. Put those creature cards onto the battlefield, then shuffle the rest into your library',
    'reveal cards from the top of your library until you reveal a land card for each present vote. Put those land cards onto the battlefield, then shuffle the rest into your library',
  ],
  rejects: [
    'reveal cards from the top of your library until you reveal a creature card for each wild vote',
    'reveal cards from the top of your library until you reveal a creature card for each wild vote. Put those creature cards onto the battlefield',
    'reveal cards from the top of your library until you reveal a creature card for each wild vote. Put those creature cards into your hand, then shuffle the rest into your library',
    'reveal cards from the top of your library until you reveal a creature card for each wild vote. Put those creature cards onto the battlefield tapped, then shuffle the rest into your library',
    'reveal cards from the top of your library until you reveal a creature card for each wild vote. Put those creature cards onto the battlefield, then put the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal a creature card for each vote. Put those creature cards onto the battlefield, then shuffle the rest into your library',
    'reveal cards from the top of your library until you reveal a creature card. Put those creature cards onto the battlefield, then shuffle the rest into your library',
    'reveal cards from the top of target player’s library until you reveal a creature card for each wild vote. Put those creature cards onto the battlefield, then shuffle the rest into your library',
    'reveal cards from the top of your library until you reveal a creature card for each extra vote. Put those creature cards onto the battlefield, then shuffle the rest into your library',
  ],
  parse: single(
    RULE,
    sequence(
      literal('reveal cards from the top of your library until you reveal '),
      family<IrNoun>('noun', { only: ['noun.library-card'] }),
      literal(' '),
      family<IrAmount>('amount', { only: ['amount.for-each-vote'] }),
      literal('. put those '),
      spanned(
        pattern(
          /[\p{L}]+(?= cards onto the battlefield, then shuffle the rest into your library)/iu,
        ),
      ),
      literal(' cards onto the battlefield, then shuffle the rest into your library'),
    ),
    ([, card, , votes, , plural]) => {
      const kind: IrNameArg = {
        kind: 'name',
        name: plural.value[0].toLowerCase(),
        span: plural.span,
        rule: RULE,
      };
      return {
        verb: 'revealUntilVotes',
        args: { card: { ...card, upTo: false, plural: false }, count: votes, kind },
      };
    },
  ),
});

export const COUNCIL_EFFECT_RULES = [EFFECT_REVEAL_UNTIL_VOTES];
