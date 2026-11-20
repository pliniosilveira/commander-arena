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

/**
 * "Exile up to that many target instant and/or sorcery cards with mana value 3 or less from your graveyard and copy them. You may cast any number of the copies" (Bloodthirsty Adversary): the
 * slot of the reflexive ability of a payment, up to as many targets as were paid (`upToTriggerAmount`), then `exile` of them and `copyCardAndCast` of the cards exiled.
 */
const EXILE_THAT_MANY_AND_COPY: Lowering<IrClause, Effects> = {
  head: 'exileThatManyAndCopy',
  id: 'lower.exile-that-many-and-copy',
  needs: [
    'effect:exile',
    'effect:copyCardAndCast',
    'selector:moved',
    'selector:target',
    'selector:upToTriggerAmount',
  ],
  lower(clause, ctx) {
    const limit = arg(clause, 'manaValue');
    // The slot belongs to the reflexive ability of a payment, which is lowered with the sentences (`lowerPayAnyAmount`), and to nothing else.
    if (limit?.kind !== 'number' || !ctx.payReflexive) {
      return { ok: false, needs: [], at: clause.span, rule: clause.rule };
    }
    const id = `t${ctx.targets.length + 1}`;
    ctx.targets.push({
      id,
      what: {
        kind: 'object',
        filter: {
          zone: 'graveyard',
          controller: 'you',
          anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
          manaValue: { cmp: 'atMost', value: limit.value },
        },
      },
      upToTriggerAmount: true,
    });
    return {
      ok: true,
      value: [
        { kind: 'exile', objects: { kind: 'target', id } },
        { kind: 'copyCardAndCast', objects: { kind: 'moved' } },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * Finale of Promise (issue 121): two slots of up to one card each in the graveyard of the controller, an instant and a sorcery, each with a mana value no more than the X of the spell; a free cast
 * of each (`castCard` with `free`, the spell exiled in place of a graveyard) and, when X is 10 or more, two copies of each spell cast. The spell announces an X (`usesX`).
 */
const CAST_INSTANT_AND_SORCERY_FROM_GRAVEYARD_X: Lowering<IrClause, Effects> = {
  head: 'castInstantAndSorceryFromGraveyardX',
  id: 'lower.cast-instant-and-sorcery-from-graveyard-x',
  acceptsOptional: true,
  needs: [
    'effect:castCard',
    'effect:copySpell',
    'effect:conditional',
    'condition:xAtLeast',
    'selector:target',
    'selector:moved',
    'amount:x',
  ],
  lower(clause, ctx) {
    if (ctx.owner !== 'spell') return { ok: false, needs: [], at: clause.span, rule: clause.rule };
    const slot = (type: 'instant' | 'sorcery', n: number) => ({
      id: `t${ctx.targets.length + n}`,
      what: {
        kind: 'object' as const,
        filter: {
          zone: 'graveyard' as const,
          controller: 'you' as const,
          types: [type],
          manaValueAtMost: { kind: 'x' as const },
        },
      },
      min: 0,
      max: 1,
    });
    const instant = slot('instant', 1);
    const sorcery = slot('sorcery', 2);
    ctx.targets.push(instant, sorcery);
    ctx.usesX = true;
    const cast = (id: string) => ({
      kind: 'castCard' as const,
      object: { kind: 'target' as const, id },
      free: true as const,
      exileInstead: true as const,
      remember: true as const,
    });
    return {
      ok: true,
      value: [
        cast(instant.id),
        cast(sorcery.id),
        {
          kind: 'conditional',
          condition: { kind: 'xAtLeast', value: 10 },
          effect: {
            kind: 'copySpell',
            spell: { kind: 'moved' },
            newTargets: 'may',
            count: 2,
          },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const QUICK_DRAW_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  CAST_INSTANT_AND_SORCERY_FROM_GRAVEYARD_X,
  EXILE_THAT_MANY_AND_COPY,
  EXILE_AT_RANDOM,
  COPY_LINKED_EXILED_AND_CAST,
];
