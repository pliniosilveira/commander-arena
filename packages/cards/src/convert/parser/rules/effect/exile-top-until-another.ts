/**
 * Effect rule of the Limit Break deck (Furious Rise): "Exile the top card of your library. You may play that card until you exile another card with ~."
 */
import { pattern } from '../../combinators';
import type { IrDuration } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { flag, number } from './dragons';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.exile-top-play-until-another`: "exile the top card of your library. You may play that card until you exile another card with ~" (CR 701.13, 607.2a, 611.2a): the controller exiles
 * the top card, which the permanent remembers as exiled with it (a linked ability), and may play it for as long as it stays in exile and the permanent has not exiled another card with
 * that ability. Two sentences that `splitSentences` keeps together; the engine's `exileTop` with `linked`, then `mayPlay` that lasts `untilSourceExilesAnother`. Not read: more than one card, a
 * duration of another kind, "cast", "this enchantment" is the card itself (`~`) and nothing else.
 */
export const EFFECT_EXILE_TOP_PLAY_UNTIL_ANOTHER = defineRule<Clauses>({
  id: 'effect.exile-top-play-until-another',
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 701.13 (Exile)',
    'CR 607.2a (Linked Abilities)',
    'CR 611.2a (Continuous Effects)',
    'CR 305.1 (Lands)',
  ],
  examples: [
    'exile the top card of your library. You may play that card until you exile another card with ~',
  ],
  rejects: [
    'exile the top card of your library. You may play that card until you exile another card with ~.',
    'exile the top card of your library. You may play that card until you exile another card',
    'exile the top two cards of your library. You may play those cards until you exile another card with ~',
    'exile the top card of your library. You may cast that card until you exile another card with ~',
    'exile the top card of your library. You may play that card until end of turn',
    'exile the top card of your library. You may play that card until you exile another card with target creature',
    'exile the top card of target player’s library. You may play that card until you exile another card with ~',
    'exile the top card of your library. You may play that card until you exile another card with ~ and draw a card',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-top-play-until-another';
    const r = pattern(
      /exile the top card of your library\. you may play that card until you exile another card with ~(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const duration: IrDuration = {
      kind: 'duration',
      scope: 'untilYouExileAnotherWithSelf',
      span,
      rule: id,
    };
    return {
      ok: true,
      value: [
        makeClause(id, 'exileTop', { count: number(1, span), linked: flag(id, true, span) }, span),
        { ...makeClause(id, 'mayPlay', {}, span), duration },
      ],
      pos: r.pos,
    };
  },
});

export const EXILE_TOP_UNTIL_ANOTHER_EFFECT_RULES = [EFFECT_EXILE_TOP_PLAY_UNTIL_ANOTHER].map(
  quietly,
);
