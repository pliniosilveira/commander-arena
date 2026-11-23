/**
 * Effect rule of Locke, Treasure Hunter (issue 97): "Until end of turn, you may cast a spell from among those cards." after "each player mills a card". The duration is the
 * sentence's own, read before the clause; the lowering checks that a mill came before.
 */
import { fail, pattern } from '../../combinators';
import type { IrDuration } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.may-cast-one-from-among-those';

/**
 * `effect.may-cast-one-from-among-those`: "until end of turn, you may cast a spell from among those cards" (CR 601.2: casting a spell the effect allows; CR 608.2c: "those cards" are the cards the
 * instruction before it milled, 400.7j: as they are in the graveyard now). One spell for all the cards together, whoever owns them; the engine's `mayCastOneMilled`. Not read: "spells" (several), "a card", another set of cards ("from among the exiled cards", "from among them"), "without paying its mana cost", a second instruction joined
 * to it.
 */
export const EFFECT_MAY_CAST_ONE_FROM_AMONG_THOSE = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['until', 'you', 'cast'],
  cites: [
    'CR 601.2 (Casting Spells)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 611.2a (Continuous Effects)',
    'CR 701.17a (Mill)',
  ],
  examples: [
    'until end of turn, you may cast a spell from among those cards',
    'you may cast a spell from among those cards this turn',
  ],
  rejects: [
    'you may cast a spell from among those cards',
    'until end of turn, you may cast spells from among those cards',
    'until end of turn, you may cast a card from among those cards',
    'until end of turn, you may cast a spell from among them',
    'until end of turn, you may cast a spell from among the exiled cards',
    'until end of turn, you may cast a spell from among those cards without paying its mana cost',
    'until end of turn, you may cast a spell from among those cards and draw a card',
    'until end of turn, you may cast a spell from among those cards, then draw a card',
    'until your next turn, you may cast a spell from among those cards',
    'until end of turn, you may cast a spell from among those cards this turn',
  ],
  parse: (ctx, pos) => {
    const lead = spanned(pattern(/until end of turn, /iu))(ctx, pos);
    const ahead = lead.ok;
    const at = lead.ok ? lead.pos : pos;
    const body = pattern(
      new RegExp(
        `(?:you may )?cast a spell from among those cards( this turn)?${BOUNDARY}(?!,| and\\b| then\\b| without\\b)`,
        'iu',
      ),
    )(ctx, at);
    if (!body.ok) return body;
    // Exactly one length: said first or said last.
    if (ahead === (body.value[1] !== undefined)) return fail(ctx, pos);
    const whole = { start: pos, end: body.pos };
    const duration: IrDuration = {
      kind: 'duration',
      scope: 'untilEndOfTurn',
      span: lead.ok ? lead.value.span : whole,
      rule: ID,
    };
    return {
      ok: true,
      value: [{ ...makeClause(ID, 'mayCastOneMilled', {}, whole), duration }],
      pos: body.pos,
    };
  },
});

export const LOCKE_EFFECT_RULES = [EFFECT_MAY_CAST_ONE_FROM_AMONG_THOSE].map(quietly);
