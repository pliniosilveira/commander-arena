/**
 * Triggered abilities (CR 603) and static abilities (CR 604): the IR of a `When`/`Whenever`/`At`
 * line to the engine's `triggered` ability, and a statement like "You have no maximum hand size"
 * to a `static` one. Each declares the engine features it needs and is gated before anything is
 * built, like every lowering.
 */
import type {
  Ability,
  Condition,
  Effect,
  ObjectFilter,
  Trigger,
  TriggerStep,
  TriggerSubject,
} from '@commander-arena/engine';
import {
  type IrAbility,
  type IrAmount,
  type IrClause,
  type IrCondition,
  type IrModes,
  type IrNoun,
  type IrTrigger,
  isIrAmount,
  nounsOfClause,
} from '../ir/types';
import { lowerCondition } from './conditions';
import { type FeatureRef, missingFeatures } from './features';
import { lowerModes, MODAL_NEEDS, NO_EFFECT } from './modal';
import { lowerFilter } from './nouns';
import { lowerMayInstead, lowerSentences } from './sentences';
import type { LowerContext, LowerFailure, LowerResult } from './types';

type Triggered = Extract<IrAbility, { kind: 'triggered' }>;

/** The verbs whose object is a permanent that is on the battlefield (counters and the continuous effects, D-133). */
const ON_A_PERMANENT: ReadonlySet<string> = new Set([
  'addCounters',
  'modifyPt',
  'setPt',
  'grantKeyword',
  'becomes',
  'loseAllAbilities',
  'restrict',
]);
type At = { readonly span: { start: number; end: number }; readonly rule: string };

function failure(node: At, needs: readonly FeatureRef[] = []): LowerFailure {
  return { ok: false, needs, at: node.span, rule: node.rule };
}

/** The trigger event words the rules produce, and the engine trigger each one is. */
const TRIGGER_KIND = {
  enters: 'entersBattlefield',
  dies: 'dies',
  attacks: 'attacks',
  becomesTapped: 'becomesTapped',
  becomesUntapped: 'becomesUntapped',
  blocks: 'blocks',
  becomesBlocked: 'becomesBlocked',
  landfall: 'landfall',
  upkeep: 'upkeep',
  endStep: 'endStep',
  sacrifice: 'permanentSacrificed',
  becomesTarget: 'becomesTarget',
} as const satisfies Record<string, Trigger['kind']>;

/**
 * What the events that can be about the permanent an Aura or Equipment is attached to may name
 * (D-111): the six kinds of `TriggerSubject`. An enters trigger cannot (a permanent is not attached as
 * it enters).
 */
const ATTACHED_EVENTS: ReadonlySet<string> = new Set([
  'dealtDamage',
  'dies',
  'attacks',
  'blocks',
  'becomesBlocked',
  'becomesTapped',
  'becomesUntapped',
  'becomesTarget',
  'dealsCombatDamage',
  'leavesBattlefield',
]);

/**
 * Of those, the ones a permanent that is not a creature could also cause: a land enchanted by an
 * "Enchant permanent" Aura becomes tapped, is targeted, leaves the battlefield. The engine's `attached`
 * subject does not check the type of the host, so "enchanted creature" is read for them only when it is
 * certain to be a creature: an Equipment's host always is (CR 301.5).
 */
const ANY_HOST_EVENTS: ReadonlySet<string> = new Set([
  'becomesTapped',
  'becomesUntapped',
  'becomesTarget',
  'leavesBattlefield',
]);

/**
 * "Equipped creature", "enchanted creature" as a trigger's subject: the permanent the source is attached
 * to. "Enchanted" needs an Aura and "equipped" an Equipment (CR 303.4b, 301.5a); the host is a creature,
 * with no supertype to check, because the engine's subject says nothing more.
 */
function attachedWhat(noun: IrNoun, event: string, ctx: LowerContext): LowerResult<TriggerSubject> {
  const needed = noun.det === 'enchanted' ? 'Aura' : 'Equipment';
  const types = noun.filter.types ?? [];
  const onlyCreature = types.length === 1 && types[0] === 'creature';
  if (
    !ATTACHED_EVENTS.has(event) ||
    !ctx.faceSubtypes.includes(needed) ||
    !onlyCreature ||
    (noun.filter.supertypes?.length ?? 0) > 0 ||
    (noun.det === 'enchanted' && ANY_HOST_EVENTS.has(event))
  ) {
    return failure(noun);
  }
  return { ok: true, value: { kind: 'attached' }, rule: noun.rule };
}

/**
 * "~" is `this`; "equipped creature" is `attached`; anything else is the filter of the objects that may
 * trigger it (CR 603.2).
 */
function whatOf(t: IrTrigger, ctx: LowerContext): LowerResult<TriggerSubject> {
  const subject = t.subject;
  if (subject === undefined) return failure(t);
  if (subject.det === 'self') return { ok: true, value: { kind: 'this' }, rule: subject.rule };
  if (subject.det === 'enchanted' || subject.det === 'equipped') {
    return attachedWhat(subject, t.event, ctx);
  }
  if (subject.det !== 'a') return failure(subject);
  return lowerFilter(subject);
}

/** An enters trigger names `this` or a filter; the subject cannot be attached to anything yet. */
function entersWhat(t: IrTrigger, ctx: LowerContext): LowerResult<{ kind: 'this' } | ObjectFilter> {
  const what = whatOf(t, ctx);
  if (!what.ok) return what;
  return 'kind' in what.value && what.value.kind === 'attached'
    ? failure(t)
    : { ok: true, value: what.value as { kind: 'this' } | ObjectFilter, rule: what.rule };
}

/** Whose turn "your", "each" and "each opponent\'s" name (CR 603.2b: at the beginning of that step). */
function whoseOf(actor: IrNoun | undefined): 'you' | 'each' | 'opponent' | null {
  if (actor?.det === 'you') return 'you';
  if (actor?.det === 'eachPlayer') return 'each';
  if (actor?.det === 'eachOpponent') return 'opponent';
  return null;
}

