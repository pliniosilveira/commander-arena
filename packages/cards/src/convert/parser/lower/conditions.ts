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

/** The attachment a word of "enchanted creature is ..." and "equipped creature is ..." says the source is: an Aura enchants and an Equipment equips (CR 303.4a, 301.5a). */
const HOST_KIND = { enchanted: 'Aura', equipped: 'Equipment' } as const;

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
    case 'opponentPoisonAtLeast': {
      const blocked = missingFeatures(['condition:opponentPoisonAtLeast']);
      if (blocked.length > 0) return failure(c, blocked);
      if (test.atLeast.kind !== 'number' || test.atLeast.value < 1) return failure(c, []);
      return ok({ kind: 'opponentPoisonAtLeast', count: test.atLeast.value });
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
    case 'foretold': {
      // CR 702.143a: the engine reads it from the spell; the lowering of a spell's sentence only (`validateCard` checks the face lists a foretell cost).
      const blocked = missingFeatures(['condition:foretold']);
      if (blocked.length > 0) return failure(c, blocked);
      if (ctx?.owner !== 'spell') return failure(c, []);
      return ok({ kind: 'foretold' });
    }
    case 'xAtLeast': {
      // CR 107.3a, 608.2c (issue 233): the X announced for the spell; only a spell with an {X} in its cost has one (`validateCard` checks it).
      const blocked = missingFeatures(['condition:xAtLeast']);
      if (blocked.length > 0) return failure(c, blocked);
      // CR 107.3m (D2 group, Kinetic Ooze): in the enters trigger of the permanent itself the X is the one of the spell it came from (`validateCard` checks the cost has an {X}).
      if (ctx?.entersX === true) return ok({ kind: 'xAtLeast', value: test.atLeast });
      if (ctx?.owner !== 'spell') return failure(c, []);
      ctx.usesX = true;
      return ok({ kind: 'xAtLeast', value: test.atLeast });
    }
    case 'castInOwnMainPhase': {
      // CR 601.2, 505.1 (issue 244): the engine reads it from the spell; the lowering of a spell's sentence only.
      const blocked = missingFeatures(['condition:castInOwnMainPhase']);
      if (blocked.length > 0) return failure(c, blocked);
      if (ctx?.owner !== 'spell') return failure(c, []);
      return ok({ kind: 'castInOwnMainPhase' });
    }
    case 'additionalCostPaid': {
      // CR 118.8, 701.68a: the engine reads it from the spell; the lowering of a spell's sentence only (`validateCard` checks the face has the optional cost).
      const blocked = missingFeatures(['condition:additionalCostPaid']);
      if (blocked.length > 0) return failure(c, blocked);
      if (ctx?.owner !== 'spell') return failure(c, []);
      return ok({ kind: 'additionalCostPaid' });
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
        ...(test.player === undefined ? {} : { player: test.player }),
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
    case 'castFromGraveyardThisTurn': {
      // Issue 159 (CR 601.2a, 602.2): the turn log of the controller of the condition.
      const blocked = missingFeatures(['condition:castFromGraveyardThisTurn']);
      return blocked.length > 0 ? failure(c, blocked) : ok({ kind: 'castFromGraveyardThisTurn' });
    }
    case 'lifeGainedAndLostThisTurn': {
      const blocked = missingFeatures(['condition:lifeGainedAndLostThisTurn']);
      return blocked.length > 0 ? failure(c, blocked) : ok({ kind: 'lifeGainedAndLostThisTurn' });
    }
    case 'aPlayerLostLifeThisTurn': {
      // CR 119.3, 603.4: the life lost this turn by any player, from the seats' counters.
      const blocked = missingFeatures(['condition:aPlayerLostLifeThisTurn']);
      return blocked.length > 0
        ? failure(c, blocked)
        : ok({
            kind: 'aPlayerLostLifeThisTurn',
            atLeast: test.atLeast,
            ...(test.opponent === true ? { opponent: true as const } : {}),
          });
    }
    case 'spellsCastThisTurn': {
      // CR 602.5b, 601.2i (D-318): the spells the controller has cast this turn, read as the ability is activated.
      const blocked = missingFeatures(['condition:spellsCastThisTurn']);
      return blocked.length > 0
        ? failure(c, blocked)
        : ok({
            kind: 'spellsCastThisTurn',
            atLeast: test.atLeast,
            ...(test.ofTypes === undefined ? {} : { ofTypes: test.ofTypes as CardType[] }),
            ...(test.notOfTypes === undefined ? {} : { notOfTypes: test.notOfTypes as CardType[] }),
          });
    }
    case 'spellsCastLastTurn': {
      // CR 601.2i (issue 345): the spells each player cast in the turn before this one, read as the ability triggers and resolves.
      const blocked = missingFeatures(['condition:spellsCastLastTurn']);
      return blocked.length > 0
        ? failure(c, blocked)
        : ok({
            kind: 'spellsCastLastTurn',
            mode: test.mode,
            ...(test.atLeast === undefined ? {} : { atLeast: test.atLeast }),
          });
    }
    case 'attackedWithCreaturesThisTurn': {
      // CR 508.1 (issue 279): the different creatures the controller declared as attackers this turn, from the turn log.
      const blocked = missingFeatures(['condition:attackedWithCreaturesThisTurn']);
      return blocked.length > 0
        ? failure(c, blocked)
        : ok({ kind: 'attackedWithCreaturesThisTurn', atLeast: test.atLeast });
    }
    case 'clashWon': {
      // CR 701.30d: who won the clash the text made before this condition; a condition with no clash before it in the text is not one of the text.
      const blocked = missingFeatures(['condition:clashWon']);
      if (blocked.length > 0) return failure(c, blocked);
      if (ctx?.clashed !== true) return failure(c, []);
      return ok({ kind: 'clashWon' });
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
    case 'cardsExiledWithSelf': {
      // CR 603.4, 607.2a (Valakut Exploration): "if there are cards exiled with ~" is the intervening "if" of a triggered ability: at least one card the permanent exiled with its
      // linked ability is still in exile, read as the ability triggers and again as it resolves. The cards it leaves for "put them into their owner's graveyard" to name.
      const blocked = missingFeatures([
        'condition:amountIs',
        'amount:countOf',
        'selector:exiledWithSource',
      ]);
      if (blocked.length > 0) return failure(c, blocked);
      if (ctx?.interveningCondition !== true) return failure(c, []);
      ctx.exiledWithCondition = true;
      return ok({
        kind: 'amountIs',
        amount: { kind: 'countOf', filter: { zone: 'exile', exiledWithSource: true } },
        compare: { cmp: 'atLeast', value: test.atLeast ?? 1 },
      });
    }
    case 'thisInYourGraveyard': {
      // CR 113.6b, 603.4 (D-271): "if ~ is in your graveyard" is read only as the intervening "if" of a triggered ability (the lowering of the trigger then
      // requires that the ability works from the graveyard); anywhere else it is a test the engine does not run for that shape.
      const blocked = missingFeatures(['condition:thisInYourGraveyard']);
      if (blocked.length > 0) return failure(c, blocked);
      if (ctx?.interveningCondition !== true) return failure(c, []);
      return ok({ kind: 'thisInYourGraveyard' });
    }
    case 'thisOnBattlefield': {
      // CR 603.4, 400.7 (issue 89, Animate Dead): "if it's on the battlefield" is read only as the intervening "if" of a trigger about the source itself, where "it" is the source.
      const blocked = missingFeatures(['condition:thisOnBattlefield']);
      if (blocked.length > 0) return failure(c, blocked);
      if (!itIsSelf || ctx?.interveningCondition !== true) return failure(c, []);
      return ok({ kind: 'thisOnBattlefield' });
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
    case 'thatPlayersTurn': {
      // CR 603.4, 500.1 (Tataru Taru): "it isn't that player's turn", the player the trigger is about; read as the intervening "if" of a trigger about a player.
      if (ctx?.thatPlayer?.selector.kind !== 'triggerPlayer' || ctx.interveningCondition !== true) {
        return failure(c, []);
      }
      const blocked = missingFeatures(['condition:triggerPlayerTurn', 'condition:not']);
      if (blocked.length > 0) return failure(c, blocked);
      const turn: Condition = { kind: 'triggerPlayerTurn' };
      return ok(test.negated ? { kind: 'not', term: turn } : turn);
    }
    case 'controlsThat': {
      // CR 603.10a, 608.2h (Auntie Ool, Cursewretch): "draw a card if you control that creature": the permanent the trigger is about, under the control it has or had as it left. "It" of
      // a trigger about the source is the source, which is the subject of its event too.
      const blocked = missingFeatures(['condition:subjectControlledByYou']);
      if (blocked.length > 0) return failure(c, blocked);
      const aboutTrigger =
        test.who.det === 'triggerSubject' || (test.who.ref === 'self' && itIsSelf);
      if (!aboutTrigger) return failure(c, []);
      const held: Condition = { kind: 'subjectControlledByYou' };
      return ok(test.negated === true ? { kind: 'not', term: held } : held);
    }
    case 'subjectStat': {
      // CR 603.10a, 113.7a, 208.1 (Massacre Girl, Known Killer): "if its toughness was less than 1" is the intervening "if" of a trigger about a permanent, read from the permanent as it
      // last was.
      const blocked = missingFeatures(['condition:subjectStat']);
      if (blocked.length > 0) return failure(c, blocked);
      if (ctx?.interveningCondition !== true) return failure(c, []);
      return ok({
        kind: 'subjectStat',
        stat: test.stat,
        compare: { cmp: test.compare.cmp, value: test.compare.value },
      });
    }
    case 'subjectGreaterThanEach': {
      // CR 603.10a, 208.1, 608.2c (Selvala, Heart of the Wilds): "its power is greater than each other creature's power" is read as the instruction comes up (a conditional effect, not the
      // intervening "if"), of the permanent the trigger is about.
      const blocked = missingFeatures(['condition:subjectGreaterThanEach']);
      if (blocked.length > 0) return failure(c, blocked);
      if (ctx?.interveningCondition === true) return failure(c, []);
      return ok({
        kind: 'subjectGreaterThanEach',
        stat: test.stat,
        filter: { types: test.types as CardType[] },
      });
    }
    case 'subjectGreaterPower': {
      // CR 208.1, 603.4, 702.100a (Ensign Harry Kim, Operations): "if it has greater power than ~" is the intervening "if" of a trigger about the creature that entered, read as the ability
      // triggers and again as it resolves. The engine's Evolve test with the toughness left out.
      const blocked = missingFeatures(['condition:subjectGreaterPt']);
      if (blocked.length > 0) return failure(c, blocked);
      if (ctx?.interveningCondition !== true) return failure(c, []);
      return ok({ kind: 'subjectGreaterPt', onlyPower: true });
    }
    case 'putCountersThisWay': {
      // CR 122.6, 608.2c (Guinan, Ancient Advisor): "If you put two or more +1/+1 counters on creatures this way": the counters of the instructions before it in the same text. The engine counts
      // every counter its `addCounters` effects put, so the text before it must put counters of this one kind, and only on creatures, or the count would not be the one the words name.
      const blocked = missingFeatures(['condition:thisWayAtLeast']);
      if (blocked.length > 0) return failure(c, blocked);
      const put = ctx?.putCounters ?? [];
      if (
        put.length === 0 ||
        !put.every((p) => p.counter === test.counter && p.creatures) ||
        test.atLeast < 1
      ) {
        return failure(c, []);
      }
      return ok({ kind: 'thisWayAtLeast', what: 'countersPut', count: test.atLeast });
    }
    case 'putCountersThisTurn': {
      // CR 122.6, 603.4 (Lasting Tarfire): read from the turn log, for the controller of the ability.
      const blocked = missingFeatures(['condition:putCountersThisTurn']);
      if (blocked.length > 0) return failure(c, blocked);
      if (test.onType !== undefined && !(CARD_TYPES as readonly string[]).includes(test.onType)) {
        return failure(c, []);
      }
      return ok({
        kind: 'putCountersThisTurn',
        ...(test.counter === undefined ? {} : { counter: test.counter }),
        ...(test.onType === undefined ? {} : { onType: test.onType as CardType }),
      });
    }
    case 'cardsInGraveyard': {
      // CR 404.1 (stage P68, D-229): the number of cards in the graveyard of the controller.
      const blocked = missingFeatures(['condition:cardsInGraveyard']);
      if (blocked.length > 0) return failure(c, blocked);
      const { cmp, value } = test.compare;
      return ok({
        kind: 'cardsInGraveyard',
        compare: { cmp, value },
        ...(test.player === undefined ? {} : { player: test.player }),
      });
    }
    case 'cardsInLibrary': {
      // CR 401.1 (issue 25, D-331): the number of cards in the library of the controller.
      const blocked = missingFeatures(['condition:cardsInLibrary']);
      if (blocked.length > 0) return failure(c, blocked);
      const { cmp, value } = test.compare;
      return ok({ kind: 'cardsInLibrary', compare: { cmp, value } });
    }
    case 'aPlayerCardsInHand': {
      // CR 402.1, 603.4 (Lorehold group 3): "if a player has one or fewer cards in hand", any player in the game.
      const blocked = missingFeatures(['condition:aPlayerCardsInHand']);
      if (blocked.length > 0) return failure(c, blocked);
      const { cmp, value } = test.compare;
      return ok({ kind: 'aPlayerCardsInHand', compare: { cmp, value } });
    }
    case 'thePlayerIs': {
      // CR 603.2b, 102.2, 402.1, 608.2c (Fevered Visions): "the player" is the player the event of the trigger is about, read as the instruction comes up. A trigger that has
      // no such player (the lowering of the trigger says which "that player" it has) leaves the condition unread.
      if (ctx?.thatPlayer?.selector.kind !== 'triggerPlayer') return failure(c, []);
      const terms: Condition[] = [];
      if (test.opponent === true) {
        const blocked = missingFeatures(['condition:triggerPlayerIsOpponent']);
        if (blocked.length > 0) return failure(c, blocked);
        terms.push({ kind: 'triggerPlayerIsOpponent' });
      }
      if (test.cardsInHand !== undefined) {
        const blocked = missingFeatures(['condition:triggerPlayerStat']);
        if (blocked.length > 0) return failure(c, blocked);
        const { cmp, value } = test.cardsInHand;
        terms.push({ kind: 'triggerPlayerStat', stat: 'cardsInHand', compare: { cmp, value } });
      }
      const [only, ...more] = terms;
      if (only === undefined) return failure(c, []);
      return ok(more.length === 0 ? only : { kind: 'and', terms });
    }
    case 'paired': {
      // "~ is paired with another creature" (D-286, CR 702.95b): the permanent the ability belongs to is paired now; "it" is the source only in an
      // ability about the source itself (as for "it was kicked").
      const blocked = missingFeatures(['condition:paired']);
      if (blocked.length > 0) return failure(c, blocked);
      if (test.who === 'it' && !itIsSelf) return failure(c, []);
      // D-287: "it" is `~` only where the ability is about `~`; "Each creature you control has flying as long as it's paired" has no antecedent for "it", so it is unsupported.
      if (test.who === 'it' && ctx?.staticSubjectIsSelf !== true) return failure(c, []);
      // D-287 (CR 702.95b, 400.7, 603.4, 608.2h): the engine reads the pair of the permanent on the battlefield now and no last-known information, so the condition is
      // exact only where `derive` reads it, the "as long as" condition of a static ability of a permanent (`ctx.staticCondition`, set by `lowerStaticStatement` alone). In a
      // triggered ability the source may be gone when the intervening "if" is checked again as the ability resolves (a response killed it), an activated ability's cost may
      // remove it, a replacement works with no permanent: all unsupported, never a condition that is false for the wrong reason.
      if (
        ctx?.staticCondition !== true ||
        ctx.owner === 'spell' ||
        ctx.selfGone ||
        ctx.graveyardSource
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
      // "As long as enchanted creature is green" (D-427, CR 303.4b, 301.5a): the word says the kind of attachment the source is, which the face must be.
      if (test.via !== undefined && !(ctx?.faceSubtypes ?? []).includes(HOST_KIND[test.via])) {
        return failure(c, []);
      }
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
    case 'otherAttachedToHost': {
      // "As long as another Aura is attached to enchanted creature" (D-427, CR 303.4, 301.5, 701.3): the number of other permanents of the kind attached to the
      // permanent the source is attached to is at least one. The word of the condition says the kind of attachment the source is, which the face must be.
      const blocked = missingFeatures([
        'condition:amountIs',
        'amount:countOf',
        'selector:attachedTo',
      ]);
      if (blocked.length > 0) return failure(c, blocked);
      if (!(ctx?.faceSubtypes ?? []).includes(HOST_KIND[test.via])) return failure(c, []);
      const noun: IrNoun = {
        kind: 'noun',
        det: 'each',
        filter: test.attachment,
        upTo: false,
        plural: false,
        other: false,
        span: c.span,
        rule: c.rule,
      };
      const attachment = lowerFilter(noun);
      if (!attachment.ok) return attachment;
      return ok({
        kind: 'amountIs',
        amount: {
          kind: 'countOf',
          filter: { ...attachment.value, other: true, attachedTo: { kind: 'host' } },
        },
        compare: { cmp: 'atLeast', value: 1 },
      });
    }
    case 'thisEnteredThisTurn': {
      // "As long as ~ entered this turn" (D-427, CR 400.7): the permanent itself entered the battlefield during this turn, read from the turn log.
      const blocked = missingFeatures(['condition:thisEnteredThisTurn']);
      return blocked.length > 0 ? failure(c, blocked) : ok({ kind: 'thisEnteredThisTurn' });
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
    case 'amountIsPrime': {
      // "You control a prime number of lands" (Zimone, All-Questioning): a count of the game, which is or is not a prime number, read as the ability triggers and as it resolves (CR 603.4).
      const blocked = missingFeatures(['condition:amountIsPrime']);
      if (blocked.length > 0) return failure(c, blocked);
      const amount = lowerAmount(test.amount, ctx ?? newContext('ability', []), c.rule);
      if (!amount.ok) return amount;
      return ok({ kind: 'amountIsPrime', amount: amount.value });
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
      // "it gets +2/+0 until end of turn if it's attacking one of your opponents" (issue 89, CR 303.4b, 508.1b): "it" is the permanent the Aura or Equipment is attached to.
      if (test.who.det === 'enchanted' || test.who.det === 'equipped') {
        const hostBlocked = missingFeatures(['selector:attached']);
        if (hostBlocked.length > 0) return failure(c, hostBlocked);
        const matched = lowerFilter({ ...test.who, det: 'a', filter: test.filter });
        if (!matched.ok) return matched;
        return ok({ kind: 'objectMatches', of: { kind: 'attached' }, filter: matched.value });
      }
      // "If that land is a Plains" (stage P33, D-150): the permanent whose event triggered the ability, as it is now.
      if (test.who.det === 'triggerSubject') {
        const subject = missingFeatures(['selector:triggerSubject']);
        if (subject.length > 0) return failure(c, subject);
        const matched = lowerFilter({ ...test.who, det: 'a', filter: test.filter });
        if (!matched.ok) return matched;
        return ok({ kind: 'objectMatches', of: { kind: 'triggerSubject' }, filter: matched.value });
      }
      // "When ~ dies, if it was a creature, ..." (Enduring Tenacity, CR 603.4, 603.10a, 113.7a): the intervening "if" of an ability about the source itself, whose "it" is the
      // source, read as it last was once it has left the battlefield: the engine's `thisMatches`.
      if (
        (test.who.ref === undefined || test.who.ref === 'self') &&
        // "She was a nonland creature" (Princess Yue): the pronoun of a card the text names, said of the permanent with the ability, as "it" is.
        /^(?:it|she|he)$/iu.test(test.who.filter.raw) &&
        itIsSelf &&
        ctx?.interveningCondition === true
      ) {
        const thisBlocked = missingFeatures(['condition:thisMatches']);
        if (thisBlocked.length > 0) return failure(c, thisBlocked);
        const matched = lowerFilter({ ...test.who, det: 'self', filter: test.filter });
        return matched.ok ? ok({ kind: 'thisMatches', filter: matched.value }) : matched;
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
      // Conformer Shuriken (CR 208.1, 608.2c): "If that creature has greater power than ~, ... equal to the difference": the instruction after it counts the gap between the two powers.
      if (filter.value.powerGreaterThanSource === true) at.comparedPowerOf = of;
      return ok({ kind: 'objectMatches', of, filter: filter.value });
    }
    case 'manaValueAtMostAmount': {
      // CR 202.3, 608.2c (Meren of Clan Nel Toth): the mana value of the target an earlier instruction of the text named (or the object it moved), against an amount read as the instruction runs.
      const blocked = missingFeatures(['condition:manaValueAtMostAmount']);
      if (blocked.length > 0) return failure(c, blocked);
      const at = ctx ?? newContext('ability', []);
      const id = test.who.ref ?? '';
      if (id !== 'moved' && (!/^t\d+$/.test(id) || !at.targets.some((t) => t.id === id))) {
        return failure(c, []);
      }
      const amount = lowerAmount(test.amount, at, c.rule);
      if (!amount.ok) return amount;
      const of =
        id === 'moved' || at.movedOnto === id
          ? ({ kind: 'moved' } as const)
          : ({ kind: 'target', id } as const);
      return ok({ kind: 'manaValueAtMostAmount', of, amount: amount.value });
    }
    case 'milledThisWay': {
      // Issue 159 (CR 608.2c, 701.17a): the cards the mill before it put into the graveyard, any of them: the clause before must be a mill of your own library (`ctx.milled`).
      const blocked = missingFeatures(['condition:objectMatches']);
      if (blocked.length > 0) return failure(c, blocked);
      if (ctx?.milled !== true) return failure(c, []);
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
        ? ok({ kind: 'objectMatches', of: { kind: 'moved' }, filter: filter.value, any: true })
        : filter;
    }
    case 'exiledThisWay':
    case 'putThisWay': {
      // "If you put a Cave onto the battlefield this way" (stage P37, D-180, CR 608.2c, 400.7j): the object the instruction before it moved, as it is
      // (`moved`); `validateCard` refuses it where no instruction before it moves a card.
      const blocked = missingFeatures(['condition:objectMatches']);
      if (blocked.length > 0) return failure(c, blocked);
      // D-412 (CR 608.2c): "into your hand this way" follows a move to the hand and "onto the battlefield this way" does not: the words must say what the move before did.
      if (test.kind === 'exiledThisWay') {
        if (ctx?.exiledRef === null || ctx?.exiledRef === undefined) return failure(c, []);
      } else if ((test.zone === 'hand') !== (ctx?.movedToHand === true)) {
        return failure(c, []);
      }
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
      // D-412 (Danitha deck group 2): "If you put a Town card into your hand this way": the card is in the hand it was put into.
      return filter.ok
        ? ok({
            kind: 'objectMatches',
            of: { kind: 'moved' },
            filter: filter.value,
            ...(test.kind === 'exiledThisWay'
              ? { inZone: 'exile' as const }
              : test.zone === 'hand'
                ? { inZone: 'hand' as const }
                : {}),
          })
        : filter;
    }
    case 'giftPromised': {
      // CR 702.174k (stage P30, D-135): the spell was cast with its gift cost paid; the face has to have the keyword.
      const blocked = missingFeatures(['condition:giftPromised']);
      return blocked.length > 0 ? failure(c, blocked) : ok({ kind: 'giftPromised' });
    }
    case 'wasCast': {
      // CR 601.2a, 603.4: "if you cast it" is read only as the intervening "if" of a trigger about the source itself, where "it" is the permanent the spell became.
      const blocked = missingFeatures(['condition:wasCast']);
      if (blocked.length > 0) return failure(c, blocked);
      if (!itIsSelf || ctx?.interveningCondition !== true) return failure(c, []);
      return ok({ kind: 'wasCast' });
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
    case 'attackersAtYou': {
      // CR 508.1b, 603.4 (D-643): read from the declaration of the `attackBatch` trigger the ability belongs to, as its intervening "if"; `validateCard` refuses it anywhere else.
      const blocked = missingFeatures(['condition:attackersAtYouAtLeast']);
      return blocked.length > 0
        ? failure(c, blocked)
        : ok({ kind: 'attackersAtYouAtLeast', count: test.atLeast });
    }
    case 'attackedHasMoreLife': {
      // CR 603.4, 508.6 (D-653): read for the player the `playerAttacksOpponent` trigger of the ability is about, as its intervening "if"; `validateCard` refuses it anywhere else.
      const blocked = missingFeatures(['condition:attackedHasMoreLifeThanOtherOpponent']);
      return blocked.length > 0
        ? failure(c, blocked)
        : ok({ kind: 'attackedHasMoreLifeThanOtherOpponent' });
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
    case 'thisIsRingBearer': {
      // CR 701.54e (Frodo, Adventurous Hobbit): the permanent the ability belongs to is the Ring-bearer of its controller.
      const blocked = missingFeatures(['condition:thisIsRingBearer']);
      return blocked.length > 0 ? failure(c, blocked) : ok({ kind: 'thisIsRingBearer' });
    }
    case 'ringTemptedAtLeast': {
      // CR 701.54c (Frodo, Adventurous Hobbit): the times the Ring has tempted the controller.
      const blocked = missingFeatures(['condition:ringTemptedAtLeast']);
      return blocked.length > 0
        ? failure(c, blocked)
        : ok({ kind: 'ringTemptedAtLeast', times: test.times });
    }
    case 'manaSpentAtLeast': {
      // CR 601.2h (stage P49, D-206): the mana spent on the spell that caused the trigger.
      const test = c.test;
      if (test.kind !== 'manaSpentAtLeast') return failure(c, []);
      // Issue 25: "that spell" is the spell that caused the trigger, read from its `triggerSubject`; in any other text no spell is named, so it is not lowered.
      if (test.ofTriggerSpell === true && ctx?.castTrigger !== true) return failure(c, []);
      const blocked = missingFeatures(['condition:manaSpentAtLeast']);
      return blocked.length > 0
        ? failure(c, blocked)
        : ok({ kind: 'manaSpentAtLeast', count: test.count });
    }
    case 'movedTotalManaValue': {
      // CR 202.3, 608.2c (D-661): the cards an instruction before this one exiled (`moved`), added up; no other cards are named.
      if (ctx?.lastEffectKind !== 'exileTopAnyNumber' && ctx?.lastEffectKind !== 'exileTop') {
        return failure(c, []);
      }
      const blocked = missingFeatures(['condition:movedTotalManaValue']);
      if (blocked.length > 0) return failure(c, blocked);
      return ok({
        kind: 'movedTotalManaValue',
        compare: { cmp: 'atMost', value: test.atMost },
      });
    }
    case 'movedShareAllCardTypes': {
      // CR 205.2a, 608.2c (Demonic Covenant): the cards an instruction before this one milled (`moved`); no other cards are named.
      if (ctx?.lastEffectKind !== 'mill') return failure(c, []);
      const blocked = missingFeatures(['condition:movedShareAllCardTypes']);
      if (blocked.length > 0) return failure(c, blocked);
      return ok({ kind: 'movedShareAllCardTypes' });
    }
    case 'triggerSpellManaValue': {
      // CR 202.3, 608.2h (D-646): "that spell" is the spell that caused the trigger, read as it is on the stack or as it last was; in any other text no spell is named, so it is not lowered.
      if (ctx?.castTrigger !== true) return failure(c, []);
      const blocked = missingFeatures(['condition:objectMatches', 'selector:triggerSubject']);
      if (blocked.length > 0) return failure(c, blocked);
      return ok({
        kind: 'objectMatches',
        of: { kind: 'triggerSubject' },
        filter: { manaValue: { cmp: 'atLeast', value: test.atLeast } },
      });
    }
    case 'cardLeftYourGraveyard': {
      // CR 400.7 (stage P49, D-206): the turn log of cards that left a graveyard.
      const blocked = missingFeatures(['condition:cardLeftYourGraveyard']);
      return blocked.length > 0 ? failure(c, blocked) : ok({ kind: 'cardLeftYourGraveyard' });
    }
    case 'descendedThisTurn': {
      // Ahoy Mateys deck, group 5: the turn log of permanent cards put into a graveyard.
      const blocked = missingFeatures(['condition:descendedThisTurn']);
      return blocked.length > 0 ? failure(c, blocked) : ok({ kind: 'descendedThisTurn' });
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
      // Transpose: "If this spell was cast from your hand" is the spell's own text (the engine reads the zone the spell on the stack was cast from).
      if ((test.zone === 'hand' || test.zone === 'exile') && ctx?.owner !== 'spell') {
        return failure(c, []);
      }
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
    case 'yourCombatPhase': {
      // CR 506.1 (issue 144): the combat phase of the controller's turn, as the instruction runs.
      const blocked = missingFeatures(['condition:yourCombatPhase']);
      return blocked.length > 0
        ? failure(c, blocked)
        : ok({ kind: 'yourCombatPhase', ...(test.first === true ? { first: true as const } : {}) });
    }
    case 'playerDealtDamage': {
      // CR 120.3 (stage P34, D-152): the damage the player was dealt by any source this turn.
      const blocked = missingFeatures(['condition:playerDealtDamage']);
      return blocked.length > 0
        ? failure(c, blocked)
        : ok({ kind: 'playerDealtDamage', player: test.who, atLeast: test.atLeast });
    }
    case 'abilityResolvedTimes': {
      // CR 608.2c (Galadriel deck, group 1): read as the instruction comes up, in the effect of a triggered ability.
      const blocked = missingFeatures(['condition:abilityResolvedTimes']);
      return blocked.length > 0
        ? failure(c, blocked)
        : ok({ kind: 'abilityResolvedTimes', times: test.times });
    }
    case 'ringBearerChosen': {
      // CR 701.54a, 603.4 (Galadriel deck, group 1): the intervening "if" of "whenever the Ring tempts you"; the creature is "other than ~" (the permanent with the ability).
      const blocked = missingFeatures(['condition:ringBearerChosen']);
      return blocked.length > 0
        ? failure(c, blocked)
        : ok({ kind: 'ringBearerChosen', other: true });
    }
    case 'costContainsX':
    case 'notDeclaredAttacker':
    case 'damageDealtByType':
    case 'enteredFromGraveyard':
      // D-510 (CR 508.1f): "if it isn't being declared as an attacker" is part of the event of a "becomes tapped" trigger, which the lowering of the trigger reads (`lowerTriggered`);
      // as a condition of anything else there is nothing to read it from.
      return failure(c, []);
    case 'combatDamagedBy': {
      // CR 120.2a (issue 41, D-475): the engine's turn log keeps the card types, the subtypes and the controller of the source of combat damage to a player.
      const blocked = missingFeatures(['condition:combatDamagedBy']);
      if (blocked.length > 0) return failure(c, blocked);
      const test = c.test;
      if (test.kind !== 'combatDamagedBy') return failure(c, []);
      const filter = lowerFilter(test.noun);
      if (!filter.ok) return filter;
      const { types, subtypes, controller, ...rest } = filter.value;
      if (Object.keys(rest).length > 0) return failure(c, []);
      return ok({
        kind: 'combatDamagedBy',
        filter: {
          ...(types === undefined ? {} : { types }),
          ...(subtypes === undefined ? {} : { subtypes }),
          ...(controller === undefined ? {} : { controller }),
        },
      });
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
        ...(test.subtypes === undefined ? {} : { subtypes: [...test.subtypes] }),
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
    case 'searchedThisWay': {
      // "If you search your library this way" (Lorehold group 1, CR 608.2c, 701.23a): what a search before it in the same text did; with no search lowered before it there is nothing to ask.
      const blocked = missingFeatures(['condition:thisWayAtLeast']);
      if (blocked.length > 0) return failure(c, blocked);
      if (ctx?.didSearch !== true) return failure(c, []);
      return ok({ kind: 'thisWayAtLeast', what: 'searched', count: 1 });
    }
    case 'destroyedThisWay': {
      // "If a creature is destroyed this way" (Death Toll deck, CR 608.2c, 701.8): what a destroy before it in the same text did. The engine counts the permanents the destroy really
      // destroyed (an indestructible one, or one a regeneration shield saved, is not counted); the sentence that offers the destroy checks that the permanents it names are creatures.
      const blocked = missingFeatures(['condition:thisWayAtLeast']);
      if (blocked.length > 0) return failure(c, blocked);
      return ok({ kind: 'thisWayAtLeast', what: 'destroyed', count: 1 });
    }
    case 'diesThisWay': {
      // "If that creature dies this way" (Saw in Half, CR 700.4, 608.2c): the creature a destroy before it in the same text named, which must be a target of the text.
      const blocked = missingFeatures(['condition:diedThisWay']);
      if (blocked.length > 0) return failure(c, blocked);
      const at = ctx ?? newContext('ability', []);
      const id = test.who.ref ?? '';
      if (!/^t\d+$/.test(id) || !at.targets.some((t) => t.id === id)) return failure(c, []);
      return ok({ kind: 'diedThisWay', of: { kind: 'target', id } });
    }
    case 'discardedSpellThisWay': {
      // "If you discarded an instant or sorcery card this way" (D-358, CR 608.2c): what a discard before it in the same text did.
      const blocked = missingFeatures(['condition:thisWayAtLeast']);
      if (blocked.length > 0) return failure(c, blocked);
      return ok({ kind: 'thisWayAtLeast', what: 'discardedInstantOrSorcery', count: 1 });
    }
    case 'unlessReturn':
      // "... unless you return a land you control to its owner's hand" belongs to the sentence of one instruction, which the lowering of the sentences reads (D-258).
      return failure(c, []);
    case 'notPutOntoBattlefield':
      // "If you don't put it onto the battlefield, put it into your hand" belongs to the pair of sentences of an offer to put a card onto the battlefield, which the lowering of the sentences reads (D-403).
      return failure(c, []);
    case 'youDont':
      // "If you don't, put a +1/+1 counter on ~" belongs to the pair of sentences of a choice from among the cards a mill moved, which the lowering of the sentences reads (D-411).
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
  'condition:opponentPoisonAtLeast',
  'condition:kicked',
  'condition:castInOwnMainPhase',
  'condition:additionalCostPaid',
  'condition:xAtLeast',
  'condition:controlCommander',
  'condition:lifeTotal',
  'condition:cardsInGraveyard',
  'condition:cardsInLibrary',
  'condition:aPlayerCardsInHand',
  'condition:subjectControllerHasMore',
  'condition:subjectControlledByYou',
  'condition:subjectStat',
  'condition:subjectGreaterThanEach',
  'condition:putCountersThisTurn',
  'condition:triggerPlayerHasMore',
  'condition:triggerPlayerTurn',
  'condition:triggerPlayerIsOpponent',
  'condition:triggerPlayerStat',
  'condition:thisMatches',
  'condition:escaped',
  'condition:and',
  'condition:or',
  'condition:not',
  'condition:didPrevious',
  'condition:thisWayAtLeast',
  'condition:unlessPays',
  'condition:amountIs',
  'condition:amountIsPrime',
  'condition:playerHasDesignation',
  'condition:objectMatches',
  'condition:manaValueAtMostAmount',
  'condition:giftPromised',
  'condition:wasCast',
  'condition:opponentControlsAtLeast',
  'condition:controlsGreatest',
  'condition:attackersAttackedYou',
  'condition:attackersAtYouAtLeast',
  'condition:attackedHasMoreLifeThanOtherOpponent',
  'condition:sameNameAtLeast',
  'condition:attackingMostLife',
  'condition:attackersTotalPower',
  'condition:playerDealtDamage',
  'condition:lifeGainedThisTurn',
  'condition:lifeGainedAndLostThisTurn',
  'condition:aPlayerLostLifeThisTurn',
  'condition:spellsCastThisTurn',
  'condition:spellsCastLastTurn',
  'condition:attackedWithCreaturesThisTurn',
  'condition:dieResult',
  'condition:thisInYourGraveyard',
  'condition:thisOnBattlefield',
  'condition:ownsAndControlsNamed',
  'condition:enteredThisTurn',
  'condition:yourMainPhase',
  'condition:yourCombatPhase',
  'condition:thisAttackedThisTurn',
  'condition:yourTurn',
  'condition:manaSpentAtLeast',
  'condition:cardLeftYourGraveyard',
  'condition:descendedThisTurn',
  'condition:castFromZone',
  'condition:spellTargets',
  'condition:controlsRingBearer',
  'condition:thisIsRingBearer',
  'condition:ringTemptedAtLeast',
  'condition:paired',
  // D-427 (Danitha group 3): "as long as ~ entered this turn".
  'condition:thisEnteredThisTurn',
  // D-475 (Gisa deck group 1): "a player was dealt combat damage by a Zombie this turn".
  'condition:combatDamagedBy',
  // Galadriel deck group 1: "this is the second time this ability has resolved this turn", "you chose a creature other than ~ as your Ring-bearer".
  'condition:abilityResolvedTimes',
  'condition:ringBearerChosen',
];
