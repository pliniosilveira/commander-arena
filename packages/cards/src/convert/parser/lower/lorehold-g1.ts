/**
 * Lowerings of group 1 of the Lorehold Spirit deck (issue 86): the exile of one of the cards a batch of discards is about, the shuffle of cards of the graveyard into the library and the
 * damage each creature deals to itself. "Repeat this process once" is lowered with the sentences around it (`lower/sentences.ts`), which know what the process is.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { objectSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * "You may exile one of them from your graveyard." (CR 603.2c, 608.2d, 400.7): the engine's `exileFromTriggerCards`, which asks the controller to choose none or one of the cards that
 * triggered the ability that are still in their graveyard. Only in the body of a trigger about a batch of discards ("one or more nonland cards"), whose cards "them" names; the text must
 * say "you may" (the choice of none is the offer, so an exile that is not optional is not run). The card exiled is what "it" names afterwards ("If you do, you may cast it this turn").
 */
const EXILE_ONE_OF_THEM: Lowering<IrClause, Effects> = {
  head: 'exileOneOfThem',
  id: 'lower.exile-one-of-them',
  needs: ['effect:exileFromTriggerCards'],
  // The sentence's "you may" and the engine's choice are the same offer: asked once, a choice of none or one card.
  acceptsOptional: true,
  lower(clause, ctx) {
    if (!clause.optional || !ctx.discardBatchTrigger) return failure(clause);
    ctx.exiled = 'cards';
    return { ok: true, value: [{ kind: 'exileFromTriggerCards' }], rule: clause.rule };
  },
};

/**
 * "Put one of them onto the battlefield." (issue 102, Colossal Grave-Reaver; CR 603.2c, 608.2d, 400.7, 110.2a): the engine's `putOneOfTriggerCards`, which asks the controller to
 * choose one of the cards that triggered the ability that are still in a graveyard. Only in the body of a trigger about a batch of cards put into a graveyard.
 */
const PUT_ONE_OF_THEM: Lowering<IrClause, Effects> = {
  head: 'putOneOfThem',
  id: 'lower.put-one-of-them',
  needs: ['effect:putOneOfTriggerCards'],
  lower(clause, ctx) {
    if (clause.optional || !ctx.graveyardBatchTrigger) return failure(clause);
    return { ok: true, value: [{ kind: 'putOneOfTriggerCards' }], rule: clause.rule };
  },
};

/**
 * "For each player, choose up to one target creature card in that player's graveyard. Put those cards onto the battlefield under your control." (issue 102, Afterlife from the Loam,
 * CR 115.1, 404.1, 110.2a): the engine's `moveToZone` of a slot of targets with different owners (`differentControllers`, one card of each graveyard) onto the battlefield under the
 * controller's control. The cards put there are `moved` for the sentence after it.
 */
const PUT_ONE_PER_GRAVEYARD: Lowering<IrClause, Effects> = {
  head: 'putOnePerGraveyard',
  id: 'lower.put-one-per-graveyard',
  needs: ['effect:moveToZone', 'selector:target'],
  lower(clause, ctx) {
    const named = arg(clause, 'objects');
    if (named?.kind !== 'noun') return failure(clause);
    const objects = objectSelectorOf(named, ctx);
    if (!objects.ok) return objects;
    if (objects.value.kind !== 'target') return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'moveToZone', objects: objects.value, to: 'battlefield', controller: 'you' }],
      rule: clause.rule,
    };
  },
};

/**
 * "Shuffle any number of target cards from your graveyard into your library." (CR 701.24c, 701.24d, 404.1): the engine's `moveToZone` of the targets to the library and then the
 * `shuffle` of the controller, which happens even with no target (CR 701.24d). The targets are a slot of the ability (a spell's or an ability's), any number of them for `anyNumber`.
 */
const SHUFFLE_INTO_LIBRARY: Lowering<IrClause, Effects> = {
  head: 'shuffleIntoLibrary',
  id: 'lower.shuffle-into-library',
  needs: ['effect:moveToZone', 'effect:shuffle', 'selector:target'],
  lower(clause, ctx) {
    const named = arg(clause, 'objects');
    if (named?.kind !== 'noun' || named.det !== 'target') return failure(clause);
    const objects = objectSelectorOf(named, ctx);
    if (!objects.ok) return objects;
    if (objects.value.kind !== 'target') return failure(clause);
    const effects: Effect[] = [
      { kind: 'moveToZone', objects: objects.value, to: 'library' },
      { kind: 'shuffle', player: { kind: 'you' } },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

/**
 * "Each creature deals damage to itself equal to its power." (CR 120.3, 608.2h): the engine's `dealDamageToSelf` of the group. The group is an `each` selector of permanents on the
 * battlefield.
 */
const DEAL_DAMAGE_TO_SELF: Lowering<IrClause, Effects> = {
  head: 'dealDamageToSelf',
  id: 'lower.deal-damage-to-self',
  needs: ['effect:dealDamageToSelf', 'selector:each'],
  lower(clause, ctx) {
    const named = arg(clause, 'objects');
    if (named?.kind !== 'noun' || named.det !== 'each') return failure(clause);
    const objects = objectSelectorOf(named, ctx);
    if (!objects.ok) return objects;
    if (objects.value.kind !== 'each') return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'dealDamageToSelf', objects: objects.value }],
      rule: clause.rule,
    };
  },
};

export const LOREHOLD_G1_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXILE_ONE_OF_THEM,
  PUT_ONE_OF_THEM,
  PUT_ONE_PER_GRAVEYARD,
  SHUFFLE_INTO_LIBRARY,
  DEAL_DAMAGE_TO_SELF,
];
