/**
 * Lowerings of group 1b of the Danitha deck (issue 26, D-1213 provisional): "Put it into your hand." of the card an earlier sentence chose as a target from your graveyard
 * (Cosmic Rebirth). "Put it onto the battlefield" of that card is `putMovedOntoBattlefield` of `hashaton-g9.ts`, which names the target as it names the moved card.
 */
import type { IrClause, IrNoun, IrNounList } from '../ir/types';
import { type Effects, failure, operand } from './clauses';
import type { LowerContext, Lowering } from './types';

/**
 * The slot id of the target card of a graveyard that the noun "it" names (the binding pass wrote the target's reference into it), or null. `own` asks for the graveyard of the
 * controller of the ability, as "your hand" does (CR 400.3: a card goes to its owner's hand, so a card of another graveyard would not go to "your" hand).
 */
export function graveyardCardTarget(
  what: IrNoun | IrNounList | undefined,
  ctx: LowerContext,
  own: boolean,
): string | null {
  if (what?.kind !== 'noun' || what.det !== 'anaphor' || what.ref === undefined) return null;
  const spec = ctx.targets.find((t) => t.id === what.ref);
  if (spec?.what.kind !== 'object') return null;
  const { filter } = spec.what;
  if (filter.zone !== 'graveyard') return null;
  if (own && filter.controller !== 'you') return null;
  return spec.id;
}

/**
 * "Put it into your hand" (CR 400.3, 608.2c): the engine's `moveToZone` to the hand of the card a target phrase of the text named, which is a card of the controller's own
 * graveyard (so the hand is also its owner's). "It" is any other object, or the clause is optional (the sentence's "you may" is no question the engine asks here): not lowered.
 */
const PUT_IT_INTO_HAND: Lowering<IrClause, Effects> = {
  head: 'putItIntoHand',
  id: 'lower.put-it-into-hand',
  needs: ['effect:moveToZone', 'selector:target'],
  lower(clause, ctx) {
    const id = graveyardCardTarget(operand(clause, 'objects'), ctx, true);
    if (id === null) return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'moveToZone', objects: { kind: 'target', id }, to: 'hand' }],
      rule: clause.rule,
    };
  },
};

export const DANITHA_G1B_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [PUT_IT_INTO_HAND];
