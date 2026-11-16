/**
 * Noun rules of the Hylda deck, group 3 (issue 42): "any number of target tapped creatures with different controllers" (Cloud's Limit Break).
 */
import { fail, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { BOUNDARY, permanentPhrase } from './phrases';

/**
 * `noun.any-number-targets-controllers`: "any number of target tapped creatures with different controllers" (CR 115.1, 601.2c, 603.3d): a slot of targets with none at
 * least and as many as there are at most, no two of them controlled by the same player (the engine's `differentControllers`). The phrase names no controller of its own
 * ("you control" would say who controls all of them). Not read: the singular, "other target", "up to", a count, another quality of the controllers ("different owners",
 * "different names"), a union of kinds ("creatures and/or planeswalkers", which a slot of one filter does not say).
 */
export const NOUN_ANY_NUMBER_TARGETS_CONTROLLERS = defineRule<IrNoun>({
  id: 'noun.any-number-targets-controllers',
  family: 'noun',
  leading: ['any'],
  cites: ['CR 115.1 (Targets)', 'CR 601.2c (Casting Spells)', 'CR 603.3d (Handling Triggered Abilities)'],
  examples: [
    'any number of target tapped creatures with different controllers',
    'any number of target creatures with different controllers',
    'any number of target nonland permanents with different controllers',
    'any number of target artifacts with different controllers',
  ],
  rejects: [
    'any number of target tapped creatures',
    'any number of target tapped creature with different controllers',
    'any number of tapped creatures with different controllers',
    'any number of other target creatures with different controllers',
    'any number of target creatures you control with different controllers',
    'any number of target creatures with different owners',
    'any number of target creatures with different controllers.',
    'any number of target creatures and/or planeswalkers with different controllers',
    'up to two target creatures with different controllers',
    'target creatures with different controllers',
    'any number of target with different controllers',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      // Looked at first, so that "any number of target ..." without the words stops where it always did.
      pattern(/(?=any number of target [^.,]*? with different controllers(?![\p{L}\p{N}]))/iu),
      pattern(/any number of target /iu),
      permanentPhrase(true, 'all'),
      pattern(new RegExp(` with different controllers${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, , filter] = r.value;
    // A union of kinds is not one filter; a stated controller says who controls them all.
    if (filter.anyOf !== undefined || filter.controller !== undefined) return fail(ctx, pos);
    const noun: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter,
      upTo: false,
      plural: true,
      other: false,
      anyNumber: true,
      differentControllers: true,
      span: { start: pos, end: r.pos },
      rule: 'noun.any-number-targets-controllers',
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

export const HYLDA_G3_NOUN_RULES = [NOUN_ANY_NUMBER_TARGETS_CONTROLLERS];
