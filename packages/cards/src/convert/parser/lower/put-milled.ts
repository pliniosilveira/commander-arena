/**
 * "You may put an instant or sorcery card milled this way into your hand." (Leyline Dowser, CR 701.17a, 400.7j, 608.2c): after a mill, the card it moved, when it has one of the card types,
 * goes to the controller's hand if they choose: `conditional` over `objectMatches` of `moved`, `may` of `moveToZone` of `moved`. Refused after any instruction but a mill.
 */
import type { CardType, ObjectFilter } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects } from './clauses';
import type { Lowering } from './types';

const PUT_MILLED_INTO_HAND: Lowering<IrClause, Effects> = {
  head: 'putMilledIntoHand',
  id: 'lower.put-milled-into-hand',
  needs: [
    'effect:conditional',
    'effect:may',
    'effect:moveToZone',
    'condition:objectMatches',
    'selector:moved',
  ],
  lower(clause, ctx) {
    const types = arg(clause, 'types');
    if (
      ctx.lastEffectKind !== 'mill' ||
      types?.kind !== 'typeList' ||
      types.cardTypes === undefined
    ) {
      return { ok: false, needs: [], at: clause.span, rule: clause.rule };
    }
    const cardTypes = types.cardTypes as readonly CardType[];
    const filter: ObjectFilter =
      cardTypes.length === 1
        ? { types: [...cardTypes] }
        : { anyOf: cardTypes.map((t) => ({ types: [t] })) };
    return {
      ok: true,
      value: [
        {
          kind: 'conditional',
          condition: { kind: 'objectMatches', of: { kind: 'moved' }, filter },
          effect: {
            kind: 'may',
            effect: { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'hand' },
          },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const PUT_MILLED_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [PUT_MILLED_INTO_HAND];