/** The player a trigger is about, relative to the controller of the ability. */
function whoOf(actor: IrNoun | undefined): 'you' | 'opponent' | 'any' | null {
  if (actor?.det === 'you') return 'you';
  if (actor?.det === 'eachOpponent') return 'opponent';
  if (actor?.det === 'eachPlayer') return 'any';
  return null;
}

/**
 * A chapter symbol (CR 714.2): the engine's `chapter` trigger is a range, "I, II" being from 1 to 2
 * (CR 714.2c: it means the same as one ability for each numeral). A list that is not the
 * consecutive numerals in order ("I, III", "II, I", "I, I") has no range, so it is recognised and
 * not run rather than read as a different Saga.
 */
function lowerChapter(t: IrTrigger): LowerResult<Trigger> {
  const chapters = t.chapters ?? [];
  const [from] = chapters;
  if (from === undefined || chapters.some((n, i) => n !== from + i)) return failure(t);
  return {
    ok: true,
    value: { kind: 'chapter', from, to: from + chapters.length - 1 },
    rule: t.rule,
  };
}

function lowerTrigger(t: IrTrigger, ctx: LowerContext): LowerResult<Trigger> {
  const ok = (value: Trigger): LowerResult<Trigger> => ({ ok: true, value, rule: t.rule });
  switch (t.event) {
    case 'enters': {
      const what = entersWhat(t, ctx);
      if (!what.ok) return what;
      // "enters untapped", "enters tapped" (stage P30, D-135, CR 603.6a): how it entered, as the event is noticed.
      return ok({
        kind: 'entersBattlefield',
        what: what.value,
        ...(t.entersTapped === undefined ? {} : { tapped: t.entersTapped }),
      });
    }
    case 'attacks': {
      const what = whatOf(t, ctx);
      if (!what.ok) return what;
      // CR 508.1b: "attacks you or a planeswalker you control" is a feature of the engine's `attacks` trigger (D-133).
      if (t.at !== undefined) {
        const blocked = missingFeatures(['trigger:attacksAt']);
        return blocked.length > 0
          ? failure(t, blocked)
          : ok({ kind: 'attacks', what: what.value, at: t.at });
      }
      // CR 508.1, 500.8 (stage P34, D-152): "attacks for the first time each turn", the first declaration of this creature in the turn.
      if (t.firstEachTurn === true) {
        return t.alone === true
          ? failure(t)
          : ok({ kind: 'attacks', what: what.value, firstTimeEachTurn: true });
      }
      // CR 506.5: "attacks alone" is a feature of the engine's `attacks` trigger (D-110).
      if (t.alone !== true) return ok({ kind: 'attacks', what: what.value });
      const blocked = missingFeatures(['trigger:alone']);
      return blocked.length > 0
        ? failure(t, blocked)
        : ok({ kind: 'attacks', what: what.value, alone: true });
    }
    case 'dealtDamage': {
      // CR 120.3, 603.2g (D-133): once for each source that damages the permanent.
      const what = whatOf(t, ctx);
      return what.ok
        ? ok({
            kind: 'dealtDamage',
            what: what.value,
            ...(t.combat === true ? { combat: true } : {}),
          })
        : what;
    }
    case 'dies':
    case 'blocks':
    case 'becomesBlocked':
    case 'becomesTapped':
    case 'becomesUntapped': {
      const what = whatOf(t, ctx);
      if (!what.ok) return what;
      return ok({ kind: TRIGGER_KIND[t.event], what: what.value });
    }
    case 'leavesBattlefield': {
      const what = whatOf(t, ctx);
      if (!what.ok) return what;
      // "dies or is put into exile from the battlefield" (stage P30, D-135, CR 700.4): the zones it went to.
      const [first, second] = t.to ?? [];
      const to =
        first === undefined ? {} : second === undefined ? { to: first } : { to: [first, second] };
      return ok({ kind: 'leavesBattlefield', what: what.value, ...to });
    }
    case 'dealsCombatDamage': {
      const what = whatOf(t, ctx);
      return what.ok
        ? ok({ kind: 'dealsCombatDamage', what: what.value, to: t.damaged ?? 'any' })
        : what;
    }
    case 'combatDamageBatch': {
      // "Whenever one or more artifact creatures you control deal combat damage to a player" (stage P31, D-140, CR 603.2c): one trigger
      // for each player damaged in one damage event, the creatures named by a filter of the controller's permanents.
      if (t.subject === undefined || (t.damaged !== 'player' && t.damaged !== 'opponent')) {
        return failure(t);
      }
      const filter = lowerFilter(t.subject);
      if (!filter.ok) return filter;
      return ok({
        kind: 'combatDamageBatch',
        what: filter.value,
        to: t.damaged,
        ...(t.atLeast === undefined ? {} : { atLeast: t.atLeast }),
      });
    }
    case 'tappedForMana': {
      // "Whenever you tap a permanent for {C}" (stage P31, D-140, CR 106.12, 605.1b): a mana ability of a permanent the filter matches,
      // activated with {T} by the controller, and the type of mana it made when the text names one.
      if (t.actor?.det !== 'you' || t.subject === undefined) return failure(t);
      const filter = lowerFilter(t.subject);
      if (!filter.ok) return filter;
      const mana = t.mana as 'W' | 'U' | 'B' | 'R' | 'G' | 'C' | undefined;
      return ok({
        kind: 'tappedForMana',
        what: filter.value,
        by: 'you',
        ...(mana === undefined ? {} : { mana }),
      });
    }
    case 'tapsForMana': {
      // "Whenever an opponent taps an artifact for mana" (stage P42, D-190, CR 106.12, 603.2): an ability that uses the stack, for each time a player
      // activates a mana ability with {T} of a permanent the filter matches; the player is relative to the controller.
      const who = whoOf(t.actor);
      if (who === null || t.subject === undefined) return failure(t);
      const filter = lowerFilter(t.subject);
      if (!filter.ok) return filter;
      return ok({ kind: 'tapsForMana', who, what: filter.value });
    }
    case 'state': {
      // "When there are four or more page counters on ~" (stage P31, D-140, CR 603.8): the game state, read for the controller with
      // the permanent as the source.
      if (t.condition === undefined) return failure(t);
      const condition = lowerCondition(t.condition, true, ctx);
      if (!condition.ok) return condition;
      return ok({ kind: 'state', condition: condition.value });
    }
    case 'landfall':
      return ok({ kind: 'landfall' });
    case 'cycled': {
      // "When you cycle this card" (stage P37, D-180, CR 702.29c): the card with the ability, which the engine finds in the zone it wound up in.
      if (t.actor?.det !== 'you' || t.subject?.det !== 'self') return failure(t);
      const blocked = missingFeatures(['trigger:cycled']);
      return blocked.length > 0 ? failure(t, blocked) : ok({ kind: 'cycled' });
    }
    case 'ringTempted': {
      // "Whenever the Ring tempts you" (stage P45, D-197, CR 701.54d): the controller of the ability is the player tempted.
      const blocked = missingFeatures(['trigger:ringTempted']);
      return blocked.length > 0 ? failure(t, blocked) : ok({ kind: 'ringTempted' });
    }
    case 'castSelf': {
      // "When you cast this spell" (stage P39, D-184, CR 601.2i, 603.2): the spell's own ability, which works while it is on the stack and
      // triggers for that spell only (`self`; the caster is the controller of the ability, the filter says a spell).
      if (t.actor?.det !== 'you' || t.subject?.det !== 'self') return failure(t);
      const blocked = missingFeatures(['trigger:castSpell']);
      return blocked.length > 0
        ? failure(t, blocked)
        : ok({ kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you', self: true });
    }
    case 'becomesTarget': {
      // "an opponent controls" and "you control" say whose spell or ability, relative to this ability's
      // controller (CR 702.21a); neither says any.
      const by =
        t.actor === undefined
          ? 'any'
          : t.actor.det === 'eachOpponent'
            ? 'opponent'
            : t.actor.det === 'you'
              ? 'you'
              : null;
      const what = whatOf(t, ctx);
      if (by === null || !what.ok) return what.ok ? failure(t) : what;
      if (t.spellOnly === true) {
        const blocked = missingFeatures(['trigger:becomesTargetSpell']);
        if (blocked.length > 0) return { ...failure(t), needs: blocked };
      }
      return ok({
        kind: 'becomesTarget',
        what: what.value,
        by,
        ...(t.spellOnly === true ? { spellOnly: true as const } : {}),
      });
    }
    case 'upkeep':
    case 'endStep': {
      const whose = whoseOf(t.actor);
      if (whose === null) return failure(t);
      // The engine's `upkeep` and `endStep` are for you and each player; another player's turn is `step`.
      return whose === 'opponent'
        ? ok({ kind: 'step', step: t.event, whose })
        : ok({ kind: TRIGGER_KIND[t.event], whose });
    }
    case 'step': {
      const whose = whoseOf(t.actor);
      if (whose === null || t.step === undefined) return failure(t);
      return ok({ kind: 'step', step: t.step satisfies TriggerStep, whose });
    }
    case 'diesBatch': {
      // "Whenever one or more other creatures and/or artifacts you control die" (stage P49, D-206, CR 603.10a, 603.2c).
      if (t.subject === undefined) return failure(t);
      const filter = lowerFilter(t.subject);
      if (!filter.ok) return filter;
      const missing = missingFeatures(['trigger:diesBatch']);
      if (missing.length > 0) return failure(t, missing);
      return ok({ kind: 'diesBatch', what: filter.value });
    }
    case 'discarded': {
      // "Whenever you discard a card" (stage P49, D-206, CR 701.9a): the player is relative to the controller.
      const who = whoOf(t.actor);
      if (who === null) return failure(t);
      return ok({ kind: 'discarded', who });
    }
    case 'drawn': {
      const who = whoOf(t.actor);
      if (who === null) return failure(t);
      return ok({ kind: 'drawn', who, ...(t.nth === undefined ? {} : { nth: t.nth }) });
    }
    case 'chapter':
      return lowerChapter(t);
    case 'lifeGained': {
      // "Whenever you gain life [for the first time each turn]" (stage P33, D-150, CR 119.9): the player is relative to the controller.
      const who = whoOf(t.actor);
      if (who === null) return failure(t);
      return ok({
        kind: 'lifeGained',
        who,
        ...(t.firstEachTurn === true ? { firstEachTurn: true as const } : {}),
      });
    }
    case 'countersAdded': {
      // "Whenever you put one or more +1/+1 counters on ~" (stage P33, D-150, CR 122.6): once for one instance of putting.
      const what = whatOf(t, ctx);
      if (!what.ok) return what;
      if (t.by === undefined) return failure(t);
      return ok({
        kind: 'countersAdded',
        what: what.value,
        ...(t.counter === undefined ? {} : { counter: t.counter }),
        by: t.by,
      });
    }
    case 'attackBatch': {
      // "Whenever you attack with two or more creatures" (stage P33, D-150, CR 508.1): once for the declaration; "another player" is
      // an opponent of the controller.
      const who = whoOf(t.actor);
      if (who === null || t.atLeast === undefined) return failure(t);
      let what: ObjectFilter | undefined;
      if (t.subject !== undefined) {
        const filter = lowerFilter(t.subject);
        if (!filter.ok) return filter;
        what = filter.value;
      }
      return ok({
        kind: 'attackBatch',
        who,
        atLeast: t.atLeast,
        ...(what === undefined ? {} : { what }),
      });
    }
    case 'entersBatch': {
      // "Whenever one or more tokens you control enter" (stage P65, D-218, CR 603.2c, 603.6a).
      if (t.subject === undefined) return failure(t);
      const filter = lowerFilter(t.subject);
      if (!filter.ok) return filter;
      const missing = missingFeatures(['trigger:entersBatch']);
      if (missing.length > 0) return failure(t, missing);
      return ok({ kind: 'entersBatch', what: filter.value });
    }
    case 'castOrCopy': {
      // "Whenever you cast or copy an instant or sorcery spell" (stage P65, D-218, CR 707.10): the cast trigger of the controller, a copy too.
      if (t.subject === undefined || t.actor?.det !== 'you') return failure(t);
      const filter = lowerFilter(t.subject);
      if (!filter.ok) return filter;
      return ok({ kind: 'castSpell', filter: filter.value, by: 'you', orCopy: true });
    }
    case 'cast': {
      // CR 601.2i: "you cast" is the controller of this ability, "an opponent casts" a player it does not
      // control (D-111), "a player casts" any player.
      const by = whoOf(t.actor);
      if (by === null || t.subject === undefined) return failure(t);
      const filter = lowerFilter(t.subject);
      if (!filter.ok) return filter;
      // "an opponent casts their second spell each turn" (stage P68, D-229, CR 601.2i): the caster's nth spell of the turn.
      if (t.nth !== undefined) {
        const missing = missingFeatures(['trigger:castNth']);
        if (missing.length > 0) return failure(t, missing);
        return ok({ kind: 'castSpell', filter: filter.value, by, nth: t.nth });
      }
      return ok({ kind: 'castSpell', filter: filter.value, by });
    }
    case 'leftGraveyard':
    case 'exiledFromLibraryOrGraveyard': {
      // "one or more cards leave your graveyard" (stage P68, D-229, CR 400.7, 603.2c): the cards of the controller's own zones.
      const missing = missingFeatures([`trigger:${t.event}`]);
      if (missing.length > 0) return failure(t, missing);
      return ok({ kind: t.event, who: 'you' });
    }
    case 'sacrifice': {
      // "you sacrifice" is the controller of this ability, "a player sacrifices" any player.
      const by = t.actor?.det === 'you' ? 'you' : t.actor?.det === 'eachPlayer' ? 'any' : null;
      if (by === null) return failure(t);
      if (t.subject === undefined) return ok({ kind: 'permanentSacrificed', by });
      const filter = lowerFilter(t.subject);
      if (!filter.ok) return filter;
      // "a permanent" says nothing about the permanent: no filter, any permanent.
      return ok(
        Object.keys(filter.value).length === 0
          ? { kind: 'permanentSacrificed', by }
          : { kind: 'permanentSacrificed', by, filter: filter.value },
      );
    }
    default:
      return failure(t);
  }
}

/** Whether the trigger names the permanent the source is attached to. */
function hasAttachedSubject(t: Trigger): boolean {
  return 'what' in t && 'kind' in t.what && t.what.kind === 'attached';
}

/**
 * What "that player" means in the body of a trigger (stage P18, D-111): the controller of the spell that
 * was cast (CR 608.2h: read from last-known information when the spell has left the stack), or you when
 * the trigger is about you. A trigger with several events, or about another player's turn or action (an
 * opponent who drew a card), has no such player the engine can point at.
 */
function thatPlayerOf(events: readonly IrTrigger[]): LowerContext['thatPlayer'] {
  const [only, ...more] = events;
  if (only === undefined || more.length > 0) return null;
  if (only.event === 'cast' || only.event === 'castOrCopy') {
    return {
      selector: { kind: 'controllerOf', of: { kind: 'triggerSubject' } },
      needs: ['selector:controllerOf', 'selector:triggerSubject'],
    };
  }
  if (only.actor?.det === 'you') {
    return { selector: { kind: 'you' }, needs: ['selector:you'] };
  }
  // Stage P29 (D-133): the engine's `triggerPlayer` is the player the event is about: the player who drew, who was dealt
  // combat damage, whose spell or ability targeted, who sacrificed. A step, a death and an entering have none.
  const aboutPlayer =
    (['drawn', 'sacrifice', 'becomesTarget', 'lifeGained', 'attackBatch'].includes(only.event) &&
      only.actor !== undefined) ||
    ((only.event === 'dealsCombatDamage' || only.event === 'combatDamageBatch') &&
      only.recipient !== undefined);
  if (aboutPlayer) {
    return { selector: { kind: 'triggerPlayer' }, needs: ['selector:triggerPlayer'] };
  }
  return null;
}

/**
 * "When ~ enters, choose one —" and its bullets (stage P19, CR 700.2b, 603.3c): the engine's modal triggered
 * ability. The effects and targets are in the modes, `effect` is the empty sequence, and the controller
 * chooses the modes as the ability goes on the stack. An X in a mode has nothing to read it from (CR
 * 107.3j), so it is refused, as it is for any triggered ability; the modes' "you may" is not read.
 */
function lowerModalTriggered(
  ability: Triggered,
  modal: IrModes,
  triggers: readonly Trigger[],
  interveningIf: Condition | undefined,
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  const lowered = lowerModes(modal, ctx);
  if (!lowered.ok) return lowered;
  if (lowered.value.usesX) return failure(ability);
  const { modes, chooseModes } = lowered.value;
  return {
    ok: true,
    value: triggers.map((trigger) => ({
      kind: 'triggered',
      trigger,
      effect: NO_EFFECT,
      modes: [...modes],
      chooseModes,
      ...(interveningIf === undefined ? {} : { interveningIf }),
    })),
    rule: ability.trigger.rule,
  };
}

/** The condition a clause carries when the text ends "... unless it escaped" (stage P23, CR 702.138b). */
const isNotEscaped = (c: IrCondition | undefined): c is IrCondition =>
  c?.test.kind === 'not' && c.test.term.test.kind === 'escaped';

/**
 * "When ~ enters, sacrifice it unless it escaped." (stage P23, D-124): the clause applies when the permanent did
 * not escape, which the engine checks as the intervening "if" of the ability (CR 603.4: as the event happens
 * and again on resolution), so the condition is lifted off the clause and the ability is lowered without it. It
 * is lifted only when it is the whole body (one sentence, one clause, not optional) of an ability with no
 * intervening "if" of its own and no modes, and only for the sacrifice of the permanent in its own enters
 * trigger, the one wording of the real cards (Uro, Kroxa, Phlage); any other place for it is refused (null),
 * never lowered as if the clause were unconditional.
 */
function liftNotEscaped(
  ability: Triggered,
): { ability: Triggered; condition: IrCondition | undefined } | null {
  const bodies = ability.modal === undefined ? [ability.body] : ability.modal.modes;
  const clauses = bodies.flatMap((b) => b.sentences.flatMap((s) => s.clauses));
  if (!clauses.some((c) => isNotEscaped(c.condition))) {
    return { ability, condition: undefined };
  }
  const [sentence, ...otherSentences] = ability.body.sentences;
  const [clause, ...otherClauses] = sentence?.clauses ?? [];
  if (
    ability.modal !== undefined ||
    ability.interveningIf !== undefined ||
    sentence === undefined ||
    clause === undefined ||
    otherSentences.length > 0 ||
    otherClauses.length > 0 ||
    sentence.condition !== undefined ||
    clause.optional ||
    clause.verb !== 'sacrifice' ||
    ability.trigger.event !== 'enters' ||
    ability.trigger.alternatives !== undefined
  ) {
    return null;
  }
  const { condition, ...bare } = clause;
  void condition;
  const body = { ...ability.body, sentences: [{ ...sentence, clauses: [bare] }] };
  return { ability: { ...ability, body }, condition: clause.condition };
}

/**
 * "This ability triggers only once each turn." (stage P33, D-150, CR 603.2): the last sentence of the body, which is no instruction but the
 * engine's `oncePerTurn` of the ability before it. Only as the last sentence of an ability that has others, with nothing else in it; the
 * ability is then lowered without it. Null when the text puts it anywhere else (it is read and not run).
 */
function takeOncePerTurn(
  ability: Triggered,
): { ability: Triggered; once: boolean; doOnce: boolean } | null {
  // "Do this only once each turn." (D-256, CR 603.2h) is read the same way as the sentence about the ability, and the engine's flag for it is another one.
  const isOnce = (s: Triggered['body']['sentences'][number]) =>
    s.clauses.some((c) => c.verb === 'oncePerTurn' || c.verb === 'doOnceEachTurn');
  const sentences = ability.body.sentences;
  if (!sentences.some(isOnce)) return { ability, once: false, doOnce: false };
  const last = sentences[sentences.length - 1];
  const [clause, ...more] = last?.clauses ?? [];
  if (
    last === undefined ||
    sentences.length < 2 ||
    sentences.slice(0, -1).some(isOnce) ||
    ability.modal !== undefined ||
    clause === undefined ||
    more.length > 0 ||
    clause.optional ||
    clause.condition !== undefined ||
    clause.duration !== undefined ||
    last.condition !== undefined ||
    last.where !== undefined ||
    last.reflexive === true
  ) {
    return null;
  }
  return {
    ability: { ...ability, body: { ...ability.body, sentences: sentences.slice(0, -1) } },
    once: clause.verb === 'oncePerTurn',
    doOnce: clause.verb === 'doOnceEachTurn',
  };
}

/**
 * "Whenever you gain life, you may put that many +1/+1 counters on each creature you control." (D-256, CR 119.9): in the ability of a life gain
 * trigger, "that many" in the first instruction of the body is the life that was gained, which the engine reads as `triggerDamage` (the amount of the
 * event that caused the trigger). One that follows any other instruction (mill two cards, then draw that many; discard a card, then draw that many) may count what
 * that instruction did and is not changed, so the lowering refuses it. The engine's `validateCard` allows `triggerDamage` for this trigger.
 */
function lifeGainThatMany(ability: Triggered): Triggered {
  const events = [ability.trigger, ...(ability.trigger.alternatives ?? [])];
  if (ability.modal !== undefined || !events.every((e) => e.event === 'lifeGained')) return ability;
  let counted = false;
  const retarget = (amount: IrAmount): IrAmount => {
    switch (amount.kind) {
      case 'thisWay':
        return amount.thatMany === true && !counted
          ? { kind: 'triggerDamage', span: amount.span }
          : amount;
      case 'half':
      case 'multiple':
        return { ...amount, of: retarget(amount.of) };
      case 'sum':
        return { ...amount, of: amount.of.map(retarget) };
      default:
        return amount;
    }
  };
  const sentences = ability.body.sentences.map((sentence) => ({
    ...sentence,
    clauses: sentence.clauses.map((clause): IrClause => {
      const args = Object.fromEntries(
        Object.entries(clause.args).map(([key, arg]) => [
          key,
          isIrAmount(arg)
            ? retarget(arg)
            : arg.kind === 'token'
              ? { ...arg, count: retarget(arg.count) }
              : arg,
        ]),
      );
      // Only the first instruction of the body can name the life gained: after any clause a later "that many" may count what that clause did
      // (cards milled, a card discarded, life gained by a second instruction), which this does not know, so it is left for the lowering to refuse.
      counted = true;
      return { ...clause, args };
    }),
  }));
  return { ...ability, body: { ...ability.body, sentences } };
}

/**
 * "Whenever another permanent you control leaves the battlefield, if it had counters on it, ..." (stage P33, D-150, CR 603.10a, 122.1): the
 * permanent is looked at as it last was, which is what the engine's filter `hasCounter` reads of a trigger about a permanent that left. The
 * "if" is part of the filter of the one event (a death or a leaving) about a group of permanents, and is not an intervening "if" of its own.
 */
function foldHadCounters(trigger: Trigger, counter: string | undefined): Trigger | null {
  if ((trigger.kind !== 'leavesBattlefield' && trigger.kind !== 'dies') || 'kind' in trigger.what) {
    return null;
  }
  return { ...trigger, what: { ...trigger.what, hasCounter: counter ?? true } };
}

/**
 * A triggered ability. "A or B" is one engine ability per event (CR 603.2c: it triggers once each
 * time an event occurs; the two events cannot be the same event for one object), sharing the body.
 * "You may" covers the whole effect in the engine (D-060), so it is lowered only when the body is
 * that one instruction.
 */
export function lowerTriggered(
  written: Triggered,
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  // "... unless it escaped" is the ability's intervening "if" (see `liftNotEscaped`).
  const lift = liftNotEscaped(written);
  if (lift === null) return failure(written);
  // "This ability triggers only once each turn." (stage P33, D-150): the engine's `oncePerTurn`.
  const taken = takeOncePerTurn(lift.ability);
  if (taken === null) return failure(written);
  const { once, doOnce } = taken;
  // "put that many +1/+1 counters" of a life gain trigger (D-256): the life gained.
  const ability = lifeGainThatMany(taken.ability);
  // "Do this only once each turn." (D-256, CR 603.2h) is for an ability with one body: not a modal one, not a triggered mana ability, which the
  // lowering of those does not carry the flag into.
  if (doOnce && ability.modal !== undefined) return failure(written);
  const events = [ability.trigger, ...(ability.trigger.alternatives ?? [])];
  const triggers: Trigger[] = [];
  for (const event of events) {
    const lowered = lowerTrigger(event, ctx);
    if (!lowered.ok) return lowered;
    triggers.push(lowered.value);
  }
  ctx.thatPlayer = thatPlayerOf(events);
  ctx.lifeGainTrigger = triggers.every((t) => t.kind === 'lifeGained');
  // D-184: "When you cast this spell": the source is the spell that was cast, which is what "the amount of mana spent to cast it" reads.
  ctx.selfCast = triggers.every((t) => t.kind === 'castSpell' && t.self === true);
  // CR 603.4: the intervening "if" is checked as the event happens and again on resolution, so
  // the ability does not trigger when it is false. It is not a conditional effect inside the
  // ability. "It" is the source only when every event is about the source itself.
  const itIsSelf = events.every((e) => e.subject?.det === 'self');
  ctx.itIsSelf = itIsSelf;
  let interveningIf: Condition | undefined;
  let foldedCounters = false;
  const ifWritten = ability.interveningIf ?? lift.condition;
  if (ifWritten?.test.kind === 'hadCounters') {
    // "..., if it had counters on it, ..." (stage P33, D-150): a part of the filter of the trigger (see `foldHadCounters`).
    const [only] = triggers;
    const folded =
      events.length === 1 && only !== undefined && ability.trigger.subject?.det === 'a'
        ? foldHadCounters(only, ifWritten.test.counter)
        : null;
    if (folded === null) return failure(ifWritten, []);
    triggers[0] = folded;
    foldedCounters = true;
  } else if (ifWritten !== undefined) {
    const lowered = lowerCondition(ifWritten, itIsSelf, ctx);
    if (!lowered.ok) return lowered;
    interveningIf = lowered.value;
  }
  // "When ~ enters during the declare attackers step" (stage P31, D-140, CR 603.4): the step is checked as the event happens and as the
  // ability resolves, which is the engine's intervening `duringStep`, joined with any "if" the text has.
  const during = ability.trigger.during;
  if (during !== undefined) {
    const blocked = missingFeatures(['condition:duringStep']);
    if (blocked.length > 0) return failure(ability.trigger, blocked);
    if (events.length !== 1) return failure(ability.trigger);
    const step: Condition = { kind: 'duringStep', step: during };
    interveningIf =
      interveningIf === undefined ? step : { kind: 'and', terms: [step, interveningIf] };
  }
  // "Whenever ~ attacks while you don't control another Dinosaur" (stage P32, D-147, CR 603.2): a condition of the event itself, read once
  // as it happens, which is the engine's `triggerCondition` (it is not checked again as the ability resolves, unlike an "if").
  let triggerCondition: Condition | undefined;
  if (ability.trigger.whileCondition !== undefined) {
    if (events.length !== 1 || ability.modal !== undefined) return failure(ability.trigger);
    const lowered = lowerCondition(ability.trigger.whileCondition, itIsSelf, ctx);
    if (!lowered.ok) return lowered;
    triggerCondition = lowered.value;
  }
  // "• Khans — At the beginning of your upkeep, ..." (stage P34, D-152, CR 607.2d, 614.12a): the ability works while the permanent has the option
  // chosen as it entered, which the engine reads as part of the event.
  if (ability.option !== undefined) {
    const blockedOption = missingFeatures(['trigger:triggerCondition', 'condition:chosenOption']);
    if (blockedOption.length > 0) return failure(ability.trigger, blockedOption);
    const chosen: Condition = { kind: 'chosenOption', option: ability.option };
    triggerCondition =
      triggerCondition === undefined ? chosen : { kind: 'and', terms: [triggerCondition, chosen] };
  }
  // "Whenever you tap a permanent for {C}, add an additional {C}." (stage P31, D-140, CR 605.1b): a triggered mana ability, whose
  // effect is the fixed mana and nothing else.
  if (doOnce && triggers.some((t) => t.kind === 'tappedForMana' || t.kind === 'state')) {
    return failure(ability);
  }
  if (triggers.some((t) => t.kind === 'tappedForMana')) {
    return lowerTappedForMana(ability, triggers, interveningIf);
  }
  const needs: FeatureRef[] = [
    'ability:triggered',
    ...triggers.map((t): FeatureRef => `trigger:${t.kind}`),
    // A chapter ability belongs to a Saga card, whose layout the engine has to run (CR 714.1).
    ...(triggers.some((t) => t.kind === 'chapter') ? (['layout:saga'] as const) : []),
    ...(interveningIf === undefined ? [] : (['trigger:interveningIf'] as const)),
    ...(triggerCondition === undefined ? [] : (['trigger:triggerCondition'] as const)),
    ...(once ? (['ability:oncePerTurn'] as const) : []),
    ...(doOnce ? (['ability:doOnlyOnceEachTurn'] as const) : []),
    ...(foldedCounters ? (['selector:hasCounter'] as const) : []),
    // D-135: "enters untapped" and the zones a permanent left the battlefield for.
    ...(triggers.some((t) => t.kind === 'entersBattlefield' && t.tapped !== undefined)
      ? (['trigger:entersUntapped'] as const)
      : []),
    ...(triggers.some((t) => t.kind === 'leavesBattlefield' && t.to !== undefined)
      ? (['trigger:leavesToAnyOf'] as const)
      : []),
    ...(ability.modal === undefined ? [] : MODAL_NEEDS),
    // "Equipped creature" is the engine's `attached` subject (D-111).
    ...(triggers.some(hasAttachedSubject) ? (['selector:attached'] as const) : []),
  ];
  const missing = missingFeatures(needs);
  if (missing.length > 0) return failure(ability, missing);

  // A "dies" trigger of `~` itself: by the time the effect runs it is a card in a graveyard.
  // The same for "~ leaves the battlefield" (stage P18): it has left when the effect runs.
  ctx.selfGone = triggers.some(
    (t) =>
      (t.kind === 'dies' || t.kind === 'leavesBattlefield') &&
      'kind' in t.what &&
      t.what.kind === 'this',
  );
  // Stage P30 (D-135): in a trigger of `~` dying or leaving, "it" is the card the permanent became (CR 400.7).
  ctx.itIsCard = triggers.every(
    (t) =>
      (t.kind === 'dies' || t.kind === 'leavesBattlefield') &&
      'kind' in t.what &&
      t.what.kind === 'this',
  );
  const bodies = ability.modal === undefined ? [ability.body] : ability.modal.modes;
  const clauses = bodies.flatMap((b) => b.sentences.flatMap((s) => s.clauses));
  // "It" in the body of "becomes the target" is the spell or ability that targeted (the engine's
  // `triggerSubject`), and the binding pass cannot tell that from the permanent: not read.
  if (
    triggers.some((t) => t.kind === 'becomesTarget') &&
    clauses.some((c) => nounsOfClause(c).some((n) => n.det === 'triggerSubject'))
  ) {
    return failure(ability);
  }
  // "It" in the body of "you cast a spell" is the spell on the stack: a counter or a continuous effect on it is not
  // something the engine runs (`triggerSubject` there is a permanent, D-133). Copying it is another verb.
  if (
    triggers.some((t) => t.kind === 'castSpell') &&
    clauses.some(
      (c) => ON_A_PERMANENT.has(c.verb) && nounsOfClause(c).some((n) => n.det === 'triggerSubject'),
    )
  ) {
    return failure(ability);
  }
  if (ability.modal !== undefined)
    return lowerModalTriggered(ability, ability.modal, triggers, interveningIf, ctx);
  // "You may draw a card unless that player pays {1}": the engine's `unlessPays` has its own `optional`
  // (the question comes after the payment, CR 118.12a), so the sentence keeps it and the ability's
  // `optional` is for the other sentences.
  type Sentence = Triggered['body']['sentences'][number];
  const sentences = ability.body.sentences;
  // "You may return ... If that land is a Plains, you may return that card to the battlefield instead." (stage P33, D-150): the two offers.
  const instead = lowerMayInstead(sentences, ctx);
  if (instead !== null) {
    if (!instead.ok) return instead;
    const [offered] = instead.value;
    if (offered === undefined) return failure(ability);
    const targets = ctx.targets.length > 0 ? { targets: [...ctx.targets] } : {};
    return {
      ok: true,
      value: triggers.map((trigger) => ({
        kind: 'triggered',
        trigger,
        ...targets,
        effect: offered,
        ...(interveningIf === undefined ? {} : { interveningIf }),
        ...(triggerCondition === undefined ? {} : { triggerCondition }),
        ...(once ? { oncePerTurn: true as const } : {}),
        ...(doOnce ? { doOnlyOnceEachTurn: true as const } : {}),
      })),
      rule: ability.trigger.rule,
    };
  }
  const unlessSentence = (s: Sentence) =>
    s.clauses.some((c) => c.condition?.test.kind === 'unlessPays');
  // "You may pay {4}. If you do, untap ~." (stage P21): the offer and what it buys are the engine's
  // `mayPay`, which asks its own question, so neither sentence is the ability's "you may".
  const offerSentence = (s: Sentence) =>
    s.clauses.some((c) => c.verb === 'pay' || c.verb === 'payXAtMost');
  const boughtSentence = (s: Sentence) => s.condition?.test.kind === 'didPrevious';
  // "You may discard a card. If you do, draw a card." and "You may exile it. When you do, ..." (stage P30, D-135): the offer is the
  // engine's `may` effect and what follows it is a `conditional` or a `reflexive`; neither sentence is the ability's "you may".
  const mayOffer = (s: Sentence, i: number) => {
    const next = sentences[i + 1];
    return (
      next !== undefined &&
      (boughtSentence(next) || next.reflexive === true) &&
      s.clauses.every((c) => c.optional) &&
      !offerSentence(s)
    );
  };
  // "You may play that card this turn." (stage P34): a permission, which no question of the ability answers.
  const permission = (s: Sentence) => s.clauses.every((c) => c.verb === 'mayPlay');
  const ownMay = (s: Sentence, i: number) =>
    !permission(s) &&
    !unlessSentence(s) &&
    !offerSentence(s) &&
    !boughtSentence(s) &&
    s.reflexive !== true &&
    !mayOffer(s, i);
  const optional = sentences.some((s, i) => ownMay(s, i) && s.clauses.some((c) => c.optional));
  // The engine's `optional` covers the whole effect, so it cannot sit beside a condition.
  const conditional = sentences.some((s) => s.condition !== undefined && !boughtSentence(s));
  const others = sentences.filter(ownMay).flatMap((s) => s.clauses);
  if (optional && (others.length !== 1 || conditional)) return failure(ability);
  // A "you may" of the whole ability beside an offer would be two questions for one effect.
  if (optional && sentences.some((s, i) => offerSentence(s) || mayOffer(s, i))) {
    return failure(ability);
  }
  // "return this card from your graveyard to your hand" (stage P34, D-152, CR 113.6b): the ability works while its card is in the graveyard.
  ctx.graveyardSource = true;
  const lowered = lowerSentences(
    sentences.map((s, i) => ({
      ...s,
      clauses: s.clauses.map((c) => ({
        ...c,
        // The sentences of an offer keep their "you may": `lowerSentences` reads it, and refuses a "you
        // may" inside what a payment buys.
        optional: ownMay(s, i) || permission(s) ? false : c.optional,
      })),
    })),
    ctx,
  );
  ctx.graveyardSource = false;
  if (!lowered.ok) return lowered;
  const effects = lowered.value;
  const [only] = effects;
  const effect: Effect =
    effects.length === 1 && only !== undefined ? only : { kind: 'sequence', effects: [...effects] };
  if (ctx.usedGraveyardSource) {
    const blockedGraveyard = missingFeatures(['ability:functionsInGraveyard']);
    if (blockedGraveyard.length > 0) return failure(ability, blockedGraveyard);
    // A trigger of a card in its graveyard is about other things (CR 113.6b): "When ~ enters" would be about a card that is not on the battlefield.
    if (triggers.some((t) => 'what' in t && 'kind' in t.what)) return failure(ability);
  }
  // "none of those creatures attacked you" is about the attackers of the declaration that triggered the ability (stage P33, D-150, CR 508.1b).
  if (
    JSON.stringify(effect).includes('"attackersAttackedYou"') &&
    !triggers.every((t) => t.kind === 'attackBatch')
  ) {
    return failure(ability);
  }
  const targets = ctx.targets.length > 0 ? { targets: [...ctx.targets] } : {};
  return {
    ok: true,
    value: triggers.map((trigger) => ({
      kind: 'triggered',
      trigger,
      ...targets,
      effect,
      ...(optional ? { optional: true } : {}),
      ...(interveningIf === undefined ? {} : { interveningIf }),
      ...(triggerCondition === undefined ? {} : { triggerCondition }),
      ...(once ? { oncePerTurn: true as const } : {}),
      ...(doOnce ? { doOnlyOnceEachTurn: true as const } : {}),
      ...(ctx.usedGraveyardSource ? { functionsIn: 'graveyard' as const } : {}),
    })),
    rule: ability.trigger.rule,
  };
}

/**
 * The body of a triggered mana ability (stage P31, D-140, CR 605.1b, 106.12): "add an additional {C}", one instruction of fixed mana,
 * with no target, condition, "you may" or other event. Anything else is refused, never run through the stack.
 */
function lowerTappedForMana(
  ability: Triggered,
  triggers: readonly Trigger[],
  interveningIf: Condition | undefined,
): LowerResult<readonly Ability[]> {
  const [sentence, ...more] = ability.body.sentences;
  const [clause, ...others] = sentence?.clauses ?? [];
  const spec = clause?.args.mana;
  if (
    triggers.length !== 1 ||
    interveningIf !== undefined ||
    ability.modal !== undefined ||
    sentence === undefined ||
    more.length > 0 ||
    others.length > 0 ||
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    clause === undefined ||
    clause.verb !== 'addMana' ||
    clause.optional ||
    clause.condition !== undefined ||
    clause.duration !== undefined ||
    clause.args.additional === undefined ||
    spec?.kind !== 'manaSpec' ||
    spec.what.kind !== 'symbols'
  ) {
    return failure(ability);
  }
  const blocked = missingFeatures(['ability:triggered', 'trigger:tappedForMana', 'effect:addMana']);
  if (blocked.length > 0) return failure(ability, blocked);
  const [trigger] = triggers;
  if (trigger === undefined) return failure(ability);
  const mana = spec.what.symbols as ('W' | 'U' | 'B' | 'R' | 'G' | 'C')[];
  return {
    ok: true,
    value: [
      { kind: 'triggered', trigger, effect: { kind: 'addMana', mana: { kind: 'fixed', mana } } },
    ],
    rule: ability.trigger.rule,
  };
}

/** Features the trigger lowerings can name, for the dimension test. */
export const TRIGGER_NEEDS: readonly FeatureRef[] = [
  'ability:triggered',
  'trigger:interveningIf',
  'trigger:triggerCondition',
  'trigger:entersBattlefield',
  'trigger:dies',
  'trigger:attacks',
  'trigger:alone',
  'trigger:attacksAt',
  'trigger:dealtDamage',
  'trigger:becomesTapped',
  'trigger:becomesUntapped',
  'trigger:blocks',
  'trigger:becomesBlocked',
  'trigger:landfall',
  'trigger:upkeep',
  'trigger:endStep',
  'trigger:permanentSacrificed',
  'trigger:castSpell',
  'trigger:becomesTarget',
  'trigger:chapter',
  'trigger:step',
  'trigger:drawn',
  'trigger:dealsCombatDamage',
  'trigger:leavesBattlefield',
  'trigger:entersUntapped',
  'trigger:leavesToAnyOf',
  'trigger:combatDamageBatch',
  'trigger:diesBatch',
  'trigger:discarded',
  'trigger:tappedForMana',
  'trigger:tapsForMana',
  'trigger:state',
  'trigger:lifeGained',
  'trigger:countersAdded',
  'trigger:attackBatch',
  'trigger:entersBatch',
  'trigger:leftGraveyard',
  'trigger:exiledFromLibraryOrGraveyard',
  'trigger:castNth',
  'ability:oncePerTurn',
  'ability:doOnlyOnceEachTurn',
  'condition:duringStep',
  'condition:chosenOption',
  'selector:attached',
  'layout:saga',
];
