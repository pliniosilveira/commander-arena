/**
 * Lowering of "Look at the top four cards of your library. You may put a land card from among them onto the battlefield tapped. If you don't, put a card from among them into your
 * hand. Put the rest on the bottom of your library in a random order." (Planar Genesis, CR 608.2c, 608.2d): the engine's `lookAtTop` of the controller's own library, one card of
 * the kind at most put onto the battlefield tapped without being revealed, `take.elseAnyToHand` for the card of any kind that goes to the hand when none was taken, the rest on
 * the bottom in a random order. The kind describes a card in a library: no zone or controller.
 */
import type { IrClause } from '../ir/types';
import { withoutZone } from '../rules/noun/phrases';
import { amountArg, arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

const LOOK_TAKE_ELSE_HAND: Lowering<IrClause, Effects> = {
  head: 'lookTakeElseHand',
  id: 'lower.look-take-else-hand',
  needs: ['effect:lookAtTop'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    const take = arg(clause, 'take');
    if (take?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter(take);
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          take: {
            filter: filter.value,
            max: 1,
            to: 'battlefield',
            tapped: true,
            hidden: true,
            elseAnyToHand: true,
          },
          rest: 'bottomRandom',
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Reveal the top X cards of your library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield. Then shuffle the rest into your
 * library." (Genesis Hydra, CR 701.20a, 701.20b, 701.24): the engine's `lookAtTop` of a reveal (`revealAll`) taking one card of the kind onto the battlefield with a mana value of at
 * most the count; the cards not taken stay in the library (`rest: 'top'`) and the library is shuffled.
 */
const REVEAL_PUT_SHUFFLE: Lowering<IrClause, Effects> = {
  head: 'revealPutShuffle',
  id: 'lower.reveal-put-shuffle',
  needs: ['effect:lookAtTop', 'effect:shuffle'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    const card = arg(clause, 'card');
    if (card?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter({ ...card, filter: withoutZone(card.filter) });
    if (!filter.ok) return filter;
    // The limit is the X that is the count of cards (the same words), read as the effect resolves.
    if (typeof count.value === 'number') return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          revealAll: true,
          take: {
            filter: filter.value,
            max: 1,
            to: 'battlefield',
            manaValueAtMost: count.value,
          },
          rest: 'top',
        },
        { kind: 'shuffle', player: { kind: 'you' } },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Choose creature or land. Reveal the top four cards of your library. Put all cards of the chosen type revealed this way into your hand and the rest into your graveyard." (Winding
 * Way, CR 608.2d, 701.20a): the engine's `chooseOne` of the two types as the spell resolves, each option the `lookAtTop` of a reveal taking every card of that type into the hand,
 * the rest into the graveyard.
 */
const CHOOSE_REVEAL_PUT_ALL_HAND: Lowering<IrClause, Effects> = {
  head: 'chooseRevealPutAllHand',
  id: 'lower.choose-reveal-put-all-hand',
  needs: ['effect:chooseOne', 'effect:lookAtTop', 'ability:lookTakeAll'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return {
      ok: true,
      value: [
        {
          kind: 'chooseOne',
          options: (['creature', 'land'] as const).map((type) => ({
            label: type,
            effect: {
              kind: 'lookAtTop' as const,
              count: count.value,
              revealAll: true as const,
              take: { filter: { types: [type] }, max: 1, to: 'hand' as const, all: true as const },
              rest: 'graveyard' as const,
            },
          })),
        },
      ],
      rule: clause.rule,
    };
  },
};

export const LOOK_ELSE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  LOOK_TAKE_ELSE_HAND,
  REVEAL_PUT_SHUFFLE,
  CHOOSE_REVEAL_PUT_ALL_HAND,
];
