/**
 * Noun rules of group 1 of the Lorehold Spirit deck (issue 86): "any number of target cards from your graveyard" (Perpetual Timepiece: "Shuffle any number of target cards from your
 * graveyard into your library.").
 */
import { fail, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { graveyardPhrase } from './phrases';

/**
 * `noun.any-number-target-graveyard-cards`: "any number of target cards from your graveyard", "any number of target creature cards from your graveyard" (CR 115.1, 601.2c, 404.1): no fewest
 * and no most, cards of your own graveyard (the plural phrase of `noun.target-graveyard-card`). Its own rule, so the phrase is read only where an effect asks for this noun by its id
 * (`effect.shuffle-cards-into-library`). The lowering reads it as the engine's slot `anyNumber`. Not read: "any number of target cards" with no graveyard, a graveyard that is not yours,
 * "any number of cards from your graveyard" (no target), "any number of target card from your graveyard" (the noun is plural), "any number of other target ...".
 */
export const NOUN_ANY_NUMBER_TARGET_GRAVEYARD_CARDS = defineRule<IrNoun>({
  id: 'noun.any-number-target-graveyard-cards',
  family: 'noun',
  leading: ['any'],
  cites: ['CR 115.1 (Targets)', 'CR 601.2c (Casting Spells)', 'CR 404.1 (Graveyard)'],
  examples: [
    'any number of target cards from your graveyard',
    'any number of target creature cards from your graveyard',
    'any number of target land cards from your graveyard',
    'any number of target instant cards from your graveyard',
  ],
  rejects: [
    'any number of target cards',
    'any number of target cards from a graveyard',
    "any number of target cards from an opponent's graveyard",
    'any number of cards from your graveyard',
    'any number of target card from your graveyard',
    'any number of other target cards from your graveyard',
    'any number of target creatures',
    'any number of target cards in your graveyard',
    'any number of',
    'any target card from your graveyard',
  ],
  parse: (ctx, pos) => {
    const r = sequence(pattern(/any number of target /iu), graveyardPhrase(true, 'from'))(ctx, pos);
    if (!r.ok) return r;
    const [, filter] = r.value;
    // Your graveyard only: the cards go to your library.
    if (filter.controller !== 'you') return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'noun',
        det: 'target',
        filter,
        upTo: false,
        plural: true,
        other: false,
        anyNumber: true,
        span: { start: pos, end: r.pos },
        rule: 'noun.any-number-target-graveyard-cards',
      },
      pos: r.pos,
    };
  },
});

export const LOREHOLD_G1_NOUN_RULES = [NOUN_ANY_NUMBER_TARGET_GRAVEYARD_CARDS];
