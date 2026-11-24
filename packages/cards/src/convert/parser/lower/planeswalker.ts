/**
 * Lowerings of stage P47 (D-200): "Empower Jace N" (CR 701.71a) and "You get an emblem with ..." (CR 114).
 *
 * The emblem's text in the quotes was read as an ability of its own (`rules/static/quoted.ts`) and is lowered like the abilities of a card, as the
 * abilities of the emblem: a static ability (which may lower to several of the engine's), a triggered ability, or an activated ability, with "this emblem" read as `~`.
 */
import type { Ability, Effect } from '@commander-arena/engine';
import { bind } from '../ir/bind';
import type { IrClause, IrQuotedAbility } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import type { FeatureRef } from './features';
import { lateLowerers } from './late';
import { objectSelectorOf, playerSelectorOf } from './nouns';
import { type LowerContext, type Lowering, type LowerResult, newContext } from './types';

/** "Empower Jace 6." (CR 701.71a): the engine's `empowerJace`, a positive number of loyalty counters (an X is not read). */
export const EMPOWER_JACE: Lowering<IrClause, Effects> = {
  head: 'empowerJace',
  id: 'lower.empower-jace',
  needs: ['effect:empowerJace'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    if (typeof count.value !== 'number' || count.value < 1) return failure(clause);
    return { ok: true, value: [{ kind: 'empowerJace', amount: count.value }], rule: clause.rule };
  },
};

/** "Target player's life total becomes 1." (CR 119.5, D-201): the engine's `setLifeTotal`, a number of 0 or more for the players the noun names. */
export const SET_LIFE_TOTAL: Lowering<IrClause, Effects> = {
  head: 'setLifeTotal',
  id: 'lower.set-life-total',
  needs: ['effect:setLifeTotal'],
  lower(clause, ctx) {
    const player = arg(clause, 'player');
    if (player?.kind !== 'noun') return failure(clause);
    const who = playerSelectorOf(player, ctx);
    if (!who.ok) return who;
    const amount = amountArg(clause, 'amount', ctx);
    if (!amount.ok) return amount;
    if (typeof amount.value === 'number' && amount.value < 0) return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'setLifeTotal', player: who.value, amount: amount.value }],
      rule: clause.rule,
    };
  },
};

/**
 * "Exchange target opponent's life total with ~'s toughness." (CR 701.12g): the engine's `exchangeLifeWithPt`, for one player the noun names and the permanent the ability is on.
 */
export const EXCHANGE_LIFE_PT: Lowering<IrClause, Effects> = {
  head: 'exchangeLifeWithPt',
  id: 'lower.exchange-life-pt',
  needs: ['effect:exchangeLifeWithPt'],
  lower(clause, ctx) {
    const player = arg(clause, 'player');
    const object = arg(clause, 'object');
    const power = arg(clause, 'power');
    if (player?.kind !== 'noun' || object?.kind !== 'noun' || object.ref !== 'self') {
      return failure(clause);
    }
    if (power?.kind !== 'flag') return failure(clause);
    const who = playerSelectorOf(player, ctx);
    if (!who.ok) return who;
    return {
      ok: true,
      value: [
        {
          kind: 'exchangeLifeWithPt',
          player: who.value,
          object: { kind: 'this' },
          stat: power.value ? 'power' : 'toughness',
        },
      ],
      rule: clause.rule,
    };
  },
};

/** The abilities of the emblem the quoted text says, in the engine's AST (CR 114.4). */
export function lowerEmblemAbilities(
  quoted: IrQuotedAbility,
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  const fail = (needs: readonly FeatureRef[] = []): LowerResult<never> => ({
    ok: false,
    needs,
    at: quoted.span,
    rule: quoted.rule,
  });
  const inner = quoted.ability;
  if (inner.kind !== 'static' && inner.kind !== 'triggered' && inner.kind !== 'activated')
    return fail();
  const bound = bind(inner, {});
  if (!bound.ok) return fail();
  const late = lateLowerers();
  if (late === null) return fail();
  const own = newContext('ability', [], [], ctx.cardName);
  const lowered =
    bound.ability.kind === 'triggered'
      ? late.triggered(bound.ability, own)
      : bound.ability.kind === 'static'
        ? late.static(bound.ability, own)
        : bound.ability.kind === 'activated'
          ? late.activated(bound.ability, own)
          : null;
  if (lowered === null) return fail();
  if (!lowered.ok) return fail(lowered.needs);
  // An X nothing defines, or a target of a static ability, is not an emblem's: `validateCard` refuses them too.
  if (own.usesX) return fail();
  if (lowered.value.length === 0) return fail();
  if (
    lowered.value.some(
      (a) => a.kind !== 'static' && a.kind !== 'triggered' && a.kind !== 'activated',
    )
  )
    return fail();
  return { ok: true, value: lowered.value, rule: quoted.rule };
}

/** `You get an emblem with "..."` (CR 114.1, 114.2): the engine's `createEmblem`, with the abilities of the quotes. */
export const GET_EMBLEM: Lowering<IrClause, Effects> = {
  head: 'getEmblem',
  id: 'lower.get-emblem',
  needs: ['effect:createEmblem'],
  lower(clause, ctx) {
    const quoted = arg(clause, 'emblem');
    if (quoted?.kind !== 'quoted') return failure(clause);
    const abilities = lowerEmblemAbilities(quoted, ctx);
    if (!abilities.ok) return abilities;
    // "Target opponent gets an emblem with ..." (Ob Nixilis Reignited): the player the clause names gets it.
    const who = arg(clause, 'who');
    if (who !== undefined && who.kind !== 'noun') return failure(clause);
    const player = who === undefined ? undefined : playerSelectorOf(who, ctx);
    if (player !== undefined && !player.ok) return player;
    const effect: Effect = {
      kind: 'createEmblem',
      abilities: [...abilities.value],
      text: quoted.text ?? '',
      ...(player === undefined ? {} : { player: player.value }),
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/**
 * "Move a loyalty counter from ~ onto that planeswalker" (Gatewatch Beacon; CR 122.1, 122.6): the engine's `moveCounterFromThis`. The permanent the counter goes on is the one the
 * trigger is about, which the pronoun names (`triggerSubject`).
 */
const MOVE_COUNTER_FROM_SELF: Lowering<IrClause, Effects> = {
  head: 'moveCounterFromThis',
  id: 'lower.move-counter-from-self',
  needs: ['effect:moveCounterFromThis', 'selector:triggerSubject'],
  lower(clause, ctx) {
    const counter = arg(clause, 'counter');
    const to = arg(clause, 'objects');
    if (counter?.kind !== 'counterSpec' || to?.kind !== 'noun') return failure(clause);
    const selector = objectSelectorOf(to, ctx, { triggerSubject: true });
    if (!selector.ok) return selector;
    if (selector.value.kind !== 'triggerSubject') return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'moveCounterFromThis', counter: counter.name, count: 1, to: selector.value }],
      rule: clause.rule,
    };
  },
};

/** Features the lowerings of this file can name, for the dimension test. */
export const PLANESWALKER_NEEDS: readonly FeatureRef[] = [
  'effect:empowerJace',
  'effect:createEmblem',
  'effect:moveCounterFromThis',
  'effect:setLifeTotal',
  'effect:exchangeLifeWithPt',
  'ability:static',
  'ability:triggered',
  'ability:activated',
];

export const PLANESWALKER_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EMPOWER_JACE,
  GET_EMBLEM,
  MOVE_COUNTER_FROM_SELF,
  SET_LIFE_TOTAL,
  EXCHANGE_LIFE_PT,
];
