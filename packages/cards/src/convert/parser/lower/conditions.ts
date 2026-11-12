/**
 * Conditions to the engine's `Condition` (CR 614.12: the game as a permanent enters). The engine
 * counts permanents the condition's controller controls and opponents still in the game, and
 * combines conditions with `and`, `or` and `not`; anything else the IR can say is reported with
 * the `condition:` feature it would need.
 */
import { CARD_TYPES, type CardType, type Condition } from '@commander-arena/engine';
import type { IrCondition, IrNoun } from '../ir/types';
import { lowerAmount } from './amounts';
import { type FeatureRef, missingFeatures } from './features';
import { lowerFilter, playerSelectorOf } from './nouns';
import { type LowerContext, type LowerFailure, type LowerResult, newContext } from './types';

function failure(c: IrCondition, needs: readonly FeatureRef[]): LowerFailure {
  return { ok: false, needs, at: c.span, rule: c.rule };
}

/**
 * Lowers one condition, naming the missing engine feature when the engine cannot run it.
 * `itIsSelf` says that "it" in the text is the object the ability belongs to (the subject of the
 * trigger, the permanent that enters): only then is "it was kicked" the engine's `kicked`, which
 * reads the source (CR 702.33d); about any other object it is not lowered. `ctx` is the context of the text the
 * condition is in (stage P28: an amount in a condition names objects and players through it); a condition of a
 * replacement has none and reads its amounts in a context of an ability of the permanent.
 */
