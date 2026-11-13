/**
 * Lowering of group 3-c of the Niv-Mizzet deck (issue 25, D-990 to D-994): "you may cast target instant or sorcery card from a graveyard, and mana of any type can be
 * spent to cast that spell. If that spell would be put into a graveyard, exile it instead".
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, eachObject, failure, operand } from './clauses';
import type { Lowering } from './types';

/**
 * "You may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile
 * it instead" (CR 608.2g, 609.4b, 614.1a): the engine's `castCard` on the target card (a target of the text, in a graveyard of any player, which `lowerFilter` says), with
 * the two riders as the flags the words carry. The engine's effect asks the controller whether to cast the card, so the sentence's "you may" is that question and is not a
 * `may` of its own (`acceptsOptional`); a cast without "you may" would be mandatory, which the engine does not run, so it is not lowered.
 */
export const CAST_CARD: Lowering<IrClause, Effects> = {
  head: 'castCard',
  id: 'lower.cast-card',
  needs: ['effect:castCard', 'selector:target'],
  acceptsOptional: true,
  lower(clause, ctx) {
    const objects = operand(clause, 'objects');
    const may = arg(clause, 'may');
    const anyType = arg(clause, 'anyManaType');
    const exile = arg(clause, 'exileInstead');
    if (
      objects?.kind !== 'noun' ||
      objects.det !== 'target' ||
      may?.kind !== 'flag' ||
      anyType?.kind !== 'flag' ||
      exile?.kind !== 'flag'
    ) {
      return failure(clause);
    }
    if (!may.value && !clause.optional) return failure(clause);
    return eachObject(clause, ctx, (selected) => ({
      kind: 'castCard',
      object: selected as Extract<typeof selected, { kind: 'target' }>,
      ...(anyType.value ? { anyManaType: true as const } : {}),
      ...(exile.value ? { exileInstead: true as const } : {}),
    }));
  },
};

export const NIV_GROUP_3_C_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [CAST_CARD];
