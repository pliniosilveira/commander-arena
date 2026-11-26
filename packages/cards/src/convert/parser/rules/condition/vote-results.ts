/**
 * Condition rules of the council cards of the Elven Council deck (issue 17): what the vote just made came to, "if time gets more votes", "if the vote is tied" (CR 701.38a: the option
 * with the most votes; the engine's `voteMost` and `voteTied` read the tally of the vote that ran before them in the same text, and `validateCard` refuses a text with no such vote or an
 * option the vote does not offer).
 */
import { fail, pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';
import { NOT_AN_OPTION, VOTE_OPTION } from '../vote-words';

const MORE_VOTES = new RegExp(
  `(${VOTE_OPTION}) gets more votes(?: or the vote is tied)?(?![\\p{L}\\p{N}])`,
  'u',
);

function voteCondition(
  test: IrCondition['test'],
  id: string,
  pos: number,
  end: number,
): IrCondition {
  return { kind: 'condition', test, span: { start: pos, end }, rule: id };
}

/**
 * `condition.vote-result`: "time gets more votes" (CR 701.38a: more votes than each other option), alone or with " or the vote is tied" ("knowledge gets more votes or the vote is tied": the
 * option wins or more than one option has the most votes), and "the vote is tied". The option is the word or the name the card gave its vote. Not read: "gets more votes than" something,
 * "gets the most votes", "gets fewer votes", a count of votes, "each player votes for the same option", an option that is a pronoun or a word that counts ("each", "the").
 */
export const CONDITION_VOTE_RESULT = defineRule<IrCondition>({
  id: 'condition.vote-result',
  family: 'condition',
  leading: [],
  cites: ['CR 701.38a (Vote)', 'CR 701.38b (Vote)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'time gets more votes',
    'knowledge gets more votes or the vote is tied',
    'Redhorn Pass gets more votes',
    'Mines of Moria gets more votes or the vote is tied',
    'the vote is tied',
  ],
  rejects: [
    'time gets more votes than knowledge',
    'time gets the most votes',
    'time gets fewer votes',
    'time gets more votes or the vote is',
    'time gets more votes or the vote is tied or',
    'time gets votes',
    'gets more votes',
    'each gets more votes',
    'the vote is tied or time gets more votes',
    'the vote is not tied',
    'the vote is tied and',
    'a vote is tied',
    'the votes are tied',
  ],
  parse: (ctx, pos) => {
    const id = 'condition.vote-result';
    const tied = pattern(/the vote is tied(?![\p{L}\p{N}])/u)(ctx, pos);
    if (tied.ok)
      return {
        ok: true,
        value: voteCondition({ kind: 'voteTied' }, id, pos, tied.pos),
        pos: tied.pos,
      };
    const r = pattern(MORE_VOTES)(ctx, pos);
    if (!r.ok) return r;
    const option = r.value[1] ?? '';
    if (NOT_AN_OPTION.has(option.toLowerCase())) return fail(ctx, pos);
    const most = voteCondition({ kind: 'voteMost', option }, id, pos, r.pos);
    const text = ctx.text.slice(pos, r.pos);
    if (!text.endsWith(' or the vote is tied')) return { ok: true, value: most, pos: r.pos };
    // "or the vote is tied": the option wins, or the most votes are shared.
    return {
      ok: true,
      value: voteCondition(
        { kind: 'or', terms: [most, voteCondition({ kind: 'voteTied' }, id, pos, r.pos)] },
        id,
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

export const VOTE_RESULT_CONDITION_RULES = [CONDITION_VOTE_RESULT];
