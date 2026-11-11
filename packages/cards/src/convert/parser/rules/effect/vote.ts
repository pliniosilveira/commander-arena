/**
 * Effect rule of stage P44 (D-195): voting (CR 701.38), "Starting with you, each player votes for profit or security." The options are words with no rules
 * meaning (CR 701.38b), each connected to an effect the rest of the text gives; the engine's `vote` asks each player in turn order from the controller and
 * keeps the tally for the amount `votesFor` ("twice the number of profit votes", `amount/votes.ts`).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrChoiceArg } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { type Clauses, single } from './operands';

/** One option: a lowercase word, as the card writes it. */
const WORD = '[\\p{Ll}]+(?:-[\\p{Ll}]+)*';

/** "profit or security", "gold, iron or ash", "gold, iron, or ash": two or more words (the list ends with " or <word>"). */
const OPTION_LIST = new RegExp(`(${WORD}(?:, ${WORD})*),? or (${WORD})(?![\\p{L}\\p{N}-])`, 'u');

/**
 * `effect.vote`: "starting with you, each player votes for profit or security" (CR 701.38a: each player, starting with a specified player and proceeding
 * in turn order, chooses one of the listed choices; CR 701.38b: the choices may be words with no rules meaning that are each connected to a different
 * effect; CR 701.38c: only an actual vote is "voting"). The player who starts is "you", the controller, and every player votes once: the engine's `vote`
 * with its options as the card gives them (two to eight lowercase words). Not read: another starting player ("starting with the player to your left"),
 * "each opponent votes", "secretly" (a vote nobody sees is another rule), the choices that are objects or names ("votes for a creature or a planeswalker",
 * capitalised names), a second vote of a player ("may vote an additional time", CR 701.38d), and words after the list ("..., then ...").
 */
export const EFFECT_VOTE = defineRule<Clauses>({
  id: 'effect.vote',
  family: 'effect',
  leading: ['starting'],
  cites: [
    'CR 701.38a (Vote)',
    'CR 701.38b (Vote)',
    'CR 701.38c (Vote)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'starting with you, each player votes for profit or security',
    'Starting with you, each player votes for gold or iron',
    'starting with you, each player votes for gold, iron or ash',
    'starting with you, each player votes for gold, iron, or ash',
    'starting with you, each player votes for left-handed or right-handed',
  ],
  rejects: [
    'starting with you, each player votes for profit',
    'starting with you, each player votes for profit or',
    'starting with you, each player votes for profit, security',
    'starting with you, each player votes for profit or security or',
    'starting with the player to your left, each player votes for profit or security',
    'starting with target opponent, each player votes for profit or security',
    'starting with you, each opponent votes for profit or security',
    'starting with you, each player secretly votes for profit or security',
    'starting with you, each player votes for a creature or a planeswalker',
    'starting with you, each player votes for Profit or Security',
    'starting with you, each player may vote for profit or security',
    'starting with you, each player votes for profit or security an additional time',
    'starting with you, each player votes for profit or security, then you draw a card',
    'each player votes for profit or security',
    'starting with you, you vote for profit or security',
    'starting with you, each player votes profit or security',
  ],
  parse: single(
    'effect.vote',
    sequence(literal('starting with you, each player votes for '), spanned(pattern(OPTION_LIST))),
    ([, listed]) => {
      const text = listed.value[0];
      const options = text.split(/,? or |, /u);
      const choice: IrChoiceArg = {
        kind: 'choiceKind',
        what: 'option',
        options,
        span: listed.span,
        rule: 'effect.vote',
      };
      return { verb: 'vote', args: { options: choice } };
    },
  ),
});

export const VOTE_EFFECT_RULES = [EFFECT_VOTE];
