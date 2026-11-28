/**
 * Replacement rule of the Peace Offering deck (issue 112), group F: Fisher's Talent's "If you would create a Fish token, create a 3/3 blue Shark creature token instead." (CR 614.1a,
 * 111.2, 616.1f), the engine's `tokensInstead` in `swap` mode.
 */
import { fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrAbility, IrAmount, IrClause, IrNoun, IrToken } from '../../ir/types';
import { CREATURE_TYPES } from '../noun/creature-types';
import { defineRule, quietly, spanned } from '../registry';
import { customToken } from '../token/index';
import { replacement } from './shared';

const ID = 'replacement.token-swap';

/** "a" or "an": one token in place of each. */
const ONE = map(
  spanned(pattern(/an?(?![\p{L}\p{N}])/iu)),
  ({ span }): IrAmount => ({ kind: 'number', value: 1, span }),
);

/**
 * `replacement.token-swap`: "If you would create a Fish token, create a 3/3 blue Shark creature token instead." (CR 614.1a, 111.2, 616.1f): each token of the creature type its
 * controller would create, by any effect, is created as the token the text describes instead, and what the instruction said about it still applies (the Fisher's Talent ruling of
 * 2024-07-26). The type is one creature type (CR 205.3m); the token is described by the text (power and toughness, a color, a creature type, "creature"). Not read: another
 * player ("an opponent would create"), a type that is not a creature type, more than one token ("two ... tokens"), a missing "instead".
 */
export const REPLACEMENT_TOKEN_SWAP = defineRule<IrAbility>({
  id: ID,
  family: 'replacement',
  leading: ['if'],
  cites: [
    'CR 614.1a (Replacement Effects)',
    'CR 111.2 (Tokens)',
    'CR 616.1f (Interaction of Replacement and/or Prevention Effects)',
    'CR 205.3m (Subtypes)',
  ],
  examples: [
    'If you would create a Fish token, create a 3/3 blue Shark creature token instead.',
    'If you would create a Shark token, create an 8/8 blue Octopus creature token instead.',
  ],
  rejects: [
    'If you would create a Fish token, create a 3/3 blue Shark creature token instead',
    'If you would create a Fish token, create a 3/3 blue Shark creature token.',
    'If an opponent would create a Fish token, create a 3/3 blue Shark creature token instead.',
    'If you would create a Treasure token, create a 3/3 blue Shark creature token instead.',
    'If you would create a Fish token, create two 3/3 blue Shark creature tokens instead.',
    'If you would create a Fish token, create a 3/3 blue Shark creature token instead. Draw a card.',
  ],
  parse: (ctx, pos) => {
    const head = pattern(/if you would create an? (\p{Lu}[\p{L}-]*) token, create /iu)(ctx, pos);
    if (!head.ok) return head;
    const from = head.value[1] ?? '';
    // CR 205.3m: the token replaced is named by one creature type.
    if (!CREATURE_TYPES.has(from)) return fail(ctx, pos);
    const tail = sequence(customToken(ONE, false), literal(' instead.'))(ctx, head.pos);
    if (!tail.ok) return tail;
    const [bare] = tail.value;
    const span = { start: pos, end: tail.pos };
    const token: IrToken = { ...bare, span, rule: ID };
    const what: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { token: true, subtypes: [from], raw: `${from} token` },
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: ID,
    };
    const event: IrClause = {
      kind: 'clause',
      verb: 'tokensInstead',
      args: { what, token, swap: { kind: 'flag', value: true, span, rule: ID } },
      optional: false,
      span,
      rule: ID,
    };
    return { ok: true, value: replacement(ID, span, event), pos: tail.pos };
  },
});

export const TOKEN_SWAP_REPLACEMENT_RULES = [REPLACEMENT_TOKEN_SWAP].map(quietly);
