/**
 * Lowering of the Jump Scare! deck's Disorienting Choice (CR 115.1, 608.2d, 101.4, 701.13, 701.23, 400.7): "For each opponent, choose up to one target artifact or enchantment that player
 * controls. For each permanent chosen this way, its controller may exile it. Then if one or more of the chosen permanents are still on the battlefield, you search your library for up to that
 * many land cards, put them onto the battlefield tapped, then shuffle." The engine's `controllersMayExile` of the slot `onePerOpponent`, then a `conditional` on `thisWayAtLeast`
 * `chosenStillOnBattlefield` of a `search` whose `maxAmount` is that many (the shuffle belongs to the search that happens). Same contract as effects.ts: it declares the engine features it needs.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { type Effects, failure, operand } from './clauses';
import { objectSelectorOf } from './nouns';
import type { Lowering } from './types';

const CHOOSE_TARGETS_CONTROLLERS_MAY_EXILE: Lowering<IrClause, Effects> = {
  head: 'chooseTargetsControllersMayExile',
  id: 'lower.choose-targets-controllers-may-exile',
  needs: [
    'effect:controllersMayExile',
    'effect:conditional',
    'effect:search',
    'condition:thisWayAtLeast',
    'amount:thisWay',
    'searchDestination:battlefield',
  ],
  lower(clause, ctx) {
    const noun = operand(clause, 'objects');
    if (noun?.kind !== 'noun' || noun.perOpponent !== true) return failure(clause);
    const slot = objectSelectorOf(noun, ctx, {});
    if (!slot.ok) return slot;
    if (slot.value.kind !== 'target') return failure(clause);
    const search: Effect = {
      kind: 'search',
      player: { kind: 'you' },
      filter: { types: ['land'] },
      max: 1,
      maxAmount: { kind: 'thisWay', what: 'chosenStillOnBattlefield' },
      destinations: [{ zone: 'battlefield', tapped: true, count: 'rest' }],
      reveal: false,
      shuffle: true,
    };
    return {
      ok: true,
      value: [
        { kind: 'controllersMayExile', objects: slot.value },
        {
          kind: 'conditional',
          condition: { kind: 'thisWayAtLeast', what: 'chosenStillOnBattlefield', count: 1 },
          effect: search,
        },
      ],
      rule: clause.rule,
    };
  },
};

export const CONTROLLERS_MAY_EXILE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  CHOOSE_TARGETS_CONTROLLERS_MAY_EXILE,
];
