/**
 * Effect rules of group 5 of the Hashaton deck (D-1163, provisional number): "for each token you control of the chosen type that entered this turn, create a token that's a copy of
 * it" (Renewed Solidarity).
 */
import { literal, map, optional, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const BOUNDARY = '(?![\\p{L}\\p{N}])';

/**
 * `effect.copy-each-token`: "for each token you control of the chosen type that entered this turn, create a token that's a copy of it" (CR 707.2, 111.4, 707.9: a token for each token
 * of the group, with its copiable values; CR 400.7: a token "that entered this turn" is one that is still the object that entered; CR 608.2c). The group is the tokens the controller
 * controls, "of the chosen type" (CR 607.2d) and "that entered this turn" when the words say them. The engine's `createCopies` with no exception. Not read: another group (a creature,
 * a permanent), a token of an opponent, another way to say "it" ("that token"), an exception of the copy, a number of copies.
 */
export const EFFECT_COPY_EACH_TOKEN = defineRule<Clauses>({
  id: 'effect.copy-each-token',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 707.2 (Copying Objects)',
    'CR 111.4 (Tokens)',
    'CR 607.2d (Linked Abilities)',
    'CR 400.7 (General)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'for each token you control of the chosen type that entered this turn, create a token that’s a copy of it',
    'for each token you control that entered this turn, create a token that’s a copy of it',
    'for each token you control of the chosen type, create a token that’s a copy of it',
    'for each token you control, create a token that’s a copy of it',
  ],
  rejects: [
    'for each token you control of the chosen type that entered this turn, create a token that’s a copy of that token',
    'for each token you control of the chosen type that entered this turn, create two tokens that are copies of it',
    'for each token an opponent controls, create a token that’s a copy of it',
    'for each token of the chosen type that entered this turn, create a token that’s a copy of it',
    'for each creature you control that entered this turn, create a token that’s a copy of it',
    'for each token you control of the chosen type that entered this turn, create a token that’s a copy of it, except it has haste',
    'for each token you control that entered this turn of the chosen type, create a token that’s a copy of it',
    'for each tokens you control, create a token that’s a copy of it',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.copy-each-token';
    const r = sequence(
      literal('for each token you control'),
      optional(
        map(literal(' of the chosen type'), () => true as const),
        null,
      ),
      optional(
        map(literal(' that entered this turn'), () => true as const),
        null,
      ),
      spanned(pattern(new RegExp(`, create a token that['’]s a copy of it${BOUNDARY}`, 'iu'))),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, chosen, entered] = r.value;
    const end = r.pos;
    const filter: IrFilter = {
      token: true,
      controller: 'you',
      ...(chosen === null ? {} : { chosen: 'type' as const }),
      ...(entered === null ? {} : { enteredThisTurn: true as const }),
      raw: ctx.text.slice(pos + 'for each '.length, end).split(',')[0] ?? 'token you control',
    };
    const objects: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end },
      rule: id,
    };
    return {
      ok: true,
      value: [makeClause(id, 'createCopiesOfTokens', { objects }, { start: pos, end })],
      pos: end,
    };
  },
});

export const HASHATON_G5_EFFECT_RULES = [EFFECT_COPY_EACH_TOKEN];
