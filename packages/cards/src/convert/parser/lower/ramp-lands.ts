/**
 * Lowerings of the Tannuk deck's land-ramp group (issue 347). Same contract as effects.ts: each declares the engine features it needs and is checked before it runs.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

/**
 * "Look at the top twenty cards of your library, put any number of land cards from among them onto the battlefield tapped, then shuffle." (CR 401.2, 110.2a, 701.24): the
 * engine's `lookAtTop` of N cards that takes up to N land cards onto the battlefield tapped, leaves the rest where they are, and then a `shuffle` of the library.
 */
const LOOK_PUT_LANDS: Lowering<IrClause, Effects> = {
  head: 'lookPutLands',
  id: 'lower.look-put-lands',
  needs: ['effect:lookAtTop', 'effect:shuffle'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    // The number of cards looked at is a whole number of 2 or more (the arg is `amount.number`): any number of them can be taken.
    if (typeof count.value !== 'number' || count.value < 2) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          take: {
            filter: { types: ['land'] },
            max: count.value,
            to: 'battlefield',
            tapped: true,
          },
          rest: 'top',
        },
        { kind: 'shuffle', player: { kind: 'you' } },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Lands you control enter tapped this turn." (CR 614.1c, 614.12, 611.2a): the engine's `permanentsEnterTapped` until end of turn, read as permanents enter, so the filter names
 * no zone.
 */
const LANDS_ENTER_TAPPED_THIS_TURN: Lowering<IrClause, Effects> = {
  head: 'landsEnterTappedThisTurn',
  id: 'lower.lands-enter-tapped-this-turn',
  needs: ['effect:permanentsEnterTapped', 'duration:untilEndOfTurn'],
  lower(clause) {
    const objects = arg(clause, 'objects');
    if (objects?.kind !== 'noun' || objects.det !== 'each') return failure(clause);
    const { zone, ...rest } = objects.filter;
    void zone;
    const permanents = lowerFilter({ ...objects, filter: rest });
    if (!permanents.ok) return permanents;
    const effect: Effect = {
      kind: 'permanentsEnterTapped',
      permanents: permanents.value,
      duration: 'untilEndOfTurn',
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const RAMP_LANDS_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  LOOK_PUT_LANDS,
  LANDS_ENTER_TAPPED_THIS_TURN,
];
