/**
 * Lowerings of group A of the Witherbloom Witchcraft deck (issue 190): Suffer the Past.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { missingFeatures } from './features';
import { lowerFilter, objectRefOf, playerSelectorOf } from './nouns';
import type { LowerContext, Lowering, LowerResult } from './types';

/**
 * "Exile X target cards from target player's graveyard" (CR 115.1, 601.2b-c, 404.1, 406.1): a player target, declared first, and a slot of cards (`countX`, as many as
 * the X announced; `ownedByTarget`: only cards of that player's graveyard), the engine's `exile` of those cards. Only a spell's own text announces an X before its targets
 * (the noun lowering refuses the slot anywhere else).
 */
const EXILE_GRAVEYARD_CARDS_OF_PLAYER: Lowering<IrClause, Effects> = {
  head: 'exileGraveyardCardsOfPlayer',
  id: 'lower.exile-graveyard-cards-of-player',
  needs: ['effect:exile', 'selector:target', 'selector:ownedByTarget', 'selector:countX'],
  lower(clause, ctx) {
    const who = arg(clause, 'player');
    const cards = arg(clause, 'cards');
    if (who?.kind !== 'noun' || cards?.kind !== 'noun') return failure(clause);
    const player = playerSelectorOf(who, ctx);
    if (!player.ok) return player;
    if (player.value.kind !== 'target') return failure(clause);
    const playerSlot = player.value.id;
    const objects = objectRefOf(cards, ctx);
    if (!objects.ok) return objects;
    if (objects.value.kind !== 'target') return failure(clause);
    const slot = objects.value.id;
    const index = ctx.targets.findIndex((t) => t.id === slot);
    const spec = ctx.targets[index];
    if (spec === undefined || spec.what.kind !== 'object' || spec.countX !== true) {
      return failure(clause);
    }
    ctx.targets[index] = { ...spec, ownedByTarget: playerSlot };
    const effects: Effect[] = [{ kind: 'exile', objects: objects.value }];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

/**
 * "For each card exiled this way, that player loses 1 life and you gain 1 life" (CR 608.2c, 119.3, 119.4): after the exile of the instruction before it, the player
 * the text named loses, and the controller gains, as many life as cards were exiled (`movedCount`: one life for each).
 */
const DRAIN_FOR_EACH_EXILED: Lowering<IrClause, Effects> = {
  head: 'drainForEachExiled',
  id: 'lower.drain-for-each-exiled',
  needs: ['effect:loseLife', 'effect:gainLife', 'amount:movedCount'],
  lower(clause, ctx) {
    if (ctx.lastEffectKind !== 'exile') return failure(clause);
    const who = arg(clause, 'player');
    if (who?.kind !== 'noun') return failure(clause);
    const player = playerSelectorOf(who, ctx);
    if (!player.ok) return player;
    const blocked = missingFeatures(['amount:movedCount']);
    if (blocked.length > 0) return failure(clause, blocked);
    const effects: Effect[] = [
      { kind: 'loseLife', player: player.value, amount: { kind: 'movedCount' } },
      { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'movedCount' } },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

/**
 * "Reveal the top card of your library. If it's a creature card, ... If it's a land card, ..." (CR 701.20a, 608.2c): the engine's `revealTopBranches` of the controller's own
 * library. Each branch is the kind of card (a filter that names no zone, controller or owner) and what is done when the card is of it, in text order: a token (the lowering of
 * `createToken`), life gained or lost, and last the card put onto the battlefield or into the hand. "That card's toughness" and "its power" are the card revealed, the engine's
 * `moved` while the branch runs; only the first branch may read them, since a branch before it may have put another object in `moved` (a token) or moved the card.
 */
export function revealTopBranchesLowering(
  lowerToken: (clause: IrClause, ctx: LowerContext) => LowerResult<Effects>,
): Lowering<IrClause, Effects> {
  return {
    head: 'revealTopBranches',
    id: 'lower.reveal-top-branches',
    needs: ['effect:revealTopBranches'],
    lower(clause, ctx) {
      const count = arg(clause, 'count');
      if (count?.kind !== 'number') return failure(clause);
      const you = { kind: 'you' } as const;
      const branches: BranchOf[] = [];
      for (let i = 0; i < count.value; i += 1) {
        const what = arg(clause, `what${i}`);
        const acts = arg(clause, `acts${i}`);
        if (what?.kind !== 'noun' || acts?.kind !== 'name') return failure(clause);
        const filter = lowerFilter(what);
        if (!filter.ok) return filter;
        const effects: Effect[] = [];
        let to: 'battlefield' | 'hand' | undefined;
        for (const act of acts.name.split(',')) {
          if (act === 'token') {
            const token = arg(clause, `token${i}`);
            if (token?.kind !== 'token') return failure(clause);
            const made = lowerToken({ ...clause, verb: 'createToken', args: { token } }, ctx);
            if (!made.ok) return made;
            effects.push(...made.value);
          } else if (act === 'gain') {
            const amount = arg(clause, `gain${i}`);
            if (amount?.kind !== 'number') return failure(clause);
            effects.push({ kind: 'gainLife', player: you, amount: amount.value });
          } else if (act === 'gainToughness' || act === 'losePower') {
            if (i !== 0) return failure(clause);
            const blocked = missingFeatures([
              'amount:toughnessOf',
              'amount:powerOf',
              'selector:moved',
            ]);
            if (blocked.length > 0) return failure(clause, blocked);
            const of = { kind: 'moved' } as const;
            effects.push(
              act === 'gainToughness'
                ? { kind: 'gainLife', player: you, amount: { kind: 'toughnessOf', of } }
                : { kind: 'loseLife', player: you, amount: { kind: 'powerOf', of } },
            );
          } else if (act === 'battlefield' || act === 'hand') {
            to = act;
          } else {
            return failure(clause);
          }
        }
        const onMatch: Effect | undefined =
          effects.length === 0
            ? undefined
            : effects.length === 1 && effects[0] !== undefined
              ? effects[0]
              : { kind: 'sequence', effects };
        branches.push({
          ifMatches: filter.value,
          ...(onMatch === undefined ? {} : { onMatch }),
          ...(to === undefined ? {} : { to }),
        });
      }
      return {
        ok: true,
        value: [{ kind: 'revealTopBranches', player: you, branches }],
        rule: clause.rule,
      };
    },
  };
}

type BranchOf = Extract<Effect, { kind: 'revealTopBranches' }>['branches'][number];

export const WITHERBLOOM_A_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXILE_GRAVEYARD_CARDS_OF_PLAYER,
  DRAIN_FOR_EACH_EXILED,
];
