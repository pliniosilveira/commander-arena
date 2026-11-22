/**
 * Effect rule of the Scions & Spellcraft deck (Summon: Good King Mog XII): "create a token that's a copy of a non-Saga token you control." The permanent copied is chosen as the
 * instruction resolves (CR 608.2d), not a target.
 */
import { fail, pattern } from '../../combinators';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const RULE = 'effect.create-copy-of-chosen-token';

/**
 * `effect.create-copy-of-chosen-token`: "create a token that's a copy of a non-Saga token you control" (CR 707.2, 111.4, 608.2d): the controller chooses one token they control that is not a
 * Saga, and creates a token with its copiable values; with no such token nothing is created. The engine's `chooseObjects` of one token and a `createToken` that copies the one chosen. Not
 * read: "target", another kind of token, another owner, several tokens, an exception to the copy.
 */
export const EFFECT_CREATE_COPY_OF_CHOSEN_TOKEN = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['create'],
  cites: [
    'CR 707.2 (Copying Objects)',
    'CR 111.4 (Tokens)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    "create a token that's a copy of a non-Saga token you control",
    'create a token that’s a copy of a non-Saga token you control',
  ],
  rejects: [
    "create a token that's a copy of a token you control",
    "create a token that's a copy of target non-Saga token you control",
    "create a token that's a copy of a non-Saga token an opponent controls",
    'create two tokens that are copies of a non-Saga token you control',
    "create a token that's a copy of a non-Saga creature you control",
    "create a token that's a copy of a non-Saga token you control, except it has haste",
    "create a token that's a copy of a non-Saga token you control and draw a card",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/create a token that['’]s a copy of a non-Saga token you control(?![\p{L}\p{N},])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    if (!/^(?:\.|$)/u.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    return {
      ok: true,
      value: [makeClause(RULE, 'createCopyOfChosenToken', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

/** Quiet: a line this rule does not read stops where it always did. */
export const COPY_CHOSEN_TOKEN_EFFECT_RULES = [quietly(EFFECT_CREATE_COPY_OF_CHOSEN_TOKEN)];
