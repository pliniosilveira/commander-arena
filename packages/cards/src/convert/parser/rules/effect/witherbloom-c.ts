/**
 * Effect rules of group C of the Witherbloom Witchcraft deck (issue 190): "For each permanent type, return up to one card of that type from your graveyard to the
 * battlefield." (Revival Experiment).
 */
import { fail, pattern } from '../../combinators';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.return-one-per-permanent-type`: "for each permanent type, return up to one card of that type from your graveyard to the battlefield" (CR 608.2d, 110.2a: the
 * controller chooses a card of each permanent type, none or one each, and the cards they choose enter under their control; a card of two types can be chosen for either, never
 * twice, because it has left the graveyard). The engine's `moveToZone` of an optional `choose` of the graveyard for each permanent type, in turn. Not read: another number, another
 * zone, another destination, card types that are not permanent types, another player's graveyard.
 */
export const EFFECT_RETURN_ONE_PER_PERMANENT_TYPE = defineRule<Clauses>({
  id: 'effect.return-one-per-permanent-type',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 110.2a (Permanents)',
    'CR 110.4 (Permanents)',
  ],
  examples: [
    'for each permanent type, return up to one card of that type from your graveyard to the battlefield',
    'For each permanent type, return up to one card of that type from your graveyard to the battlefield',
  ],
  rejects: [
    'for each permanent type, return up to one card of that type from your graveyard to your hand',
    'for each permanent type, return up to two cards of that type from your graveyard to the battlefield',
    'for each permanent type, return one card of that type from your graveyard to the battlefield',
    'for each card type, return up to one card of that type from your graveyard to the battlefield',
    "for each permanent type, return up to one card of that type from an opponent's graveyard to the battlefield",
    'for each permanent type, return up to one card of that type from your graveyard to the battlefield tapped',
    'for each permanent type, return up to one card of that type from your graveyard to the battlefield under your control',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.return-one-per-permanent-type';
    const r = spanned(
      pattern(
        /for each permanent type, return up to one card of that type from your graveyard to the battlefield(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return fail(ctx, pos);
    return {
      ok: true,
      value: [makeClause(id, 'returnOnePerPermanentType', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.return-it-face-down-forest-land`: "return it to the battlefield face down under its owner's control. It's a Forest land" (Yedora, Grave Gardener; CR 708.2, 708.3, 613.2b,
 * 110.2: the card is put onto the battlefield face down, with the characteristics of a land with the Forest subtype and no other, under its owner's control). Two sentences that
 * `splitSentences` keeps together. The engine's `moveToZone` of the card the creature became (`triggerCard`) with `faceDownAs`. Not read: another land type, another type, "under
 * your control", the first sentence alone.
 */
export const EFFECT_RETURN_IT_FACE_DOWN_FOREST_LAND = defineRule<Clauses>({
  id: 'effect.return-it-face-down-forest-land',
  family: 'effect',
  leading: ['return'],
  cites: [
    'CR 708.2 (Face-Down Spells and Permanents)',
    'CR 708.3 (Face-Down Spells and Permanents)',
    'CR 613.2b (Interaction of Continuous Effects)',
    'CR 110.2 (Permanents)',
  ],
  examples: [
    "return it to the battlefield face down under its owner's control. It's a Forest land",
    'return it to the battlefield face down under its owner’s control. It’s a Forest land',
  ],
  rejects: [
    "return it to the battlefield face down under its owner's control",
    "return it to the battlefield face down under its owner's control. It's a Mountain land",
    "return it to the battlefield face down under your control. It's a Forest land",
    "return it to the battlefield under its owner's control. It's a Forest land",
    "return it to the battlefield face down under its owner's control. It's a Forest creature",
    "return that card to the battlefield face down under its owner's control. It's a Forest land",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.return-it-face-down-forest-land';
    const r = spanned(
      pattern(
        /return it to the battlefield face down under its owner['’]s control\. It['’]s a Forest land(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return fail(ctx, pos);
    return {
      ok: true,
      value: [makeClause(id, 'returnFaceDownForestLand', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

export const WITHERBLOOM_C_EFFECT_RULES = [EFFECT_RETURN_ONE_PER_PERMANENT_TYPE].map(quietly);

/** Before `effect.return`, whose phrase ("return it to the battlefield ...") is a prefix of this one. */
export const WITHERBLOOM_C_EARLY_EFFECT_RULES = [EFFECT_RETURN_IT_FACE_DOWN_FOREST_LAND].map(
  quietly,
);
