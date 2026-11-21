/**
 * Lowerings of the "choose a creature type" group. Same contract as effects.ts: each declares the engine features it needs and is checked before it runs.
 */
import type { IrClause } from '../ir/types';
import { withoutZone } from '../rules/noun/phrases';
import { amountArg, arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

/**
 * "Reveal cards from the top of your library until you reveal X creature cards of the chosen type, where X is the number of creatures you control of that type. Put those cards onto
 * the battlefield, then shuffle the rest of the revealed cards into your library." (CR 701.20, 701.24, 608.2d, 205.3m): the engine's `revealUntil` with a `count` whose filter reads
 * the type the `chooseCreatureType` before it chose as the spell resolves, the rest left in the library (`rest: 'stay'`) for the `shuffle`.
 */
const REVEAL_UNTIL_CHOSEN_TYPE: Lowering<IrClause, Effects> = {
  head: 'revealUntilChosenType',
  id: 'lower.reveal-until-chosen-type',
  needs: [
    'effect:revealUntil',
    'ability:revealUntilCount',
    'effect:shuffle',
    'effect:chooseCreatureType',
    'selector:chosenType',
  ],
  lower(clause, ctx) {
    // The chosen type is read from the choice made as this spell resolves, so the instruction right before must be that choice.
    if (ctx.lastEffectKind !== 'chooseCreatureType') return failure(clause);
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
          rest: 'stay',
        },
        { kind: 'shuffle', player: { kind: 'you' } },
      ],
      rule: clause.rule,
    };
  },
};

export const REVEAL_CHOSEN_TYPE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  REVEAL_UNTIL_CHOSEN_TYPE,
];
