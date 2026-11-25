/**
 * Lowerings of stage P47 (D-200): "Empower Jace N" (CR 701.71a) and "You get an emblem with ..." (CR 114).
 *
 * The emblem's text in the quotes was read as an ability of its own (`rules/static/quoted.ts`) and is lowered like the abilities of a card, as the
 * abilities of the emblem: a static ability (which may lower to several of the engine's), a triggered ability, or an activated ability, with "this emblem" read as `~`.
 */
import type { Ability, Effect } from '@commander-arena/engine';
import { bind } from '../ir/bind';
import type { IrClause, IrQuotedAbility } from '../ir/types';
import { amountArg, arg, type Effects, eachObject, failure } from './clauses';
import type { FeatureRef } from './features';
import { lateLowerers } from './late';
import { lowerFilter, objectSelectorOf, playerSelectorOf } from './nouns';
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

/**
 * "Each Dragon you control deals 1 damage to that creature" (Sarkhan the Masterless; CR 120.3): the engine's `dealDamageFromEach`: a group of sources, each dealing its own damage to the
 * permanent the trigger is about.
 */
const DEAL_DAMAGE_FROM_EACH: Lowering<IrClause, Effects> = {
  head: 'dealDamageFromEach',
  id: 'lower.deal-damage-from-each',
  needs: ['effect:dealDamageFromEach', 'selector:triggerSubject'],
  lower(clause, ctx) {
    const sources = arg(clause, 'sources');
    const to = arg(clause, 'to');
    const amount = arg(clause, 'amount');
    if (sources?.kind !== 'noun' || to?.kind !== 'noun' || amount?.kind !== 'number') {
      return failure(clause);
    }
    const group = objectSelectorOf(sources, ctx);
    if (!group.ok) return group;
    const victim = objectSelectorOf(to, ctx, { triggerSubject: true });
    if (!victim.ok) return victim;
    if (group.value.kind !== 'each' || victim.value.kind !== 'triggerSubject') {
      return failure(clause);
    }
    return {
      ok: true,
      value: [
        {
          kind: 'dealDamageFromEach',
          sources: group.value,
          to: victim.value,
          amount: amount.value,
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Until end of turn, you may cast noncreature spells from among those cards without paying their mana costs" (Narset, Enlightened Master; CR 601.2, 118.9): the engine's `mayPlay` of the
 * cards an effect before it exiled (`moved`), free, to cast only, until end of turn, for the cards the filter describes.
 */
const MAY_CAST_KIND_FROM_MOVED_FREE: Lowering<IrClause, Effects> = {
  head: 'mayCastKindFromMovedFree',
  id: 'lower.may-cast-kind-from-moved-free',
  needs: ['effect:mayPlay', 'duration:untilEndOfTurn'],
  takesDuration: true,
  lower(clause) {
    const spell = arg(clause, 'spell');
    if (spell?.kind !== 'noun' || clause.duration?.scope !== 'untilEndOfTurn') {
      return failure(clause);
    }
    const filter = lowerFilter(spell);
    if (!filter.ok) return filter;
    const { zone: _zone, ...cards } = filter.value;
    void _zone;
    return {
      ok: true,
      value: [
        {
          kind: 'mayPlay',
          objects: { kind: 'moved' },
          free: true,
          castOnly: true,
          lasts: 'endOfTurn',
          cards,
        },
      ],
      rule: clause.rule,
    };
  },
};

/** "You may cast that card" (Chandra, Torch of Defiance; CR 608.2g): the engine's `castCard` of the card an earlier effect exiled (`moved`), asked as the effect resolves. */
const CAST_MOVED_NOW: Lowering<IrClause, Effects> = {
  head: 'castMovedNow',
  id: 'lower.cast-moved-now',
  needs: ['effect:castCard'],
  // The "you may" is the question `castCard` asks itself.
  acceptsOptional: true,
  lower(clause) {
    return {
      ok: true,
      value: [{ kind: 'castCard', object: { kind: 'moved' } }],
      rule: clause.rule,
    };
  },
};

/**
 * "Remove a loyalty counter from each of any number of permanents you control" (Chandra, Legacy of Fire; CR 122.1, 608.2d): the controller chooses among their permanents that have the counter
 * (the engine's `chooseObjects`, none to all) and one counter comes off each chosen one (`removeCounters`).
 */
const REMOVE_COUNTER_FROM_EACH_CHOSEN: Lowering<IrClause, Effects> = {
  head: 'removeCounterFromEachChosen',
  id: 'lower.remove-counter-from-each-chosen',
  needs: ['effect:chooseObjects', 'effect:removeCounters', 'selector:chosen'],
  lower(clause) {
    const counter = arg(clause, 'counter');
    if (counter?.kind !== 'counterSpec') return failure(clause);
    const id = 'counterSources';
    return {
      ok: true,
      value: [
        {
          kind: 'chooseObjects',
          id,
          filter: { controller: 'you', hasCounter: counter.name },
          count: 100,
        },
        {
          kind: 'removeCounters',
          objects: { kind: 'chosen', id },
          counter: counter.name,
          count: 1,
        },
      ],
      rule: clause.rule,
    };
  },
};

/** "Exile that many cards from the top of your library" (CR 701.13, 608.2c): the engine's `exileTop` of the counters the instruction before removed. */
const EXILE_TOP_THAT_MANY: Lowering<IrClause, Effects> = {
  head: 'exileTopThatMany',
  id: 'lower.exile-top-that-many',
  needs: ['effect:exileTop'],
  lower(clause, ctx) {
    // The cards exiled face up are what "play them" names next (the engine's `moved`).
    ctx.exiled = 'top';
    ctx.exiledFaceDown = false;
    // "that many" after the event of a trigger (Dream Pillager: combat damage dealt) is the amount the binding pass made of it; after the removal of counters (Chandra) it is the counters removed.
    const said = amountArg(clause, 'count', ctx);
    return {
      ok: true,
      value: [
        {
          kind: 'exileTop',
          count:
            said.ok && (typeof said.value === 'number' || said.value.kind !== 'thisWay')
              ? said.value
              : { kind: 'thisWay', what: 'countersRemoved' },
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Choose left or right. Until your next turn, each player may attack only the nearest opponent in the last chosen direction and planeswalkers controlled by that opponent." (Teyo,
 * Geometric Tactician; CR 508.1a, 611.2a): the engine's `chooseOne` of the two directions, each the continuous restriction `attackOnlyNearestOpponent`.
 */
const CHOOSE_DIRECTION_ATTACK_NEAREST: Lowering<IrClause, Effects> = {
  head: 'chooseDirectionAttackNearest',
  id: 'lower.choose-direction-attack-nearest',
  needs: ['effect:chooseOne', 'effect:attackOnlyNearestOpponent'],
  lower(clause) {
    return {
      ok: true,
      value: [
        {
          kind: 'chooseOne',
          options: (['left', 'right'] as const).map((direction) => ({
            label: direction === 'left' ? 'Left' : 'Right',
            effect: {
              kind: 'attackOnlyNearestOpponent' as const,
              direction,
              duration: 'untilYourNextTurn' as const,
            },
          })),
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Exile any number of target creatures and/or planeswalkers you control. At the beginning of the next end step, return each of them ... with an additional counter" (Semester's End; CR
 * 701.13, 603.7c, 122.6): the engine's `exile` of the targets and a `delayedTrigger` at the next end step whose `moveToZone` of `moved` puts them back under their owner's control with
 * a +1/+1 counter if the card is a creature and a loyalty counter if it is a planeswalker.
 */
const EXILE_RETURN_NEXT_END_STEP_COUNTERS: Lowering<IrClause, Effects> = {
  head: 'exileReturnNextEndStepCounters',
  id: 'lower.exile-return-next-end-step-counters',
  needs: ['effect:exile', 'effect:delayedTrigger', 'effect:moveToZone', 'selector:moved'],
  lower(clause, ctx) {
    const lowered = eachObject(clause, ctx, (objects) => ({ kind: 'exile', objects }));
    if (!lowered.ok) return lowered;
    if (lowered.value.length !== 1) return failure(clause);
    return {
      ok: true,
      value: [
        ...lowered.value,
        {
          kind: 'delayedTrigger',
          at: { step: 'endStep', whose: 'each' },
          effect: {
            kind: 'moveToZone',
            objects: { kind: 'moved' },
            to: 'battlefield',
            controller: 'owner',
            withCounters: [
              { counter: '+1/+1', count: 1, ifType: 'creature' },
              { counter: 'loyalty', count: 1, ifType: 'planeswalker' },
            ],
          },
        },
      ],
      rule: clause.rule,
    };
  },
};

/** "For each planeswalker you control, you may activate one of its loyalty abilities once this turn as though none ... activated" (The Chain Veil; CR 606.3): the engine's `forgetLoyaltyActivations`. */
const FORGET_LOYALTY_ACTIVATIONS: Lowering<IrClause, Effects> = {
  head: 'forgetLoyaltyActivations',
  id: 'lower.forget-loyalty-activations',
  needs: ['effect:forgetLoyaltyActivations'],
  lower(clause, ctx) {
    return eachObject(clause, ctx, (objects) => ({ kind: 'forgetLoyaltyActivations', objects }));
  },
};

/**
 * "Add {U}, {R}, or {W}. Spend this mana only to cast a noncreature spell." (Narset of the Ancient Way; CR 106.1b, 106.6, 205.2a): the engine's `chooseOne` of the colors, each an `addMana`
 * of one mana that only a spell with no creature type can spend (`spendOnly` `notTypes`).
 */
const ADD_ONE_OF_NONCREATURE_ONLY: Lowering<IrClause, Effects> = {
  head: 'addOneOfNoncreatureOnly',
  id: 'lower.add-one-of-noncreature-only',
  needs: ['effect:chooseOne', 'effect:addMana'],
  lower(clause) {
    const colors = arg(clause, 'colors');
    if (colors?.kind !== 'keywordName') return failure(clause);
    const options = colors.name.split('').flatMap((c) =>
      c === 'W' || c === 'U' || c === 'B' || c === 'R' || c === 'G'
        ? [
            {
              label: `{${c}}`,
              effect: {
                kind: 'addMana' as const,
                mana: {
                  kind: 'fixed' as const,
                  mana: [c as 'W' | 'U' | 'B' | 'R' | 'G'],
                  spendOnly: { notTypes: ['creature' as const] },
                },
              },
            },
          ]
        : [],
    );
    if (options.length < 2) return failure(clause);
    return { ok: true, value: [{ kind: 'chooseOne', options }], rule: clause.rule };
  },
};

/** "... then you may discard a card" (Narset of the Ancient Way; CR 701.9, 608.2d): the engine's `may` of a discard of one card by the controller, whose answer "When you discard a nonland card this way" reads. */
const DISCARD_MAY_ONE: Lowering<IrClause, Effects> = {
  head: 'discardMayOne',
  id: 'lower.discard-may-one',
  needs: ['effect:may', 'effect:discard'],
  lower(clause) {
    return {
      ok: true,
      value: [{ kind: 'may', effect: { kind: 'discard', player: { kind: 'you' }, count: 1 } }],
      rule: clause.rule,
    };
  },
};

/** Features the lowerings of this file can name, for the dimension test. */
export const PLANESWALKER_NEEDS: readonly FeatureRef[] = [
  'effect:empowerJace',
  'effect:createEmblem',
  'effect:moveCounterFromThis',
  'effect:castCard',
  'effect:may',
  'effect:discard',
  'effect:addMana',
  'effect:forgetLoyaltyActivations',
  'effect:exile',
  'effect:delayedTrigger',
  'effect:moveToZone',
  'effect:chooseOne',
  'effect:attackOnlyNearestOpponent',
  'effect:chooseObjects',
  'effect:removeCounters',
  'effect:exileTop',
  'effect:dealDamageFromEach',
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
  DEAL_DAMAGE_FROM_EACH,
  MAY_CAST_KIND_FROM_MOVED_FREE,
  CAST_MOVED_NOW,
  DISCARD_MAY_ONE,
  ADD_ONE_OF_NONCREATURE_ONLY,
  FORGET_LOYALTY_ACTIVATIONS,
  EXILE_RETURN_NEXT_END_STEP_COUNTERS,
  CHOOSE_DIRECTION_ATTACK_NEAREST,
  REMOVE_COUNTER_FROM_EACH_CHOSEN,
  EXILE_TOP_THAT_MANY,
  SET_LIFE_TOTAL,
  EXCHANGE_LIFE_PT,
];
