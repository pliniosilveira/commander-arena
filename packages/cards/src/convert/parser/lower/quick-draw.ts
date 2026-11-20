/**
 * Lowerings of the Quick Draw deck (issue 121): "exile an instant or sorcery card at random from your graveyard" and "copy each card exiled with ~ ... cast any number of the copies" (Arcane
 * Bombardment). The exile is linked to the permanent (CR 607.2a) so the copy reads what it exiled.
 */
import type { CardType, ObjectFilter } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects } from './clauses';
import type { Lowering } from './types';

const EXILE_AT_RANDOM: Lowering<IrClause, Effects> = {
  head: 'exileAtRandom',
  id: 'lower.exile-at-random',
  needs: ['effect:exile'],
  lower(clause) {
    const types = arg(clause, 'types');
    if (types?.kind !== 'typeList' || types.cardTypes === undefined) {
      return { ok: false, needs: [], at: clause.span, rule: clause.rule };
    }
    const cardTypes = types.cardTypes as readonly CardType[];
    const filter: ObjectFilter = {
      zone: 'graveyard',
      controller: 'you',
      ...(cardTypes.length === 1
        ? { types: [...cardTypes] }
        : { anyOf: cardTypes.map((t) => ({ types: [t] })) }),
    };
    return {
      ok: true,
      value: [{ kind: 'exile', objects: { kind: 'each', filter }, atRandom: true, linked: true }],
      rule: clause.rule,
    };
  },
};

const COPY_LINKED_EXILED_AND_CAST: Lowering<IrClause, Effects> = {
  head: 'copyLinkedExiledAndCast',
  id: 'lower.copy-linked-exiled-and-cast',
  needs: ['effect:copyCardAndCast', 'selector:exiledWithSource'],
  lower(clause) {
    return {
      ok: true,
      value: [{ kind: 'copyCardAndCast', objects: { kind: 'linkedExile' } }],
      rule: clause.rule,
    };
  },
};

export const QUICK_DRAW_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXILE_AT_RANDOM,
  COPY_LINKED_EXILED_AND_CAST,
];