export function lowerCondition(
  c: IrCondition,
  itIsSelf = false,
  ctx?: LowerContext,
): LowerResult<Condition> {
  const { test } = c;
  const ok = (value: Condition): LowerResult<Condition> => ({ ok: true, value, rule: c.rule });
  switch (test.kind) {
    case 'control': {
      const blocked = missingFeatures(['condition:controlsAtLeast']);
      if (blocked.length > 0) return failure(c, blocked);
      const filter = lowerFilter(test.noun);
      if (!filter.ok) return filter;
      const count =
        test.atLeast === undefined ? 1 : test.atLeast.kind === 'number' ? test.atLeast.value : 0;
      if (count < 1) return failure(c, []);
      return ok({ kind: 'controlsAtLeast', filter: filter.value, count });
    }
    case 'opponentsAtLeast': {
      const blocked = missingFeatures(['condition:opponentsAtLeast']);
      if (blocked.length > 0) return failure(c, blocked);
      if (test.atLeast.kind !== 'number' || test.atLeast.value < 1) return failure(c, []);
      return ok({ kind: 'opponentsAtLeast', count: test.atLeast.value });
    }
    case 'and':
    case 'or': {
      const blocked = missingFeatures([`condition:${test.kind}`]);
      if (blocked.length > 0) return failure(c, blocked);
      const terms: Condition[] = [];
      for (const term of test.terms) {
        const lowered = lowerCondition(term, itIsSelf, ctx);
        if (!lowered.ok) return lowered;
        terms.push(lowered.value);
      }
      return ok({ kind: test.kind, terms });
    }
    case 'not': {
      const blocked = missingFeatures(['condition:not']);
      if (blocked.length > 0) return failure(c, blocked);
      const term = lowerCondition(test.term, itIsSelf, ctx);
      return term.ok ? ok({ kind: 'not', term: term.value }) : term;
    }
    case 'kicked': {
      const blocked = missingFeatures(['condition:kicked']);
      if (blocked.length > 0) return failure(c, blocked);
      if (test.who === 'it' && !itIsSelf) return failure(c, []);
      return ok({ kind: 'kicked' });
    }
    case 'escaped': {
      // CR 702.138b: the engine reads it from the permanent the ability belongs to (or its last-known
      // information), so "it" is the source only when the ability is about the source itself.
      const blocked = missingFeatures(['condition:escaped']);
      if (blocked.length > 0) return failure(c, blocked);
      if (!itIsSelf) return failure(c, []);
      return ok({ kind: 'escaped' });
    }
    case 'controlCommander': {
      // CR 903.3d: the engine reads it for the player the ability or the spell belongs to; "your commander" (stage P29,
      // D-133) is a commander that player owns.
      const blocked = missingFeatures(['condition:controlCommander']);
      if (blocked.length > 0) return failure(c, blocked);
      return ok(
        test.yours === true
          ? { kind: 'controlCommander', yours: true }
          : { kind: 'controlCommander' },
      );
    }
    case 'lifeTotal': {
      // CR 119.1, 903.7 (stage P29, D-133): the life total of the controller, or its difference from the starting one.
      const blocked = missingFeatures(['condition:lifeTotal']);
      if (blocked.length > 0) return failure(c, blocked);
      const { cmp, value } = test.compare;
      return ok({
        kind: 'lifeTotal',
        compare: { cmp, value },
        ...(test.aboveStarting === true ? { aboveStarting: true as const } : {}),
      });
    }
    case 'lifeGainedThisTurn': {
      // CR 119.3, 603.4 (D-252): the life the controller gained this turn, from the turn log.
      const blocked = missingFeatures(['condition:lifeGainedThisTurn']);
      return blocked.length > 0
        ? failure(c, blocked)
        : ok({ kind: 'lifeGainedThisTurn', atLeast: test.atLeast });
    }
    case 'dieResult': {
      // CR 706.2, 706.3a (D-271): the result of the die the text rolled before this condition, read by a `conditional`. A condition with no roll before it
      // in the text, or a number the die cannot show (the condition would never, or always, hold), is not a condition of the text.
      const blocked = missingFeatures(['condition:dieResult']);
      if (blocked.length > 0) return failure(c, blocked);
      const sides = ctx?.dieSides ?? null;
      if (sides === null || test.compare.value < 1 || test.compare.value > sides) {
        return failure(c, []);
      }
      return ok({
        kind: 'dieResult',
        compare: { cmp: test.compare.cmp, value: test.compare.value },
      });
    }
    case 'ownsAndControlsNamed': {
      // CR 701.42a, 603.4 (D-278): "if you both own and control ~ and a creature named X" is read only as the intervening "if" of a triggered ability, and
      // leaves the name for the "exile them, then meld them" that follows (which is the only instruction it is read with).
      const blocked = missingFeatures(['condition:ownsAndControlsNamed']);
      if (blocked.length > 0) return failure(c, blocked);
      if (
        ctx?.interveningCondition !== true ||
        !(CARD_TYPES as readonly string[]).includes(test.type)
      ) {
        return failure(c, []);
      }
      ctx.meldPartner = test.name;
      return ok({ kind: 'ownsAndControlsNamed', name: test.name, type: test.type as CardType });
    }
    case 'thisInYourGraveyard': {
      // CR 113.6b, 603.4 (D-271): "if ~ is in your graveyard" is read only as the intervening "if" of a triggered ability (the lowering of the trigger then
      // requires that the ability works from the graveyard); anywhere else it is a test the engine does not run for that shape.
      const blocked = missingFeatures(['condition:thisInYourGraveyard']);
      if (blocked.length > 0) return failure(c, blocked);
      if (ctx?.interveningCondition !== true) return failure(c, []);
      return ok({ kind: 'thisInYourGraveyard' });
    }
    case 'subjectControllerHasMore': {
      // CR 603.4, 109.4 (stage P68, D-229): "that player", the controller of the permanent the trigger is about, has more lands than the controller.
      // "That player" of a trigger about a player (the active player of an opponent's end step, CR 102.1, 603.2b) is that player, not the controller of a
      // permanent: the engine's `triggerPlayerHasMore`. When "that player" is the controller of the ability itself it compares a player with
      // themselves, which is no condition of the text.
      const about = ctx?.thatPlayer?.selector.kind;
      if (about === 'you') return failure(c, []);
      const kind = about === 'triggerPlayer' ? 'triggerPlayerHasMore' : 'subjectControllerHasMore';
      const blocked = missingFeatures([`condition:${kind}`]);
      if (blocked.length > 0) return failure(c, blocked);
      return ok({ kind, stat: test.stat });
    }
    case 'cardsInGraveyard': {
      // CR 404.1 (stage P68, D-229): the number of cards in the graveyard of the controller.
      const blocked = missingFeatures(['condition:cardsInGraveyard']);
      if (blocked.length > 0) return failure(c, blocked);
      const { cmp, value } = test.compare;
      return ok({ kind: 'cardsInGraveyard', compare: { cmp, value } });
    }
    case 'paired': {
      // "~ is paired with another creature" (D-984, CR 702.95b): the permanent the ability belongs to is paired now; "it" is the source only in an
      // ability about the source itself (as for "it was kicked").
      const blocked = missingFeatures(['condition:paired']);
      if (blocked.length > 0) return failure(c, blocked);
      if (test.who === 'it' && !itIsSelf) return failure(c, []);
      // D-985 (CR 400.7, 603.10a): the engine reads the pair of the permanent on the battlefield now. Where the permanent may be gone (a dies or leaves trigger, a
      // sacrifice, a spell, an ability from the graveyard) the card it would be read on has no pair: not read, never a condition that is false for ever.
      if (
        ctx !== undefined &&
        (ctx.owner === 'spell' || ctx.selfGone || ctx.sourceMayLeave || ctx.graveyardSource)
      ) {
        return failure(c, []);
      }
      return ok({ kind: 'paired' });
    }
    case 'attachedTo': {
      // "As long as this Equipment is attached to a creature" (stage P37, D-180, CR 301.5): the permanent this one is attached to, against a
      // filter; "it" is the permanent of an ability about itself, as for `thisMatches`.
      const blocked = missingFeatures(['condition:objectMatches', 'selector:attached']);
      if (blocked.length > 0) return failure(c, blocked);
      const noun: IrNoun = {
        kind: 'noun',
        det: 'a',
        filter: test.filter,
        upTo: false,
        plural: false,
        other: false,
        span: c.span,
        rule: c.rule,
      };
      const filter = lowerFilter(noun);
      return filter.ok
        ? ok({ kind: 'objectMatches', of: { kind: 'attached' }, filter: filter.value })
        : filter;
    }
    case 'thisMatches': {
      // "As long as it's untapped" (stage P29, D-133): this permanent against a filter, read as it is now.
      const blocked = missingFeatures(['condition:thisMatches']);
      if (blocked.length > 0) return failure(c, blocked);
      // "It" is the source only in an ability about the source itself (as for "it was kicked").
      if (test.who === 'it' && !itIsSelf) return failure(c, []);
      const noun: IrNoun = {
        kind: 'noun',
        det: 'self',
        filter: test.filter,
        upTo: false,
        plural: false,
        other: false,
        span: c.span,
        rule: c.rule,
      };
      const filter = lowerFilter(noun);
      return filter.ok ? ok({ kind: 'thisMatches', filter: filter.value }) : filter;
    }
    case 'amountIs': {
      // CR 603.4: an amount of the game compared with a number, read as the ability triggers and as it resolves. The
      // amounts a condition reads name no target, X or trigger subject (`validateCard` refuses those).
      const blocked = missingFeatures(['condition:amountIs']);
      if (blocked.length > 0) return failure(c, blocked);
      const amount = lowerAmount(test.amount, ctx ?? newContext('ability', []), c.rule);
      if (!amount.ok) return amount;
      const { cmp, value } = test.compare;
      return ok({ kind: 'amountIs', amount: amount.value, compare: { cmp, value } });
    }
    case 'designation': {
      // CR 725.1: the monarch is a designation a player has; the selector names the players that count.
      const blocked = missingFeatures(['condition:playerHasDesignation']);
      if (blocked.length > 0) return failure(c, blocked);
      const player = playerSelectorOf(test.who, ctx ?? newContext('ability', []));
      if (!player.ok) return player;
      return ok({
        kind: 'playerHasDesignation',
        player: player.value,
        designation: test.designation,
      });
    }
    case 'objectMatches': {
      // CR 608.2c, 113.7a (stage P30, D-135): "if it's a Zombie card" asks what a target of this text is, as it is or as it last
      // was; after an instruction that put the card onto the battlefield it is "the object that was moved" (`ctx.movedOnto`).
      const blocked = missingFeatures(['condition:objectMatches']);
      if (blocked.length > 0) return failure(c, blocked);
      const at = ctx ?? newContext('ability', []);
      // "If that land is a Plains" (stage P33, D-150): the permanent whose event triggered the ability, as it is now.
      if (test.who.det === 'triggerSubject') {
        const subject = missingFeatures(['selector:triggerSubject']);
        if (subject.length > 0) return failure(c, subject);
        const matched = lowerFilter({ ...test.who, det: 'a', filter: test.filter });
        if (!matched.ok) return matched;
        return ok({ kind: 'objectMatches', of: { kind: 'triggerSubject' }, filter: matched.value });
      }
      const id = test.who.ref ?? '';
      // "Put a card exiled with ~ into its owner's graveyard. If it's a land card" (stage P50, D-207): the card the instruction before moved.
      if (id === 'moved') {
        const filter = lowerFilter({ ...test.who, det: 'a', filter: test.filter });
        return filter.ok
          ? ok({ kind: 'objectMatches', of: { kind: 'moved' }, filter: filter.value })
          : filter;
      }
      if (!/^t\d+$/.test(id) || !at.targets.some((t) => t.id === id)) return failure(c, []);
      const filter = lowerFilter({ ...test.who, det: 'a', filter: test.filter });
      if (!filter.ok) return filter;
      const of =
        at.movedOnto === id ? ({ kind: 'moved' } as const) : ({ kind: 'target', id } as const);
      return ok({ kind: 'objectMatches', of, filter: filter.value });
    }
    case 'putThisWay': {
      // "If you put a Cave onto the battlefield this way" (stage P37, D-180, CR 608.2c, 400.7j): the object the instruction before it moved, as it is
      // (`moved`); `validateCard` refuses it where no instruction before it moves a card.
      const blocked = missingFeatures(['condition:objectMatches']);
      if (blocked.length > 0) return failure(c, blocked);
      const filter = lowerFilter({
        kind: 'noun',
        det: 'a',
        filter: test.filter,
        upTo: false,
        plural: false,
        other: false,
        span: c.span,
        rule: c.rule,
      });
      return filter.ok
        ? ok({ kind: 'objectMatches', of: { kind: 'moved' }, filter: filter.value })
        : filter;
    }
    case 'giftPromised': {
      // CR 702.174k (stage P30, D-135): the spell was cast with its gift cost paid; the face has to have the keyword.
      const blocked = missingFeatures(['condition:giftPromised']);
      return blocked.length > 0 ? failure(c, blocked) : ok({ kind: 'giftPromised' });
    }
    case 'opponentControls': {
      // CR 109.4 (stage P30, D-135): some one opponent controls that many permanents that match.
      const blocked = missingFeatures(['condition:opponentControlsAtLeast']);
      if (blocked.length > 0) return failure(c, blocked);
      if (test.atLeast.kind !== 'number' || test.atLeast.value < 1) return failure(c, []);
      const filter = lowerFilter(test.noun);
      if (!filter.ok) return filter;
      return ok({
        kind: 'opponentControlsAtLeast',
        filter: filter.value,
        count: test.atLeast.value,
      });
    }
    case 'controlsGreatest': {
      // Stage P31 (D-140): among all the permanents of the kind, whoever controls them; the filter names no controller.
      const blocked = missingFeatures(['condition:controlsGreatest']);
      if (blocked.length > 0) return failure(c, blocked);
      const filter = lowerFilter(test.noun);
      if (!filter.ok) return filter;
      return ok({ kind: 'controlsGreatest', filter: filter.value, stat: test.stat });
    }
    case 'attackersAttackedYou': {
      // CR 508.1b (stage P33, D-150): read from the declaration of the `attackBatch` trigger the ability belongs to; `validateCard` refuses it
      // anywhere else.
      const blocked = missingFeatures(['condition:attackersAttackedYou']);
      return blocked.length > 0 ? failure(c, blocked) : ok({ kind: 'attackersAttackedYou' });
    }
    case 'sameName': {
      // CR 201.2 (stage P33, D-150): some name shared by at least that many of the controller's permanents that match.
      const blocked = missingFeatures(['condition:sameNameAtLeast']);
      if (blocked.length > 0) return failure(c, blocked);
      const filter = lowerFilter({ ...test.noun, filter: test.noun.filter });
      if (!filter.ok) return filter;
      return ok({ kind: 'sameNameAtLeast', filter: filter.value, count: test.atLeast });
    }
    case 'attackingMostLife': {
      // CR 702.105a (stage P34, D-152): read for the attacking creature the ability is about, so only an ability about `~` itself.
      const blocked = missingFeatures(['condition:attackingMostLife']);
      if (blocked.length > 0) return failure(c, blocked);
      return itIsSelf ? ok({ kind: 'attackingMostLife' }) : failure(c, []);
    }
    case 'attackersTotalPower': {
      // CR 508.1 (stage P34, D-152): the creatures the controller has attacking now, as the ability triggers and as it resolves.
      const blocked = missingFeatures(['condition:attackersTotalPower']);
      return blocked.length > 0
        ? failure(c, blocked)
        : ok({ kind: 'attackersTotalPower', atLeast: test.atLeast });
    }
    case 'controlsRingBearer': {
      // CR 701.54e (stage P45, D-197): a creature of the controller that is on the battlefield with their Ring-bearer designation.
      const blocked = missingFeatures(['condition:controlsRingBearer']);
      return blocked.length > 0 ? failure(c, blocked) : ok({ kind: 'controlsRingBearer' });
    }
    case 'manaSpentAtLeast': {
      // CR 601.2h (stage P49, D-206): the mana spent on the spell that caused the trigger.
      const test = c.test;
      if (test.kind !== 'manaSpentAtLeast') return failure(c, []);
      const blocked = missingFeatures(['condition:manaSpentAtLeast']);
      return blocked.length > 0
        ? failure(c, blocked)
        : ok({ kind: 'manaSpentAtLeast', count: test.count });
    }
    case 'cardLeftYourGraveyard': {
      // CR 400.7 (stage P49, D-206): the turn log of cards that left a graveyard.
      const blocked = missingFeatures(['condition:cardLeftYourGraveyard']);
      return blocked.length > 0 ? failure(c, blocked) : ok({ kind: 'cardLeftYourGraveyard' });
    }
    case 'spellTargets': {
      // CR 601.2c, 601.2f (stage P50, D-207): a target the spell chose, read as the cost is determined.
      const blocked = missingFeatures(['condition:spellTargets']);
      if (blocked.length > 0) return failure(c, blocked);
      const test = c.test;
      if (test.kind !== 'spellTargets') return failure(c, []);
      const filter = lowerFilter(test.noun);
      return filter.ok ? ok({ kind: 'spellTargets', filter: filter.value }) : filter;
    }
    case 'castFromZone': {
      // CR 601.2a (stage P49, D-206): the zone the source spell was cast from.
      const test = c.test;
      if (test.kind !== 'castFromZone') return failure(c, []);
      const blocked = missingFeatures(['condition:castFromZone']);
      return blocked.length > 0
        ? failure(c, blocked)
        : ok({ kind: 'castFromZone', zone: test.zone });
    }
    case 'yourTurn': {
      // CR 611.3a (stage P49, D-206): the active player is the controller, read each time the static ability is looked at.
      const blocked = missingFeatures(['condition:yourTurn']);
      return blocked.length > 0 ? failure(c, blocked) : ok({ kind: 'yourTurn' });
    }
    case 'yourMainPhase': {
      // CR 505.1 (stage P41, D-188): the precombat or postcombat main phase of the controller's turn, as the event happens and as the ability resolves.
      const blocked = missingFeatures(['condition:yourMainPhase']);
      return blocked.length > 0 ? failure(c, blocked) : ok({ kind: 'yourMainPhase' });
    }
    case 'playerDealtDamage': {
      // CR 120.3 (stage P34, D-152): the damage the player was dealt by any source this turn.
      const blocked = missingFeatures(['condition:playerDealtDamage']);
      return blocked.length > 0
        ? failure(c, blocked)
        : ok({ kind: 'playerDealtDamage', player: test.who, atLeast: test.atLeast });
    }
    case 'enteredThisTurn': {
      // CR 400.7 (stage P34, D-152): the turn log of the permanents that entered under the controller's control.
      const blocked = missingFeatures(['condition:enteredThisTurn']);
      if (blocked.length > 0) return failure(c, blocked);
      const known = (types: readonly string[] | undefined) =>
        (types ?? []).every((t) => (CARD_TYPES as readonly string[]).includes(t));
      if (!known(test.types) || !known(test.notTypes)) return failure(c, []);
      return ok({
        kind: 'enteredThisTurn',
        count: test.count,
        ...(test.types === undefined ? {} : { types: [...test.types] as CardType[] }),
        ...(test.notTypes === undefined ? {} : { notTypes: [...test.notTypes] as CardType[] }),
        ...(test.token === undefined ? {} : { token: test.token }),
      });
    }
    case 'hadCounters':
      // Only the intervening "if" of a trigger about a permanent that left, which the trigger's lowering folds into its filter.
      return failure(c, []);
    case 'didPrevious':
    case 'unlessPays':
      return failure(c, missingFeatures([`condition:${test.kind}`]));
    case 'discardedThisWay': {
      // "If a creature card was discarded this way" (stage P52, D-210, CR 608.2c): what a discard before it in the same text did.
      const blocked = missingFeatures(['condition:thisWayAtLeast']);
      if (blocked.length > 0) return failure(c, blocked);
      return ok({
        kind: 'thisWayAtLeast',
        what: test.creature ? 'discardedCreature' : 'discardedNoncreature',
        count: 1,
      });
    }
    case 'unlessReturn':
      // "... unless you return a land you control to its owner's hand" belongs to the sentence of one instruction, which the lowering of the sentences reads (D-258).
      return failure(c, []);
    case 'declined':
      // "If the player doesn't" belongs to a "may have you" sentence, which the lowering of the sentences reads; anywhere else it is not run.
      return failure(c, []);
    case 'raw':
      return failure(c, []);
  }
}

