/**
 * "Target creature gains your choice of lifelink or indestructible until end of turn." (Orcish Medicine; CR 608.2d: the controller chooses as the effect resolves, CR 611.2a, 613.1f: the
 * keyword is granted for the turn). The lowering is in `lower/gain-keyword-choice.ts`.
 */
import { type Parser, pattern, sequence } from '../../combinators';
import type { IrClause, IrDuration, IrKeywordList, IrNoun } from '../../ir/types';
import { KEYWORD_WORD } from '../keyword/list';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';
import { GAIN_SUBJECTS } from './pump';

const RULE = 'effect.gain-your-choice-of-keywords';

/** The most keywords one choice offers. */
const MOST_CHOICES = 4;

/**
 * "lifelink or indestructible", "flying, vigilance, or haste": two to four distinct keywords the engine can grant, joined the way Oracle text writes a choice (" or " between two, ", "
 * between more and ", or " before the last).
 */
const CHOICE_OF_KEYWORDS: Parser<readonly string[]> = (ctx, pos) => {
  const first = KEYWORD_WORD(ctx, pos);
  if (!first.ok) return first;
  const words = [first.value];
  const separators: string[] = [];
  let end = first.pos;
  while (words.length < MOST_CHOICES) {
    const sep = /^(?:, or | or |, )/i.exec(ctx.text.slice(end, end + 6));
    if (sep === null) break;
    const next = KEYWORD_WORD(ctx, end + sep[0].length);
    if (!next.ok) break;
    words.push(next.value);
    separators.push(sep[0].toLowerCase());
    end = next.pos;
  }
  const shaped =
    words.length === 2
      ? separators[0] === ' or '
      : words.length > 2 &&
        separators.slice(0, -1).every((s) => s === ', ') &&
        separators[separators.length - 1] === ', or ';
  if (!shaped || new Set(words).size !== words.length) return { ok: false, pos, expected: [] };
  return { ok: true, value: words, pos: end };
};

/**
 * `effect.gain-your-choice-of-keywords`: "target creature gains your choice of lifelink or indestructible until end of turn" (CR 608.2d: the controller of the spell chooses one of the
 * keywords as it resolves, the choice is no target; CR 611.2a, 613.1f: the one chosen is granted for the turn, the others are not). The engine's `chooseOne` of a `grantKeyword` for each
 * keyword. Not read: a pump in the same sentence, a longer duration, keywords the engine cannot grant, "and" for "or", a group of creatures, more words after it.
 */
export const EFFECT_GAIN_YOUR_CHOICE_OF_KEYWORDS = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['~', 'target', 'another', 'it', 'enchanted', 'equipped', 'that'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 611.2a (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
  ],
  examples: [
    'target creature gains your choice of lifelink or indestructible until end of turn',
    'target creature gains your choice of flying, vigilance, or haste until end of turn',
    '~ gains your choice of trample or first strike until end of turn',
  ],
  rejects: [
    'target creature gains your choice of lifelink and indestructible until end of turn',
    'target creature gains your choice of lifelink until end of turn',
    'target creature gains your choice of lifelink or lifelink until end of turn',
    'target creature gains your choice of lifelink or indestructible',
    'target creature gains your choice of lifelink or indestructible until your next turn',
    'target creature gains your choice of lifelink or flash until end of turn',
    'target creature gains your choice of flying, vigilance or haste until end of turn',
    'target creature gains your choice of lifelink or indestructible until end of turn and draw a card',
    'target creature gets +1/+1 and gains your choice of lifelink or indestructible until end of turn',
    'target creature gains lifelink or indestructible until end of turn',
    'creatures you control gain your choice of lifelink or indestructible until end of turn',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        family<IrNoun>('noun', { only: GAIN_SUBJECTS }),
        pattern(/ gains your choice of /),
        spanned(CHOICE_OF_KEYWORDS),
        pattern(/ /),
        family<IrDuration>('duration'),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, , choices, , duration] = r.value.value;
    if (duration.scope !== 'untilEndOfTurn') return { ok: false, pos, expected: [] };
    const keywords: IrKeywordList = {
      kind: 'keywordList',
      names: choices.value,
      span: choices.span,
      rule: RULE,
    };
    const clause: IrClause = {
      ...makeClause(RULE, 'grantKeywordChoice', { objects: subject, keywords }, r.value.span),
      duration,
    };
    return { ok: true, value: [clause], pos: r.pos };
  },
});

export const GAIN_KEYWORD_CHOICE_EFFECT_RULES = [EFFECT_GAIN_YOUR_CHOICE_OF_KEYWORDS];
