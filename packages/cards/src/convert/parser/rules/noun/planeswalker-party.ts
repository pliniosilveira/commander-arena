/**
 * Noun words of the Planeswalker Party deck (issue 132): a group narrowed by a supertype said after the group ("all nonland permanents that aren't legendary").
 * CR 205.4 (Supertypes): legendary is a supertype, so "that aren't legendary" is the engine's `notSupertypes: ['legendary']`, the same filter as "nonlegendary".
 */
import { choice, literal, map, optional, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { BOUNDARY, PLURAL_TYPE_UNION, permanentPhrase } from './phrases';

/**
 * `noun.all-not-legendary`: "all nonland permanents that aren't legendary", "all creatures that aren't legendary" (CR 205.4). The permanents that match at the moment the effect
 * resolves (CR 611.2c). Not read: the singular, "that are legendary" (read as "all legendary ..."), "that aren't legendary or tapped" and another supertype.
 */
export const NOUN_ALL_NOT_LEGENDARY = defineRule<IrNoun>({
  id: 'noun.all-not-legendary',
  family: 'noun',
  leading: ['all'],
  cites: ['CR 205.4 (Supertypes)', 'CR 611.2c (Continuous Effects)'],
  examples: [
    "all nonland permanents that aren't legendary",
    'all nonland permanents that aren’t legendary',
    "all creatures that aren't legendary",
    "all other creatures you control that aren't legendary",
  ],
  rejects: [
    "all creatures that aren't",
    "all creatures that aren't legendary or tapped",
    "all creatures that aren't snow",
    "all creature that aren't legendary",
    "each creature that isn't legendary",
    'all creatures that are legendary',
    "all that aren't legendary",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('all '),
      optional(
        map(literal('other '), () => true),
        false,
      ),
      choice(PLURAL_TYPE_UNION, permanentPhrase(true, 'all')),
      pattern(new RegExp(` that aren['’]t legendary${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, other, found] = r.value;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: {
        ...found,
        notSupertypes: [...(found.notSupertypes ?? []), 'legendary'],
        raw: ctx.text.slice(pos, r.pos),
      },
      upTo: false,
      plural: true,
      other,
      span: { start: pos, end: r.pos },
      rule: 'noun.all-not-legendary',
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

export const PLANESWALKER_PARTY_NOUN_RULES = [NOUN_ALL_NOT_LEGENDARY];
