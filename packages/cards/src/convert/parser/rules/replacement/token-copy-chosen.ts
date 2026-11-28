/**
 * Replacement rule of issue 128 (Esix, Fractal Bloom): "The first time you would create one or more tokens during each of your turns, you may instead choose a creature other than ~ and
 * create that many tokens that are copies of that creature." (CR 614.1a, 614.5, 707.2, 111.4), the engine's `tokensInstead` in `copyChosen` mode.
 */
import { pattern } from '../../combinators';
import type { IrAbility, IrClause } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { replacement } from './shared';

const ID = 'replacement.tokens-copy-chosen';

/**
 * `replacement.tokens-copy-chosen`: "The first time you would create one or more tokens during each of your turns, you may instead choose a creature other than ~ and create that many tokens
 * that are copies of that creature." (CR 614.1a: the tokens are replaced; CR 614.5: it applies once to the event; CR 111.4, 707.2: each token is a copy of the creature as it is now). The
 * engine's `tokensInstead` in `copyChosen` mode: optional, only the first creation of the controller's turn, applied before any other effect of the creation. Not read: another time ("the
 * first two times"), another player, "each turn", a creature type or "you control" on the creature chosen, "that many" left out, an ability after it.
 */
export const REPLACEMENT_TOKENS_COPY_CHOSEN = defineRule<IrAbility>({
  id: ID,
  family: 'replacement',
  leading: ['the'],
  cites: [
    'CR 614.1a (Replacement Effects)',
    'CR 614.5 (Replacement Effects)',
    'CR 707.2 (Copying Objects)',
    'CR 111.4 (Tokens)',
  ],
  examples: [
    'The first time you would create one or more tokens during each of your turns, you may instead choose a creature other than ~ and create that many tokens that are copies of that creature.',
  ],
  rejects: [
    'The first time you would create one or more tokens during each of your turns, you may instead choose a creature other than ~ and create that many tokens that are copies of that creature',
    'The first time you would create one or more tokens during each of your turns, you may instead choose a creature other than ~ and create one token that is a copy of that creature.',
    'The first time you would create one or more tokens each turn, you may instead choose a creature other than ~ and create that many tokens that are copies of that creature.',
    'The first time an opponent would create one or more tokens during each of your turns, you may instead choose a creature other than ~ and create that many tokens that are copies of that creature.',
    'The first time you would create one or more tokens during each of your turns, instead choose a creature other than ~ and create that many tokens that are copies of that creature.',
    'The first time you would create one or more tokens during each of your turns, you may instead choose a creature you control other than ~ and create that many tokens that are copies of that creature.',
    'The first time you would create one or more tokens during each of your turns, you may instead choose a creature other than ~ and create that many tokens that are copies of that creature. Draw a card.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /the first time you would create one or more tokens during each of your turns, you may instead choose a creature other than ~ and create that many tokens that are copies of that creature\.(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const event: IrClause = {
      kind: 'clause',
      verb: 'tokensInstead',
      args: { copyChosen: { kind: 'flag', value: true, span, rule: ID } },
      optional: false,
      span,
      rule: ID,
    };
    return { ok: true, value: replacement(ID, span, event), pos: r.pos };
  },
});

export const TOKEN_COPY_CHOSEN_REPLACEMENT_RULES = [REPLACEMENT_TOKENS_COPY_CHOSEN].map(quietly);
