/**
 * Effect rule of the Hosts of Mordor deck (Lidless Gaze): "Until the end of your next turn, you may play those cards, and mana of any type can be spent to cast those spells." (CR 601.2,
 * 305.1, 609.4b, 611.2a): the controller may play the cards the instruction before it exiled until the end of their next turn, and any mana pays for the spells they cast that way. The
 * engine's `mayPlay` with `anyManaType` (and no `castOnly`: a land card among them is played).
 */
import { pattern } from '../../combinators';
import type { IrDuration } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.may-play-any-type';

/**
 * `effect.may-play-any-type`: "until the end of your next turn, you may play those cards, and mana of any type can be spent to cast those spells" (CR 601.2, 305.1, 609.4b, 611.2a). The
 * cards are the ones of the "exile" before it, which the lowering requires. Not read: another length ("this turn": a card exiled that way would be playable in the same turn only; no such
 * card is built), "cast" (the permission to cast only is `effect.may-cast-any-type`), a single card ("that card"), "mana of any color", a trailing instruction.
 */
export const EFFECT_MAY_PLAY_ANY_TYPE = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 601.2 (Casting Spells)',
    'CR 305.1 (Lands)',
    'CR 609.4b (Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'until the end of your next turn, you may play those cards, and mana of any type can be spent to cast those spells',
  ],
  rejects: [
    'until the end of your next turn, you may play those cards',
    'until the end of your next turn, you may play those cards, and mana of any color can be spent to cast those spells',
    'until the end of your next turn, you may play that card, and mana of any type can be spent to cast that spell',
    'until the end of your next turn, you may cast those cards, and mana of any type can be spent to cast those spells',
    'until end of turn, you may play those cards, and mana of any type can be spent to cast those spells',
    'until the end of your next turn, you may play those cards, and mana of any type can be spent to cast those spells and draw a card',
    'you may play those cards, and mana of any type can be spent to cast those spells',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `until the end of your next turn, you may play those cards, and mana of any type can be spent to cast those spells${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const duration: IrDuration = {
      kind: 'duration',
      scope: 'untilEndOfNextTurn',
      span,
      rule: ID,
    };
    return {
      ok: true,
      value: [
        {
          ...makeClause(ID, 'mayPlay', { anyManaType: flag(ID, true, span) }, span),
          duration,
        },
      ],
      pos: r.pos,
    };
  },
});

export const MAY_PLAY_ANY_TYPE_EFFECT_RULES = [quietly(EFFECT_MAY_PLAY_ANY_TYPE)];
