import type { IrClause } from '../ir/types';
import { type Effects, failure, operand } from './clauses';
import { lowerFilter, playerSelectorOf } from './nouns';
import type { Lowering } from './types';

export const GRAVEYARD_CHOICE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  {
    head: 'sacrificedReturnAnother',
    id: 'lower.sacrificed-return-another',
    needs: ['effect:moveToZone', 'effect:conditional', 'condition:thisWayAtLeast'],
    lower(clause) {
      const noun = operand(clause, 'objects');
      if (noun?.kind !== 'noun') return failure(clause);
      const filter = lowerFilter(noun);
      if (!filter.ok) return filter;
      const move = {
        kind: 'moveToZone' as const,
        objects: {
          kind: 'choose' as const,
          filter: filter.value,
          optional: true as const,
          exceptSacrificed: true as const,
        },
        to: 'hand' as const,
      };
      return {
        ok: true,
        value: [
          {
            kind: 'conditional',
            condition: { kind: 'thisWayAtLeast', what: 'sacrificedOwn', count: 1 },
            effect: move,
          },
        ],
        rule: clause.rule,
      };
    },
  },
  {
    head: 'removeAllPlayerCounters',
    id: 'lower.remove-all-player-counters',
    needs: ['effect:removeAllPlayerCounters'],
    lower(clause, ctx) {
      const noun = operand(clause, 'player');
      if (noun?.kind !== 'noun') return failure(clause);
      const player = playerSelectorOf(noun, ctx);
      if (!player.ok) return player;
      return {
        ok: true,
        value: [{ kind: 'removeAllPlayerCounters', player: player.value }],
        rule: clause.rule,
      };
    },
  },
];
