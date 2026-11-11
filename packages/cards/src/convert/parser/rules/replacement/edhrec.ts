/**
 * Replacement rules of the Vraska EDHREC deck (stage P66, D-219): "If one or more artifact tokens would be created under your control, ..." (CR 614.1a, 111.2,
 * 616.1), a replacement effect of the permanent that changes what tokens its controller creates.
 */
import { choice, fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrAbility, IrAmount, IrClause, IrNoun, IrToken } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import { customToken } from '../token/index';
import { replacement } from './shared';

const LEAD = 'if one or more artifact tokens would be created under your control, ';

const that = (words: string) =>
  map(
    spanned(pattern(new RegExp(`${words}(?![\\p{L}\\p{N}])`, 'iu'))),
    ({ span }): IrAmount => ({ kind: 'number', value: 1, span }),
  );

/**
 * `replacement.tokens-instead`: "If one or more artifact tokens would be created under your control, that many 5/5 red Dragon creature tokens with flying are created
 * instead." (the artifact tokens become as many tokens of the other kind) and "..., those tokens plus an additional 1/1 colorless Thopter artifact creature token with
 * flying are created instead." (the artifact tokens stay and one more is made). The tokens are described by the text (a color, a creature type, "creature", "artifact
 * creature", "with flying"). Not read: another kind of token ("creature tokens"), another player's, a count other than "that many" or "an additional", a described
 * token with more than the one Draconic Visitor and Stridehangar Automaton have, a missing "instead".
 */
export const REPLACEMENT_TOKENS_INSTEAD = defineRule<IrAbility>({
  id: 'replacement.tokens-instead',
  family: 'replacement',
  leading: ['if'],
  cites: [
    'CR 614.1a (Replacement Effects)',
    'CR 111.2 (Tokens)',
    'CR 616.1 (Interaction of Replacement and/or Prevention Effects)',
  ],
  examples: [
    'If one or more artifact tokens would be created under your control, that many 5/5 red Dragon creature tokens with flying are created instead.',
    'If one or more artifact tokens would be created under your control, those tokens plus an additional 1/1 colorless Thopter artifact creature token with flying are created instead.',
  ],
  rejects: [
    'If one or more artifact tokens would be created under your control, that many 5/5 red Dragon creature tokens with flying are created instead',
    'If one or more artifact tokens would be created under an opponent’s control, that many 5/5 red Dragon creature tokens with flying are created instead.',
    'If one or more creature tokens would be created under your control, that many 5/5 red Dragon creature tokens with flying are created instead.',
    'If one or more artifact tokens would be created under your control, two 5/5 red Dragon creature tokens with flying are created instead.',
    'If one or more artifact tokens would be created under your control, that many 5/5 red Dragon creature tokens with flying are created.',
    'If one or more artifact tokens would be created under your control, those tokens plus a 1/1 colorless Thopter artifact creature token with flying are created instead.',
    'If one or more artifact tokens would be created under your control, those tokens plus an additional 1/1 colorless Thopter artifact creature tokens with flying are created instead.',
    'If one or more artifact tokens would be created under your control, those tokens and an additional 1/1 colorless Thopter artifact creature token with flying are created instead.',
    'If one or more artifact tokens would be created, that many 5/5 red Dragon creature tokens with flying are created instead.',
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.tokens-instead';
    const head = literal(LEAD)(ctx, pos);
    if (!head.ok) return head;
    const tail = sequence(
      choice(
        map(
          sequence(customToken(that('that many'), true), literal(' are created instead')),
          ([token]) => ({ plus: false, token }),
        ),
        map(
          sequence(
            literal('those tokens plus '),
            customToken(that('an additional'), false),
            literal(' are created instead'),
          ),
          ([, token]) => ({ plus: true, token }),
        ),
      ),
      literal('.'),
    )(ctx, head.pos);
    if (!tail.ok) return tail;
    const [{ plus, token: bare }] = tail.value;
    // "an additional ... token" is one token: the plural noun is the other wording.
    if (
      plus &&
      /an additional [^.]*? tokens(?![\p{L}\p{N}])/iu.test(ctx.text.slice(pos, tail.pos))
    ) {
      return fail(ctx, pos);
    }
    const span = { start: pos, end: tail.pos };
    const token: IrToken = { ...bare, span, rule: id };
    const what: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { types: ['artifact'], token: true, raw: 'artifact tokens' },
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: id,
    };
    const event: IrClause = {
      kind: 'clause',
      verb: 'tokensInstead',
      args: {
        what,
        token,
        ...(plus ? { plus: { kind: 'flag', value: true, span, rule: id } } : {}),
      },
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: tail.pos };
  },
});

export const EDHREC_REPLACEMENT_RULES = [REPLACEMENT_TOKENS_INSTEAD].map(quietly);
