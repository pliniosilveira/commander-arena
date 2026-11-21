/**
 * Lowering of the gravecast group of the Dance of the Elements deck (Horde of Notions): "You may play target Elemental card from your graveyard without paying its mana cost."
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, eachObject, failure, operand } from './clauses';
import type { Lowering } from './types';

/**
 * "(You may) play target Elemental card from your graveyard without paying its mana cost" (CR 608.2g, 118.9, 305.1): the engine's `castFree` of the target card with `play`. The
 * effect asks the controller whether to cast or play the card itself (`acceptsOptional`), so the sentence's "you may" is that question and is not a `may` of its own; without
 * "you may" the play would be mandatory, which is not lowered.
 */
export const PLAY_TARGET_GRAVEYARD_CARD_FREE: Lowering<IrClause, Effects> = {
  head: 'castFreeTarget',
  id: 'lower.play-target-graveyard-card-free',
  needs: ['effect:castFree', 'selector:target'],
  acceptsOptional: true,
  lower(clause, ctx) {
    const objects = operand(clause, 'objects');
    const may = arg(clause, 'may');
    if (objects?.kind !== 'noun' || objects.det !== 'target' || may?.kind !== 'flag') {
      return failure(clause);
    }
    if (!may.value && !clause.optional) return failure(clause);
    return eachObject(clause, ctx, (selected) => ({
      kind: 'castFree',
      objects: selected as Extract<typeof selected, { kind: 'target' }>,
      play: true,
    }));
  },
};

export const GRAVECAST_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  PLAY_TARGET_GRAVEYARD_CARD_FREE,
];
