/**
 * The lowerings of `rules/effect/grand-larceny-b.ts` (the Grand Larceny deck, group B): a player exiles cards from their own library until one is found, the card exiled is cast for
 * free if it is not a land, the lands another player owns in exile are put onto the battlefield, and cards of a hand are chosen or looked at. The exile of the top cards is
 * `lower.exile-top` (`lower/dragons.ts`); the casts that follow are `lower.cast-from-among` and `lower.may-play`.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { withoutZone } from '../rules/noun/phrases';
import { amountArg, arg, type Effects, failure } from './clauses';
import { lowerFilter, playerSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * "Target opponent exiles cards from the top of their library until they exile a nonland card" (Stolen Goods; CR 701.13): the engine's `exileUntilFound` of the library of the one player the
 * ability targets. The cards exiled are what "that card" of the permission after it names (`lower.may-play`, which cares only for the cards of an exile).
 */
const PLAYER_EXILES_UNTIL: Lowering<IrClause, Effects> = {
  head: 'playerExilesUntil',
  id: 'lower.player-exiles-until',
  needs: ['effect:exileUntilFound', 'selector:target'],
  lower(clause, ctx) {
    const player = arg(clause, 'player');
    const card = arg(clause, 'card');
    if (player?.kind !== 'noun' || card?.kind !== 'noun') return failure(clause);
    if (player.det !== 'target' || player.anyNumber === true) return failure(clause);
    const from = playerSelectorOf(player, ctx);
    if (!from.ok) return from;
    const filter = lowerFilter({ ...card, filter: withoutZone(card.filter) });
    if (!filter.ok) return filter;
    ctx.exiled = 'cards';
    ctx.exiledFaceDown = false;
    ctx.exiledLookedAt = false;
    return {
      ok: true,
      value: [{ kind: 'exileUntilFound', players: from.value, filter: filter.value }],
      rule: clause.rule,
    };
  },
};

/**
 * "You may put any number of land cards that player owns from exile onto the battlefield under your control" (Oblivion Sower; CR 608.2d, 108.3, 110.2a): the engine's `moveToZone` of
 * a `choose` among the land cards in exile of the player the text named (`fromExileOf`), none, some or all, onto the battlefield under the controller's control.
 */
const PUT_OWNED_LANDS_FROM_EXILE: Lowering<IrClause, Effects> = {
  head: 'putOwnedLandsFromExile',
  id: 'lower.put-owned-lands-from-exile',
  needs: ['effect:moveToZone', 'ability:chooseFromExileOwnedBy'],
  lower(clause, ctx) {
    const owner = arg(clause, 'owner');
    if (owner?.kind !== 'noun') return failure(clause);
    const who = playerSelectorOf(owner, ctx);
    if (!who.ok) return who;
    const effect: Effect = {
      kind: 'moveToZone',
      objects: {
        kind: 'choose',
        filter: { zone: 'exile', types: ['land'], controller: 'you' },
        anyNumber: true,
        optional: true,
        fromExileOf: who.value,
      },
      to: 'battlefield',
      controller: 'you',
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/**
 * "Target opponent chooses X cards from their hand" and "look at that player's hand" (Extract Brain, Silent-Blade Oni; CR 608.2d, 402.3): the engine's `handCards` of the one player the
 * text names, with the number they choose or, without one, the whole hand. The cards stay in the hand and are what "those cards" of the cast after it names.
 */
const HAND_CARDS: Lowering<IrClause, Effects> = {
  head: 'handCards',
  id: 'lower.hand-cards',
  needs: ['effect:handCards'],
  lower(clause, ctx) {
    const player = arg(clause, 'player');
    if (player?.kind !== 'noun') return failure(clause);
    const who = playerSelectorOf(player, ctx);
    if (!who.ok) return who;
    if (arg(clause, 'count') === undefined) {
      return { ok: true, value: [{ kind: 'handCards', player: who.value }], rule: clause.rule };
    }
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return {
      ok: true,
      value: [{ kind: 'handCards', player: who.value, count: count.value }],
      rule: clause.rule,
    };
  },
};

/** "Look at those cards" (Extract Brain; CR 402.3): no instruction of its own, only after the player chose the cards; the cast after it shows the controller the cards. */
const LOOK_AT_THOSE_CARDS: Lowering<IrClause, Effects> = {
  head: 'lookAtThoseCards',
  id: 'lower.look-at-those-cards',
  needs: [],
  lower(clause, ctx) {
    if (ctx.lastEffectKind !== 'handCards') return failure(clause);
    return { ok: true, value: [], rule: clause.rule };
  },
};

export const GRAND_LARCENY_B_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  PLAYER_EXILES_UNTIL,
  PUT_OWNED_LANDS_FROM_EXILE,
  HAND_CARDS,
  LOOK_AT_THOSE_CARDS,
];
