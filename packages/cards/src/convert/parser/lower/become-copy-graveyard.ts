/**
 * Lowering of "~ becomes a copy of target creature card in your graveyard with mana value X, except its name is ~, it's legendary in addition to its other types, and it has this
 * ability" (Lazav, the Multifarious; Revenant Recon deck): the engine's `becomeCopy` of this permanent, of the target card, with no end, keeping its name, legendary, and with
 * the ability that is resolving.
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure, operand } from './clauses';
import { objectRefOf } from './nouns';
import type { Lowering } from './types';

const BECOME_COPY_FROM_GRAVEYARD: Lowering<IrClause, Effects> = {
  head: 'becomeCopyFromGraveyard',
  id: 'lower.become-copy-from-graveyard',
  needs: [
    'effect:becomeCopy',
    'selector:target',
    'selector:this',
    'ability:becomeCopyWithThisAbility',
  ],
  lower: (clause, ctx) => {
    const objects = operand(clause, 'objects');
    const of = operand(clause, 'of');
    if (
      objects === undefined ||
      of === undefined ||
      of.kind !== 'noun' ||
      objects.kind !== 'noun' ||
      objects.det !== 'self' ||
      of.det !== 'target' ||
      clause.args.keepName?.kind !== 'flag' ||
      clause.args.addLegendary?.kind !== 'flag' ||
      clause.args.withThisAbility?.kind !== 'flag' ||
      clause.duration !== undefined
    ) {
      return failure(clause);
    }
    const source = objectRefOf(of, ctx);
    if (!source.ok) return source;
    return {
      ok: true,
      value: [
        {
          kind: 'becomeCopy',
          objects: { kind: 'this' },
          of: source.value,
          duration: 'permanent',
          keepName: true,
          addSupertypes: ['legendary'],
          withThisAbility: true,
        },
      ],
      rule: clause.rule,
    };
  },
};

export const BECOME_COPY_GRAVEYARD_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  BECOME_COPY_FROM_GRAVEYARD,
];
