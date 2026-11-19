/**
 * Clause lowerings of "each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the
 * battlefield" (Living Death; CR 404.1, 608.2c, 400.7j, 110.2). Same contract as effects.ts: each declares the engine features it needs and is checked before it runs.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { LowerContext, Lowering } from './types';

/**
 * "Each player exiles all creature cards from their graveyard": the engine's `exile` of every card the filter names in every graveyard (each player's own cards are in their own
 * graveyard, so with each player named that is all of them). What it exiled is `moved` for the instructions after it, and `ctx.exiledOwnGraveyards` lets "puts all cards they exiled this
 * way onto the battlefield" say so.
 */
export const EXILE_OWN_GRAVEYARD_CARDS: Lowering<IrClause, Effects> = {
  head: 'exileOwnGraveyardCards',
  id: 'lower.exile-own-graveyard-cards',
  needs: ['effect:exile', 'selector:each'],
  lower(clause) {
    const who = arg(clause, 'player');
    const what = arg(clause, 'objects');
    if (who?.kind !== 'noun' || who.det !== 'eachPlayer' || what?.kind !== 'noun') {
      return failure(clause);
    }
    const filter = lowerFilter(what);
    if (!filter.ok) return filter;
    if (filter.value.zone !== 'graveyard' || filter.value.controller !== undefined) {
      return failure(clause);
    }
    return {
      ok: true,
      value: [{ kind: 'exile', objects: { kind: 'each', filter: filter.value } }],
      rule: clause.rule,
    };
  },
};

/**
 * "Each player puts all cards they exiled this way onto the battlefield": the engine's `moveToZone` of `moved` to the battlefield, each card under its owner's control, which is the
 * player who exiled it from their own graveyard (CR 110.2). Read only when the cards of the exile before it in the same text are what `moved` names (`ctx.exiledOwnGraveyards`); a
 * sacrifice between the two does not change what `moved` is, so a creature a replacement effect exiles instead of letting it die is not one of them.
 */
export const PUT_EXILED_CARDS_THIS_WAY: Lowering<IrClause, Effects> = {
  head: 'putExiledCardsThisWay',
  id: 'lower.put-exiled-cards-this-way',
  needs: ['effect:moveToZone', 'selector:moved'],
  lower(clause, ctx) {
    const who = arg(clause, 'player');
    if (who?.kind !== 'noun' || who.det !== 'eachPlayer' || !ctx.exiledOwnGraveyards) {
      return failure(clause);
    }
    return {
      ok: true,
      value: [
        { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'battlefield', controller: 'owner' },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * Whether the cards the last exile of "each player exiles all ... from their graveyard" exiled are still what `moved` names after this clause: true right after that exile, kept
 * through a sacrifice (which does not change `moved`), false after any other instruction that moves, destroys or exiles objects.
 */
export function noteExiledOwnGraveyards(
  clause: IrClause,
  effects: readonly Effect[],
  ctx: LowerContext,
): void {
  if (clause.verb === 'exileOwnGraveyardCards') {
    ctx.exiledOwnGraveyards = true;
    return;
  }
  if (effects.some((e) => ['moveToZone', 'destroy', 'exile'].includes(e.kind))) {
    ctx.exiledOwnGraveyards = false;
  }
}

export const EXILE_OWN_GRAVEYARD_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXILE_OWN_GRAVEYARD_CARDS,
  PUT_EXILED_CARDS_THIS_WAY,
];
