/**
 * Lowerings of the Planeswalker Party deck (issue 132, Guff Rewrites History): the sentences that read the permanents a slot of a target for each player chose.
 */
import type { Effect, PlayerSelector } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { type Effects, failure, operand } from './clauses';
import { objectSelectorOf } from './nouns';
import type { Lowering } from './types';

const NOT_LAND = { notTypes: ['land' as const] };

/** "Those permanents' owners shuffle them into their libraries": every chosen permanent goes into its owner's library, and each owner shuffles. */
const OWNERS_SHUFFLE_THEM_IN: Lowering<IrClause, Effects> = {
  head: 'ownersShuffleThemIn',
  id: 'lower.owners-shuffle-them-in',
  needs: ['effect:moveToZone', 'effect:shuffle', 'selector:ownerOf'],
  lower(clause, ctx) {
    const named = operand(clause, 'objects');
    if (named?.kind !== 'noun') return failure(clause);
    const selector = objectSelectorOf(named, ctx);
    if (!selector.ok) return selector;
    if (selector.value.kind !== 'target') return failure(clause);
    const owners: PlayerSelector = { kind: 'ownerOf', of: selector.value };
    const effects: Effect[] = [
      { kind: 'moveToZone', objects: selector.value, to: 'library' },
      { kind: 'shuffle', player: owners },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

/** "Each player who controlled one of those permanents exiles cards ... until they exile a nonland card, then puts the rest on the bottom ... in a random order". */
const CONTROLLERS_EXILE_UNTIL_NONLAND: Lowering<IrClause, Effects> = {
  head: 'controllersExileUntilNonland',
  id: 'lower.controllers-exile-until-nonland',
  needs: ['effect:exileUntilFound', 'selector:controllerOf'],
  lower(clause, ctx) {
    const named = operand(clause, 'objects');
    if (named?.kind !== 'noun') return failure(clause);
    const selector = objectSelectorOf(named, ctx);
    if (!selector.ok) return selector;
    if (selector.value.kind !== 'target') return failure(clause);
    // CR 608.2h: the controllers are the ones the permanents last had, read from last-known information once they have gone into the libraries.
    const players: PlayerSelector = { kind: 'controllerOf', of: selector.value };
    const effect: Effect = {
      kind: 'exileUntilFound',
      players,
      filter: NOT_LAND,
      restToBottom: true,
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "Each player may cast the nonland card they exiled without paying its mana cost": only straight after the exile that found one card for each player. */
const EACH_OWNER_MAY_CAST_EXILED: Lowering<IrClause, Effects> = {
  head: 'eachOwnerMayCastExiled',
  id: 'lower.each-owner-may-cast-exiled',
  needs: ['effect:castFree', 'selector:moved'],
  lower(clause, ctx) {
    if (ctx.lastEffectKind !== 'exileUntilFound') return failure(clause);
    const effect: Effect = {
      kind: 'castFree',
      objects: { kind: 'moved' },
      perOwner: true,
      byOwner: true,
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const GUFF_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  OWNERS_SHUFFLE_THEM_IN,
  CONTROLLERS_EXILE_UNTIL_NONLAND,
  EACH_OWNER_MAY_CAST_EXILED,
];
