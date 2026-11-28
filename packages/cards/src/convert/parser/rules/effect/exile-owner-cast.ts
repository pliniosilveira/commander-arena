/**
 * Effect rule of issue 128 (Aerial Extortionist): "Exile up to one target nonland permanent. For as long as that card remains exiled, its owner may cast it." The engine runs `exile` and
 * `mayPlay` with `byOwner`; only the words are new. The two sentences of one instruction are kept together by the segmenter (`segment.ts`).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.exile-owner-may-cast';

/**
 * `effect.exile-owner-may-cast`: "exile up to one target nonland permanent. For as long as that card remains exiled, its owner may cast it" (CR 701.13, 406.3, 108.3, 601.2, 611.2b: the
 * card is exiled and its owner, not the controller of the ability, may cast it for as long as it stays in exile). The engine's `exile` of the target and a `mayPlay` of the card exiled
 * (`moved`: empty when nothing was exiled), cast only, held by the owner, until it leaves exile. Not read: another number of targets, "you may cast it", "this turn", a cost change,
 * "any permanent", a second instruction joined to it.
 */
export const EFFECT_EXILE_OWNER_MAY_CAST = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 701.13 (Exile)',
    'CR 406.3 (Exile)',
    'CR 108.3 (Owners)',
    'CR 601.2 (Casting Spells)',
    'CR 611.2b (Continuous Effects)',
  ],
  examples: [
    'exile up to one target nonland permanent. For as long as that card remains exiled, its owner may cast it',
  ],
  rejects: [
    'exile up to one target nonland permanent',
    'exile up to one target nonland permanent. For as long as that card remains exiled, you may cast it',
    'exile up to one target nonland permanent. For as long as that card remains exiled, its owner may cast it this turn',
    'exile up to one target nonland permanent. For as long as that card remains exiled, its owner may play it',
    'exile up to one target nonland permanent. For as long as that card remains exiled, its owner may cast it and draw a card',
    'exile all nonland permanents. For as long as that card remains exiled, its owner may cast it',
  ],
  parse: single(
    ID,
    sequence(
      literal('exile '),
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      pattern(
        /\. for as long as that card remains exiled, its owner may cast it(?![\p{L}\p{N}])(?! (?:this|and|then))/iu,
      ),
    ),
    ([, objects]) => ({ verb: 'exileOwnerMayCast', args: { objects } }),
  ),
});

export const EXILE_OWNER_CAST_EFFECT_RULES = [EFFECT_EXILE_OWNER_MAY_CAST];
