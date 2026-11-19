/**
 * Noun rule of the Quandrix deck (Secrets of Strixhaven Commander): "all creature tokens", the permanents of a type that are tokens.
 */
import { literal, many, optional, type Parser, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node, quietly } from '../registry';
import {
  CONTROL_SUFFIX,
  type FilterParts,
  MODIFIER,
  NO_PARTS,
  PERMANENT_TYPES,
  toFilter,
  typeWords,
} from './phrases';

const ID = 'noun.all-tokens';

/**
 * `noun.all-tokens`: "all creature tokens", "all nonblack creature tokens you control" (CR 111.1, 110.1, 205.2a: a token is a permanent with the card types its
 * description gives it, so "creature tokens" are the creatures that are tokens). One or more permanent types in the singular, then "tokens"; the modifiers of a
 * permanent phrase come before and the controller after. A creature type ("Goblin tokens"), "all" with a count and "other" are other phrases and stay unread.
 */
export const NOUN_ALL_TOKENS = defineRule<IrNoun>({
  id: ID,
  family: 'noun',
  leading: ['all'],
  cites: ['CR 111.1 (Tokens)', 'CR 110.1 (Permanents)', 'CR 205.2a (Card Types)'],
  examples: [
    'all creature tokens',
    'all artifact tokens',
    'all nonblack creature tokens',
    'all creature tokens you control',
    'all artifact creature tokens an opponent controls',
  ],
  rejects: [
    'all creature token',
    'all creatures tokens',
    'all tokens',
    'all Goblin tokens',
    'all other creature tokens',
    'all nontoken creatures',
    'each creature token',
    'all creature tokens you control.',
  ],
  parse: node<IrFilter, IrNoun>(
    ID,
    ((ctx, pos) => {
      const r = sequence(
        literal('all '),
        many(MODIFIER),
        typeWords(PERMANENT_TYPES, false),
        literal(' tokens'),
        optional(CONTROL_SUFFIX, undefined),
      )(ctx, pos);
      if (!r.ok) return r;
      const [, modifiers, types, , controller] = r.value;
      const parts = modifiers.reduce<FilterParts>((acc, m) => m(acc), {
        ...NO_PARTS,
        types,
        controller,
        token: true,
      });
      return {
        ok: true,
        value: toFilter('battlefield', parts, ctx.text.slice(pos, r.pos)),
        pos: r.pos,
      };
    }) satisfies Parser<IrFilter>,
    (filter) => ({
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});

export const QUANDRIX_NOUN_RULES = [NOUN_ALL_TOKENS].map(quietly);