/** The feature references the condition lowerings can name, for the dimension test. */
export const CONDITION_NEEDS: readonly FeatureRef[] = [
  'condition:controlsAtLeast',
  'condition:opponentsAtLeast',
  'condition:kicked',
  'condition:controlCommander',
  'condition:lifeTotal',
  'condition:cardsInGraveyard',
  'condition:subjectControllerHasMore',
  'condition:triggerPlayerHasMore',
  'condition:thisMatches',
  'condition:escaped',
  'condition:and',
  'condition:or',
  'condition:not',
  'condition:didPrevious',
  'condition:thisWayAtLeast',
  'condition:unlessPays',
  'condition:amountIs',
  'condition:playerHasDesignation',
  'condition:objectMatches',
  'condition:giftPromised',
  'condition:opponentControlsAtLeast',
  'condition:controlsGreatest',
  'condition:attackersAttackedYou',
  'condition:sameNameAtLeast',
  'condition:attackingMostLife',
  'condition:attackersTotalPower',
  'condition:playerDealtDamage',
  'condition:lifeGainedThisTurn',
  'condition:dieResult',
  'condition:thisInYourGraveyard',
  'condition:ownsAndControlsNamed',
  'condition:enteredThisTurn',
  'condition:yourMainPhase',
  'condition:yourTurn',
  'condition:manaSpentAtLeast',
  'condition:cardLeftYourGraveyard',
  'condition:castFromZone',
  'condition:spellTargets',
  'condition:controlsRingBearer',
  'condition:paired',
];
