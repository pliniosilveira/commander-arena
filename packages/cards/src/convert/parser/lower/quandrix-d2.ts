/**
 * Lowerings of the Quandrix Unlimited deck, group D2: the instructions that reveal as many cards as an X says and put the cards of one kind onto the battlefield tapped, the rest on the
 * bottom of the library in a random order. Same contract as effects.ts: each declares the engine features it needs and is checked before it runs.
 */
import type { IrClause } from '../ir/types';
import { withoutZone } from '../rules/noun/phrases';
import { amountArg, arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

/**
 * "Reveal cards from the top of your library until you reveal X land cards. Put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random
 * order." (CR 701.20, 401.4, 107.3a): the engine's `revealUntil` with a `count` (the X) that puts the cards found onto the battlefield tapped.
 */
const REVEAL_UNTIL_X: Lowering<IrClause, Effects> = {
  head: 'revealUntilX',
  id: 'lower.reveal-until-x',
  needs: ['effect:revealUntil', 'ability:revealUntilCount', 'amount:x'],
  lower(clause, ctx) {
    const card = arg(clause, 'card');
    if (card?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter({ ...card, filter: withoutZone(card.filter) });
    if (!filter.ok) return filter;
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return {
      ok: true,
      value: [
        {
          kind: 'revealUntil',
          filter: filter.value,
          count: count.value,
          put: 'battlefield',
          tapped: true,
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Reveal the top X cards of your library. Put all land cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order." (CR 701.20,
 * 401.4, 107.3a): the engine's `lookAtTop` of a reveal (`revealAll`) that takes every card of the kind (`take.all`) onto the battlefield tapped. The cards put are `moved`.
 */
const REVEAL_TOP_PUT_ALL: Lowering<IrClause, Effects> = {
  head: 'revealTopPutAll',
  id: 'lower.reveal-top-put-all',
  needs: ['effect:lookAtTop', 'ability:lookTakeAll', 'amount:x'],
  lower(clause, ctx) {
    const card = arg(clause, 'card');
    if (card?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter({ ...card, filter: withoutZone(card.filter) });
    if (!filter.ok) return filter;
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          revealAll: true,
          take: { filter: filter.value, max: 1, to: 'battlefield', tapped: true, all: true },
          rest: 'bottomRandom',
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Untap those lands." (CR 701.26a, 608.2c): the lands the instruction before it put onto the battlefield (`moved`), which only a reveal of the top that put cards there names; after any
 * other instruction "those lands" has no group and the clause is refused.
 */
const UNTAP_MOVED: Lowering<IrClause, Effects> = {
  head: 'untapMoved',
  id: 'lower.untap-moved',
  needs: ['effect:untap', 'selector:moved'],
  lower(clause, ctx) {
    if (ctx.lastEffectKind !== 'lookAtTop') return failure(clause);
    return { ok: true, value: [{ kind: 'untap', objects: { kind: 'moved' } }], rule: clause.rule };
  },
};

export const QUANDRIX_D2_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  REVEAL_UNTIL_X,
  REVEAL_TOP_PUT_ALL,
  UNTAP_MOVED,
];
