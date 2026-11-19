/**
 * Lowerings of group 4 of the Troyan deck (issue 337): "reveal the top card of your library. You may cast it without paying its mana cost if it's a spell with lesser mana
 * value. If you don't cast it, put it into your hand." and "exile the top eight cards of your library. You may put a land card from among them onto the battlefield. Until end of
 * turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost."
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import type { FeatureRef } from './features';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

/**
 * The engine's `revealTopCast`. "Lesser mana value" is lesser than that of the spell that caused the ability to trigger (CR 202.3, 608.2h: as it last was on the stack once it
 * is gone), so the limit is the mana value of the `triggerSubject`; the engine's validation refuses it in an ability whose trigger names no spell, so a card with another trigger
 * is dropped as a whole, never half run.
 */
export const REVEAL_TOP_CAST: Lowering<IrClause, Effects> = {
  head: 'revealTopCast',
  id: 'lower.reveal-top-cast',
  needs: ['effect:revealTopCast', 'amount:manaValueOf', 'selector:triggerSubject'],
  lower: (clause) => ({
    ok: true,
    value: [
      {
        kind: 'revealTopCast',
        manaValueBelow: { kind: 'manaValueOf', of: { kind: 'triggerSubject' } },
      },
    ],
    rule: clause.rule,
  }),
};

/**
 * "Until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost" (CR 601.2, 118.9, 611.2a): the
 * engine's `mayCastEachType` of the cards the instruction before it exiled (`moved`). After any other instruction "the exiled cards" has nothing to mean and the clause is not
 * lowered.
 */
export const MAY_CAST_EACH_TYPE: Lowering<IrClause, Effects> = {
  head: 'mayCastEachType',
  id: 'lower.may-cast-each-type',
  needs: ['effect:mayCastEachType'],
  lower(clause, ctx) {
    if (ctx.exiled !== 'top') return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'mayCastEachType', objects: { kind: 'moved' }, lasts: 'endOfTurn' }],
      rule: clause.rule,
    };
  },
};

/**
 * "You may put a land card from among them onto the battlefield" (CR 608.2c, 608.2d, 110.2a): the engine's `moveToZone` onto the battlefield of a `choose` selector over the
 * cards in exile (`fromMoved`: only the cards the exile before it moved) and `optional` ("you may"). The player who puts it controls it.
 */
export const PUT_FROM_AMONG_EXILED: Lowering<IrClause, Effects> = {
  head: 'putFromAmongExiled',
  id: 'lower.put-from-among-exiled',
  needs: ['effect:moveToZone', 'selector:choose', 'ability:chooseAmongMoved'],
  acceptsOptional: true,
  lower(clause, ctx) {
    const objects = arg(clause, 'objects');
    // "Them" is the cards of the exile right before: after any other instruction it names something this lowering does not know (CR 608.2c).
    if (objects?.kind !== 'noun' || ctx.exiled !== 'top' || objects.count !== undefined) {
      return failure(clause);
    }
    const filter = lowerFilter(objects);
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: { ...filter.value, zone: 'exile', controller: 'you' },
            optional: true,
            fromMoved: true,
          },
          to: 'battlefield',
        },
      ],
      rule: clause.rule,
    };
  },
};

export const TROYAN_G4_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  REVEAL_TOP_CAST,
  MAY_CAST_EACH_TYPE,
  PUT_FROM_AMONG_EXILED,
];

/** Features the lowerings of this file can name, for the dimension test. */
export const TROYAN_G4_NEEDS: readonly FeatureRef[] = [
  'effect:revealTopCast',
  'amount:manaValueOf',
  'selector:triggerSubject',
  'effect:mayCastEachType',
  'effect:moveToZone',
  'selector:choose',
  'ability:chooseAmongMoved',
];
