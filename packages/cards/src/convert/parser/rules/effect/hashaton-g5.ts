/**
 * Effect rules of group 5 of the Hashaton deck (D-385, provisional number): "for each token you control of the chosen type that entered this turn, create a token that's a copy of
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

/**
 * `effect.copy-each-creature-token`: "for each creature token you control, create a token that's a copy of that creature" (issue 145, Rhys the Redeemed; CR 707.2, 111.4: a token for
 * each creature token of the group, with its copiable values; CR 608.2c). The engine's `createCopies` with no exception, as `effect.copy-each-token`. Not read: a token of an opponent,
 * a permanent that is not a creature token ("each token"), another way to say "that creature" ("it", "that token"), an exception of the copy, a number of copies.
 */
export const EFFECT_COPY_EACH_CREATURE_TOKEN = defineRule<Clauses>({
  id: 'effect.copy-each-creature-token',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 707.2 (Copying Objects)',
    'CR 111.4 (Tokens)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'for each creature token you control, create a token that’s a copy of that creature',
    "for each creature token you control, create a token that's a copy of that creature",
  ],
  rejects: [
    'for each creature token you control, create a token that’s a copy of it',
    'for each creature token you control, create a token that’s a copy of that token',
    'for each creature token an opponent controls, create a token that’s a copy of that creature',
    'for each creature you control, create a token that’s a copy of that creature',
    'for each token you control, create a token that’s a copy of that creature',
    'for each creature tokens you control, create a token that’s a copy of that creature',
    'for each creature token you control, create two tokens that are copies of that creature',
    'for each creature token you control, create a token that’s a copy of that creature, except it has haste',
    'for each creature token you control that entered this turn, create a token that’s a copy of that creature',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.copy-each-creature-token';
    const r = sequence(
      literal('for each creature token you control'),
      spanned(
        pattern(new RegExp(`, create a token that['’]s a copy of that creature${BOUNDARY}`, 'iu')),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const end = r.pos;
    const filter: IrFilter = {
      types: ['creature'],
      token: true,
      controller: 'you',
      raw: 'creature token you control',
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

/**
 * `effect.copy-each-token-that-permanent`: "for each token you control, create a token that's a copy of that permanent" (Second Harvest; CR 707.2, 111.4, 608.2c: a token for each
 * token the controller controls, of any type, with its copiable values, which are those of the token as it is when the instruction is carried out). The engine's `createCopies` with no
 * exception, as `effect.copy-each-token`. Not read: a token of an opponent, a group that is not tokens, another way to say it ("it", "that token", "that creature"), an exception, a number
 * of copies.
 */
export const EFFECT_COPY_EACH_TOKEN_THAT_PERMANENT = defineRule<Clauses>({
  id: 'effect.copy-each-token-that-permanent',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 707.2 (Copying Objects)',
    'CR 111.4 (Tokens)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'for each token you control, create a token that’s a copy of that permanent',
    "for each token you control, create a token that's a copy of that permanent",
  ],
  rejects: [
    'for each token you control, create a token that’s a copy of that token',
    'for each token you control, create a token that’s a copy of it',
    'for each token an opponent controls, create a token that’s a copy of that permanent',
    'for each creature you control, create a token that’s a copy of that permanent',
    'for each tokens you control, create a token that’s a copy of that permanent',
    'for each token you control, create two tokens that are copies of that permanent',
    'for each token you control, create a token that’s a copy of that permanent, except it has haste',
    'for each token you control that entered this turn, create a token that’s a copy of that permanent',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.copy-each-token-that-permanent';
    const r = sequence(
      literal('for each token you control'),
      spanned(
        pattern(new RegExp(`, create a token that['’]s a copy of that permanent${BOUNDARY}`, 'iu')),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const end = r.pos;
    const filter: IrFilter = { token: true, controller: 'you', raw: 'token you control' };
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

export const HASHATON_G5_EFFECT_RULES = [
  EFFECT_COPY_EACH_TOKEN,
  EFFECT_COPY_EACH_CREATURE_TOKEN,
  EFFECT_COPY_EACH_TOKEN_THAT_PERMANENT,
];
