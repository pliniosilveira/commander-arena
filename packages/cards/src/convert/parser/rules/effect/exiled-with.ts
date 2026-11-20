/**
 * Effect rules of Valakut Exploration (the Tannuk landfall group): "exile the top card of your library. You may play that card for as long as it remains exiled." and "put them into their owner's graveyard" of its end step ability.
 */
import { pattern } from '../../combinators';
import type { IrDuration } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { BOUNDARY } from './dragons';
import { type Clauses, makeClause, single } from './operands';

/**
 * `effect.may-play-while-exiled`: "you may play that card for as long as it remains exiled", "you may play those cards for as long as they remain exiled" (CR 406.3, 601.2, 305.1, 611.2b):
 * the controller may cast the cards the instruction before it exiled, or play them as a land, for as long as they stay in exile (a card that leaves exile is a new object, CR 400.7).
 * The engine's `mayPlay` with `whileExiled` and no `lookAt`; the cards were exiled face up, which the lowering requires (a face-down card needs "look at and play",
 * `effect.may-look-and-play`). Not read: "look at", another length, "may cast", "may play" alone, a pronoun that does not agree with its verb, a trailing word.
 */
export const EFFECT_MAY_PLAY_WHILE_EXILED = defineRule<Clauses>({
  id: 'effect.may-play-while-exiled',
  family: 'effect',
  leading: ['you', 'play'],
  cites: [
    'CR 406.3 (Exile)',
    'CR 601.2 (Casting Spells)',
    'CR 305.1 (Lands)',
    'CR 611.2b (Continuous Effects)',
  ],
  examples: [
    'you may play that card for as long as it remains exiled',
    'you may play those cards for as long as they remain exiled',
    // The "you may" of a triggered ability's sentence is read before the clauses.
    'play that card for as long as it remains exiled',
  ],
  rejects: [
    'you may play that card',
    'you may play that card this turn',
    'you may play that card for as long as it remains exiled.',
    'you may play those cards for as long as they remains exiled',
    'you may play that card for as long as they remain exiled',
    'you may cast that card for as long as it remains exiled',
    'you may play target card for as long as it remains exiled',
    'you may look at and play that card for as long as it remains exiled',
    'you may play that card for as long as it remains exiled and draw a card',
    'you may play that card for as long as it remains exiled, then',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.may-play-while-exiled';
    const r = spanned(
      pattern(
        new RegExp(
          `(?:you may )?play (?:that card for as long as it remains|those cards for as long as they remain) exiled${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const duration: IrDuration = {
      kind: 'duration',
      scope: 'whileExiled',
      span: r.value.span,
      rule: id,
    };
    return {
      ok: true,
      value: [{ ...makeClause(id, 'mayPlay', {}, r.value.span), duration }],
      pos: r.pos,
    };
  },
});

/**
 * `effect.put-them-owners-graveyard`: "put them into their owner's graveyard" (CR 607.2a, 400.3, 701.13): the cards an intervening "if there are cards exiled with ~" counted go from exile to
 * their owners' graveyards. The engine's `moveToZone` of the `linkedExile` cards; the lowering reads "them" as those cards only after that condition, and refuses it anywhere else (the
 * pronoun would have no antecedent the engine could name). Not read: "it", a zone other than the graveyard, "their owners' graveyards", "your graveyard", a trailing word.
 */
export const EFFECT_PUT_THEM_OWNERS_GRAVEYARD = defineRule<Clauses>({
  id: 'effect.put-them-owners-graveyard',
  family: 'effect',
  leading: ['put'],
  cites: ['CR 607.2a (Linked Abilities)', 'CR 400.3 (General)'],
  examples: ["put them into their owner's graveyard", 'put them into their owner’s graveyard'],
  rejects: [
    "put it into its owner's graveyard",
    "put them into their owners' graveyards",
    'put them into your graveyard',
    "put them into their owner's hand",
    "put them into their owner's graveyard.",
    "put them into their owner's graveyard and draw a card",
    "put those cards into their owner's graveyard",
  ],
  parse: single(
    'effect.put-them-owners-graveyard',
    spanned(
      pattern(new RegExp(`put them into their owner['’]s graveyard${BOUNDARY}(?!['’])`, 'iu')),
    ),
    () => ({ verb: 'putExiledWithGraveyard', args: {} }),
  ),
});

export const EXILED_WITH_EFFECT_RULES = [
  EFFECT_MAY_PLAY_WHILE_EXILED,
  EFFECT_PUT_THEM_OWNERS_GRAVEYARD,
];
