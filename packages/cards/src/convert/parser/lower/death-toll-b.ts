/**
 * Lowerings of the Death Toll deck, group B: the instructions that pick cards of your graveyard at random (CR 608.2c, 400.7). Same contract as effects.ts: each declares the engine
 * features it needs and is checked before it runs.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { withoutZone } from '../rules/noun/phrases';
import { amountArg, arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { LowerContext, Lowering } from './types';

type RandomPick = Extract<Effect, { kind: 'chooseRandomFromGraveyard' }>;

/** The engine's `chooseRandomFromGraveyard` of the clause: how many cards, of which kind of card. */
function randomPick(clause: IrClause, ctx: LowerContext) {
  const card = arg(clause, 'card');
  if (card?.kind !== 'noun') return failure(clause);
  const filter = lowerFilter({ ...card, filter: withoutZone(card.filter) });
  if (!filter.ok) return filter;
  const count = amountArg(clause, 'count', ctx);
  if (!count.ok) return count;
  if (typeof count.value !== 'number') return failure(clause);
  const pick: RandomPick = {
    kind: 'chooseRandomFromGraveyard',
    count: count.value,
    ...(Object.keys(filter.value).length === 0 ? {} : { filter: filter.value }),
  };
  return { ok: true as const, value: pick };
}

/**
 * "Choose a card at random in your graveyard." (CR 608.2c, 400.7): the engine's `chooseRandomFromGraveyard`. Nothing moves; the card is `moved` for the sentences after it ("If it's a
 * creature card, put it onto the battlefield. Otherwise, put it into your hand.").
 */
const CHOOSE_RANDOM_GRAVEYARD_CARD: Lowering<IrClause, Effects> = {
  head: 'chooseRandomGraveyardCard',
  id: 'lower.choose-random-graveyard-card',
  needs: ['effect:chooseRandomFromGraveyard'],
  lower(clause, ctx) {
    const pick = randomPick(clause, ctx);
    if (!pick.ok) return pick;
    return { ok: true, value: [pick.value], rule: clause.rule };
  },
};

/**
 * "Return two creature cards at random from your graveyard to the battlefield." (CR 608.2c, 400.7, 110.2a): the engine's `chooseRandomFromGraveyard` and a move of the cards it picked
 * (`moved`) onto the battlefield under the control of the player who returns them.
 */
const RETURN_RANDOM_GRAVEYARD_CARDS: Lowering<IrClause, Effects> = {
  head: 'returnRandomGraveyardCards',
  id: 'lower.return-random-graveyard-cards',
  needs: ['effect:chooseRandomFromGraveyard', 'effect:moveToZone', 'selector:moved'],
  lower(clause, ctx) {
    const pick = randomPick(clause, ctx);
    if (!pick.ok) return pick;
    return {
      ok: true,
      value: [
        pick.value,
        { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'battlefield', controller: 'you' },
      ],
      rule: clause.rule,
    };
  },
};

export const DEATH_TOLL_B_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  CHOOSE_RANDOM_GRAVEYARD_CARD,
  RETURN_RANDOM_GRAVEYARD_CARDS,
];
