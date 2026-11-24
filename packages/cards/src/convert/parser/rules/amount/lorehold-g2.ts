/**
 * Amount rules of group 2 of the Lorehold Spirit deck (issue 86): "You mill a card for each past vote." (Fateful Tempest: the count that follows a quantity, as `amount.for-each` does, of the votes
 * for one option of the vote the text just made, CR 701.38a, 701.38b).
 */
import { fail, pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';
import { NOT_AN_OPTION, VOTE_OPTION } from '../vote-words';

// No flag `i`: a capital letter is only itself, as the options of a vote are written ("Redhorn Pass"); "For" at the start of a sentence is the one capital allowed.
const FOR_EACH_VOTE = new RegExp(`[Ff]or each (${VOTE_OPTION}) vote(?![\\p{L}\\p{N}])`, 'u');

/**
 * `amount.for-each-vote`: "for each past vote" (CR 701.38a, 701.38b, 608.2c: each player voted for one of the options, and the instruction counts the votes for the one named, as it runs). It
 * follows a quantity like `amount.for-each` does ("You mill a card for each past vote", "Exile the top card of your library for each present vote"). The option is one word the card
 * gave in its vote, which has no rules meaning of its own (CR 701.38b): a lowercase word or a name with capitals ("for each Redhorn Pass vote"); the engine's `votesFor` reads the tally of
 * the vote that ran before it in the same text, and `validateCard` refuses an option that vote does not offer. Not read: "for each vote" (no option), a plural "for each past votes",
 * an option that is a pronoun or a word that counts ("for each extra vote").
 */
export const AMOUNT_FOR_EACH_VOTE = defineRule<IrAmount>({
  id: 'amount.for-each-vote',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 701.38a (Vote)', 'CR 701.38b (Vote)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'for each past vote',
    'for each present vote',
    'For each profit vote',
    'for each left-handed vote',
    'for each Redhorn Pass vote',
    'For each Mines of Moria vote',
  ],
  rejects: [
    'for each vote',
    'for each past votes',
    'for each extra vote',
    'for each other vote',
    'for each Redhorn pass vote',
    'for each PAST vote',
    'for each past vote for',
    'for each past or present vote',
    'for every past vote',
    'for each player vote',
    'past vote',
  ],
  parse: (ctx, pos) => {
    const r = pattern(FOR_EACH_VOTE)(ctx, pos);
    if (!r.ok) return r;
    const option = r.value[1] ?? '';
    if (NOT_AN_OPTION.has(option.toLowerCase())) return fail(ctx, pos);
    return {
      ok: true,
      value: { kind: 'votesFor', option, span: { start: pos, end: r.pos } },
      pos: r.pos,
    };
  },
});

export const LOREHOLD_G2_AMOUNT_RULES = [AMOUNT_FOR_EACH_VOTE];
