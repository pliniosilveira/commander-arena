/**
 * `effect.become-copy-keeping-this-ability`: "have ~ become a copy of that creature, except its name is ~ and it has vigilance and this ability" (Kimahri, Valiant Guardian, CR 707.2, 707.9a,
 * 707.9b, 613.2a: this permanent gets the copiable values of the creature an earlier instruction named, as they are when the instruction runs, for good; it keeps its name and has a keyword and
 * the ability that is resolving besides). The text after "you may" of the sentence; the engine's `becomeCopy` with `keepName`, `abilities` and `withThisAbility`. Not read: a duration, another
 * subject, another copied object, a name that is not the card's own, another exception, no "this ability".
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrArg, IrNoun } from '../../ir/types';
import { SIMPLE_KEYWORDS } from '../keyword/vocabulary';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.become-copy-keeping-this-ability';
const BOUNDARY = '(?![\\p{L}\\p{N}])';

const KEYWORD = pattern(
  new RegExp(
    `(${SIMPLE_KEYWORDS.map(([word]) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .sort((a, b) => b.length - a.length)
      .join('|')})${BOUNDARY}`,
    'iu',
  ),
);

export const EFFECT_BECOME_COPY_KEEPING_THIS_ABILITY = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['have'],
  cites: [
    'CR 707.2 (Copying Objects)',
    'CR 707.9a (Copying Objects)',
    'CR 707.9b (Copying Objects)',
    'CR 613.2a (Interaction of Continuous Effects)',
  ],
  examples: [
    'have ~ become a copy of that creature, except its name is ~ and it has vigilance and this ability',
    'have ~ become a copy of that creature, except its name is ~ and it has haste and this ability',
  ],
  rejects: [
    'have ~ become a copy of that creature, except its name is ~ and it has vigilance',
    'have ~ become a copy of that creature, except its name is ~ and this ability',
    'have ~ become a copy of that creature until end of turn, except its name is ~ and it has vigilance and this ability',
    'have ~ become a copy of that creature, except it has vigilance and this ability',
    'have ~ become a copy of that creature, except its name is Bob and it has vigilance and this ability',
    'have ~ become a copy of target creature, except its name is ~ and it has vigilance and this ability',
    'have it become a copy of that creature, except its name is ~ and it has vigilance and this ability',
    'have ~ become a copy of that creature, except its name is ~ and it has banana and this ability',
    'have ~ become a copy of that creature, except its name is ~ and it has vigilance and this ability and flying',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      // The permanent itself is not a noun of the clause: "~" would be the nearest thing "that creature" could name for the binding pass, and it is the one before it that is meant.
      literal('have ~ become a copy of '),
      family<IrNoun>('noun', { only: ['noun.that-object'] }),
      spanned(literal(', except its name is ~ and it has ')),
      spanned(KEYWORD),
      spanned(pattern(new RegExp(` and this ability${BOUNDARY}`, 'iu'))),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, of, except, keyword, ability] = r.value;
    if (of.det !== 'anaphor') return fail(ctx, pos);
    const word: IrArg = {
      kind: 'keywordName',
      name: (keyword.value[1] ?? '').toLowerCase(),
      span: keyword.span,
      rule: ID,
    };
    const clause = makeClause(
      ID,
      'becomeCopyKeepingAbility',
      {
        of,
        keepName: { kind: 'flag', value: true, span: except.span, rule: ID },
        keyword: word,
        thisAbility: { kind: 'flag', value: true, span: ability.span, rule: ID },
      },
      { start: pos, end: r.pos },
    );
    return { ok: true, value: [clause], pos: r.pos };
  },
});

export const KIMAHRI_EFFECT_RULES = [EFFECT_BECOME_COPY_KEEPING_THIS_ABILITY];
