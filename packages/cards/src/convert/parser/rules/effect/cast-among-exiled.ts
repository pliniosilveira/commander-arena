/**
 * Effect rule of the Exit from Exile deck (Stolen Strategy): "Until end of turn, you may cast spells from among those exiled cards, and you may spend mana as though it were mana of any color
 * to cast those spells." (CR 601.2, 609.4b, 611.2a). Like `effect.may-play-any-color`, for the spells among the cards an earlier "exile" put in exile.
 */
import { pattern } from '../../combinators';
import type { IrDuration } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.cast-among-exiled-any-color';

/**
 * `effect.cast-among-exiled-any-color`: the engine's `mayPlay` with `castOnly` and `anyManaColor`, until the end of the turn. Not read: "play", another length, "mana of any type", another thing
 * said of the spells, a second instruction after it.
 */
export const EFFECT_CAST_AMONG_EXILED_ANY_COLOR = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['until'],
  cites: ['CR 601.2 (Casting Spells)', 'CR 609.4b (Effects)', 'CR 611.2a (Continuous Effects)'],
  examples: [
    'until end of turn, you may cast spells from among those exiled cards, and you may spend mana as though it were mana of any color to cast those spells',
  ],
  rejects: [
    'until end of turn, you may cast spells from among those exiled cards',
    'until the end of your next turn, you may cast spells from among those exiled cards, and you may spend mana as though it were mana of any color to cast those spells',
    'until end of turn, you may play spells from among those exiled cards, and you may spend mana as though it were mana of any color to cast those spells',
    'until end of turn, you may cast spells from among those exiled cards, and you may spend mana as though it were mana of any type to cast those spells',
    'until end of turn, you may cast spells from among those exiled cards, and you may spend mana as though it were mana of any color to cast those spells and draw a card',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `until end of turn, you may cast spells from among those exiled cards, and you may spend mana as though it were mana of any color to cast those spells${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const duration: IrDuration = { kind: 'duration', scope: 'untilEndOfTurn', span, rule: ID };
    return {
      ok: true,
      value: [
        {
          ...makeClause(
            ID,
            'mayPlay',
            { castOnly: flag(ID, true, span), anyManaColor: flag(ID, true, span) },
            span,
          ),
          duration,
        },
      ],
      pos: r.pos,
    };
  },
});

export const CAST_AMONG_EXILED_EFFECT_RULES = [EFFECT_CAST_AMONG_EXILED_ANY_COLOR];
