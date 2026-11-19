/**
 * Clause lowerings of the Jeskai free-cast cards (deck support issue 100). Same contract as effects.ts: each declares the engine features it needs and is checked before it runs.
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, eachObject, failure } from './clauses';
import { playerSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * "Counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard, then you may cast it without paying its mana cost."
 * (CR 701.6a, 614.1a, 608.2g): the engine's `counter` with `exileInstead`, then the `castFree` of the card it exiled (`moved`, which is empty when the spell was not countered).
 */
export const COUNTER_EXILE_CAST: Lowering<IrClause, Effects> = {
  head: 'counterExileCast',
  id: 'lower.counter-exile-cast',
  needs: ['effect:counter', 'effect:castFree'],
  lower(clause, ctx) {
    const countered = eachObject(clause, ctx, (objects) => ({
      kind: 'counter',
      objects,
      exileInstead: true,
    }));
    if (!countered.ok) return countered;
    if (countered.value.length !== 1) return failure(clause);
    return {
      ok: true,
      value: [...countered.value, { kind: 'castFree', objects: { kind: 'moved' } }],
      rule: clause.rule,
    };
  },
};

/**
 * "If that permanent is destroyed this way, its controller exiles cards from the top of their library until they exile a nonland card, then they may cast that card without paying its
 * mana cost." (CR 701.8, 701.13, 608.2g, 118.9): a `conditional` on the `destroyed` count of the destroy before it, whose effects are the engine's `exileUntilFound` of the library of
 * the player who controlled the permanent, and the `castFree` of the nonland card exiled, by that player. Only straight after a destroy.
 */
export const DESTROYED_CONTROLLER_EXILE_CAST: Lowering<IrClause, Effects> = {
  head: 'destroyedControllerExileCast',
  id: 'lower.destroyed-controller-exile-cast',
  needs: [
    'effect:conditional',
    'condition:thisWayAtLeast',
    'effect:exileUntilFound',
    'effect:castFree',
    'selector:controllerOf',
  ],
  lower(clause, ctx) {
    const who = arg(clause, 'player');
    if (who?.kind !== 'noun' || ctx.lastEffectKind !== 'destroy') return failure(clause);
    const player = playerSelectorOf(who, ctx);
    if (!player.ok) return player;
    // "Its controller" is the controller of a target, as the permanent was as it was destroyed (CR 608.2h).
    if (player.value.kind !== 'controllerOf' || player.value.of.kind !== 'target') {
      return failure(clause);
    }
    const nonland = { notTypes: ['land' as const] };
    return {
      ok: true,
      value: [
        {
          kind: 'conditional',
          condition: { kind: 'thisWayAtLeast', what: 'destroyed', count: 1 },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'exileUntilFound', players: player.value, filter: nonland },
              {
                kind: 'castFree',
                objects: { kind: 'moved' },
                filter: nonland,
                player: player.value,
              },
            ],
          },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const JESKAI_CASTFREE_LOWERINGS = [COUNTER_EXILE_CAST, DESTROYED_CONTROLLER_EXILE_CAST];
