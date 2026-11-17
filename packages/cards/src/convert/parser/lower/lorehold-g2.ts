/**
 * Lowerings of group 2 of the Lorehold Spirit deck (issue 86): the permission to cast a card exiled with this permanent without paying its mana cost.
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, eachObject, failure, operand } from './clauses';
import type { Lowering } from './types';

/**
 * "Choose target card exiled with ~. You may cast that card this turn without paying its mana cost. If that spell would be put into a graveyard, put it on the bottom of its owner's library
 * instead." (CR 607.2a, 601.2, 118.9, 614.1a, 611.2a): the engine's `mayCast` of the target card in exile, until end of turn, `free`, with `bottomInstead` when the third sentence is there.
 * The card is a target of the ability (the target slot, `exiledWithSource`, is declared by the noun); the engine checks, as the ability resolves, that it is still exiled with the permanent.
 */
const MAY_CAST_EXILED: Lowering<IrClause, Effects> = {
  head: 'mayCastExiled',
  id: 'lower.may-cast-exiled',
  needs: ['effect:mayCast', 'selector:target', 'duration:untilEndOfTurn'],
  lower(clause, ctx) {
    const objects = operand(clause, 'objects');
    if (objects?.kind !== 'noun' || objects.det !== 'target') return failure(clause);
    const bottom = arg(clause, 'bottomInstead');
    if (bottom?.kind !== 'flag') return failure(clause);
    return eachObject(clause, ctx, (selected) => ({
      kind: 'mayCast',
      objects: selected,
      duration: 'untilEndOfTurn',
      from: 'exile',
      free: true,
      ...(bottom.value ? { bottomInstead: true as const } : {}),
    }));
  },
};

export const LOREHOLD_G2_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [MAY_CAST_EXILED];
