/**
 * Replacement rules of the Squirreled Away deck, group 1: the two replacement effects of the creation of tokens that the engine's `tokensInstead` did not read yet (CR 614.1a,
 * 111.2, 614.5, 616.1). "If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created
 * instead." is `plusThatMany`.
 */
import { literal, map, pattern, sequence } from '../../combinators';
import type { IrAbility, IrAmount, IrClause, IrToken } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import { customToken } from '../token/index';
import { everyToken } from './hashaton-group-3';
import { replacement } from './shared';

const thatMany = map(
  spanned(pattern(/that many(?![\p{L}\p{N}])/iu)),
  ({ span }): IrAmount => ({ kind: 'number', value: 1, span }),
);

/**
 * `replacement.tokens-plus-that-many`: "If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are
 * created instead." (CR 614.1a, 111.2, 614.5: the tokens stay, and for each of them one token of the described kind is made too; the tokens it adds have none of the
 * abilities or choices of the ones created, and a creation is replaced once by one effect). Not read: a kind of token ("creature tokens"), another player, a count other than
 * "that many", "an additional" (the other rule), a missing period or "instead".
 */
export const REPLACEMENT_TOKENS_PLUS_THAT_MANY = defineRule<IrAbility>({
  id: 'replacement.tokens-plus-that-many',
  family: 'replacement',
  leading: ['if'],
  cites: [
    'CR 614.1a (Replacement Effects)',
    'CR 111.2 (Tokens)',
    'CR 614.5 (Replacement Effects)',
    'CR 616.1 (Interaction of Replacement and/or Prevention Effects)',
  ],
  examples: [
    'If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.',
  ],
  rejects: [
    'If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead',
    'If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created.',
    'If one or more tokens would be created under your control, those tokens plus an additional 1/1 green Squirrel creature token are created instead.',
    'If one or more tokens would be created under your control, those tokens plus two 1/1 green Squirrel creature tokens are created instead.',
    'If one or more creature tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.',
    'If one or more tokens would be created under an opponent’s control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.',
    'If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead. Draw a card.',
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.tokens-plus-that-many';
    const r = sequence(
      literal('if one or more tokens would be created under your control, those tokens plus '),
      customToken(thatMany, true),
      literal(' are created instead.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const token: IrToken = { ...r.value[1], span, rule: id };
    const event: IrClause = {
      kind: 'clause',
      verb: 'tokensInstead',
      args: {
        what: everyToken(span, id),
        token,
        plusThatMany: { kind: 'flag', value: true, span, rule: id },
      },
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: r.pos };
  },
});

export const SQUIRREL_G1_REPLACEMENT_RULES = [REPLACEMENT_TOKENS_PLUS_THAT_MANY].map(quietly);
