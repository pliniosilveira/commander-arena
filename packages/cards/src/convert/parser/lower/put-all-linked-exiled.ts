/**
 * Lowering of "Put all permanent cards exiled with ~ onto the battlefield, then sacrifice it." (Journey to the Lost City, CR 607.2a, 110.2a, 701.21a): a `moveToZone` onto the
 * battlefield of every permanent card in exile that the permanent exiled with its linked ability (`exiledWithSource`), then the engine's `sacrifice` of the permanent itself.
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

export const PUT_ALL_LINKED_EXILED_THEN_SACRIFICE: Lowering<IrClause, Effects> = {
  head: 'putAllLinkedExiledThenSacrifice',
  id: 'lower.put-all-linked-exiled-then-sacrifice',
  needs: ['effect:moveToZone', 'effect:sacrifice', 'selector:exiledWithSource'],
  lower: (clause) => ({
    ok: true,
    value: [
      {
        kind: 'moveToZone',
        objects: {
          kind: 'each',
          filter: {
            zone: 'exile',
            exiledWithSource: true,
            anyOf: [
              { types: ['artifact'] },
              { types: ['creature'] },
              { types: ['enchantment'] },
              { types: ['land'] },
              { types: ['planeswalker'] },
              { types: ['battle'] },
            ],
          },
        },
        to: 'battlefield',
      },
      { kind: 'sacrifice', objects: { kind: 'this' } },
    ],
    rule: clause.rule,
  }),
};

export const PUT_ALL_LINKED_EXILED_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  PUT_ALL_LINKED_EXILED_THEN_SACRIFICE,
];
