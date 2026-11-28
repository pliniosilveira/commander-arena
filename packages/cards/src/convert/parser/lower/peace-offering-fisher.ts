/**
 * Lowering of the Peace Offering deck (issue 112), group F: Fisher's Talent's "Look at the top card of your library. You may reveal it if it's a land card. Create a 1/1 blue Fish
 * creature token if you revealed it this way." (CR 701.20a, 701.20b, 608.2c). Same contract as effects.ts: it declares the engine features it needs and is checked before it runs.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { LowerContext, Lowering, LowerResult } from './types';

/**
 * The engine's `lookAtTop` of the one top card of the controller's library, which may be revealed when the filter matches it and stays on top either way (`take.to` `reveal`,
 * `rest` `top`), then a `conditional` on `didPrevious` (the reveal is what was done) that creates the token for the controller.
 */
export function lookTopMayRevealCreateLowering(
  lowerToken: (clause: IrClause, ctx: LowerContext) => LowerResult<Effects>,
): Lowering<IrClause, Effects> {
  return {
    head: 'lookTopMayRevealCreate',
    id: 'lower.look-top-may-reveal-create',
    needs: [
      'effect:lookAtTop',
      'ability:lookTakeReveal',
      'effect:conditional',
      'condition:didPrevious',
      'effect:createToken',
    ],
    lower(clause, ctx) {
      const take = arg(clause, 'take');
      const token = arg(clause, 'token');
      if (take?.kind !== 'noun' || token?.kind !== 'token') return failure(clause);
      const filter = lowerFilter(take);
      if (!filter.ok) return filter;
      const made = lowerToken({ ...clause, verb: 'createToken', args: { token } }, ctx);
      if (!made.ok) return made;
      const [create, ...rest] = made.value;
      // The token goes to the player who revealed the card ("you"), never to a player the words name.
      if (create?.kind !== 'createToken' || rest.length > 0 || create.controller !== undefined) {
        return failure(clause);
      }
      const { zone, ...card } = filter.value;
      void zone;
      const effects: Effect[] = [
        {
          kind: 'lookAtTop',
          count: 1,
          take: { filter: card, max: 1, to: 'reveal' },
          rest: 'top',
        },
        { kind: 'conditional', condition: { kind: 'didPrevious' }, effect: create },
      ];
      return { ok: true, value: effects, rule: clause.rule };
    },
  };
}
