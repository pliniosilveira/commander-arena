/**
 * Triggered abilities (CR 603) and static abilities (CR 604): the IR of a `When`/`Whenever`/`At`
 * line to the engine's `triggered` ability, and a statement like "You have no maximum hand size"
 * to a `static` one. Each declares the engine features it needs and is gated before anything is
 * built, like every lowering.
 */
import type {
  Ability,
  Condition,
  Cost,
  Effect,
  ManaProduction,
  ObjectFilter,
  Trigger,
  TriggerStep,
  TriggerSubject,
} from '@commander-arena/engine';
import { ATTACKERS_REF } from '../ir/bind';
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
import { arg } from './clauses';
import { lowerCondition } from './conditions';
import { lowerCost } from './costs';
import { type FeatureRef, missingFeatures } from './features';
import { lowerModes, MODAL_NEEDS, NO_EFFECT } from './modal';
import { lowerFilter } from './nouns';
import {
  lowerMayInstead,
  lowerOfferSentence,
  lowerSentences,
  withoutAnyNumberOffer,
} from './sentences';
import { usesSharesWithSource } from './sliver-d';
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
  becomesMonstrous: 'becomesMonstrous',
  turnedFaceUp: 'turnedFaceUp',
  blocks: 'blocks',
  becomesBlocked: 'becomesBlocked',
  becomesUnblocked: 'becomesUnblocked',
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
  'dealsDamage',
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
      // "enters from a graveyard" (issue 102, River Kelpie, CR 603.6a): the zone it came from, as the event is noticed.
      if (t.fromGraveyard === true) {
        const blocked = missingFeatures([
          'trigger:entersBattlefieldFromGraveyard',
          ...(t.yourGraveyard === true
            ? (['trigger:entersBattlefieldFromYourGraveyard'] as const)
            : []),
        ]);
        if (blocked.length > 0) return failure(t, blocked);
      }
      if (t.fromExile === true) {
        const blocked = missingFeatures(['trigger:entersBattlefieldFromExile']);
        if (blocked.length > 0) return failure(t, blocked);
      }
      // "enters untapped", "enters tapped" (stage P30, D-135, CR 603.6a): how it entered, as the event is noticed.
      return ok({
        kind: 'entersBattlefield',
        what: what.value,
        ...(t.entersTapped === undefined ? {} : { tapped: t.entersTapped }),
        ...(t.fromGraveyard === true ? { fromGraveyard: true as const } : {}),
        ...(t.fromExile === true ? { fromExile: true as const } : {}),
        ...(t.fromGraveyard === true && t.yourGraveyard === true
          ? { graveyardOwner: 'you' as const }
          : {}),
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
      if (!what.ok) return what;
      // CR 120.2b, 120.10: "noncombat damage" and "excess damage" are features of the engine's `dealtDamage` (`excess` makes its amount the excess).
      const blocked = missingFeatures([
        ...(t.noncombat === true ? (['trigger:dealtDamageNoncombat'] as const) : []),
        ...(t.excess === true ? (['trigger:dealtDamageExcess'] as const) : []),
      ]);
      if (blocked.length > 0) return failure(t, blocked);
      return ok({
        kind: 'dealtDamage',
        what: what.value,
        ...(t.combat === true ? { combat: true } : {}),
        ...(t.noncombat === true ? { noncombat: true } : {}),
        ...(t.excess === true ? { excess: true } : {}),
      });
    }
    case 'becomesTapped': {
      const what = whatOf(t, ctx);
      if (!what.ok) return what;
      // "Whenever you tap an untapped creature an opponent controls" (Hylda deck, D-510, CR 701.26a): the player who taps it, and "one or more" of them as one event.
      // The player is read only for a trigger about a filter (a trigger on `this` has one permanent and nothing a player taps to name).
      if (t.actor === undefined && t.batch !== true) {
        return ok({ kind: 'becomesTapped', what: what.value });
      }
      const by = whoOf(t.actor);
      if (by === null || by === 'any' || 'kind' in what.value) return failure(t);
      const blocked = missingFeatures([
        'trigger:tappedBy',
        ...(t.batch === true ? (['trigger:tapBatch'] as const) : []),
      ]);
      if (blocked.length > 0) return failure(t, blocked);
      return ok({
        kind: 'becomesTapped',
        what: what.value,
        by,
        ...(t.batch === true ? { batch: true as const } : {}),
        ...(t.duringTheirTurn === true ? { duringTheirTurn: true as const } : {}),
      });
    }
    case 'scries': {
      // "Whenever you scry" (Hylda deck, D-513, CR 701.22): the player is relative to the controller of the ability.
      const who = whoOf(t.actor);
      if (who === null) return failure(t);
      const blocked = missingFeatures(['trigger:scries']);
      return blocked.length > 0 ? failure(t, blocked) : ok({ kind: 'scries', who });
    }
    case 'surveils': {
      // "Whenever you scry or surveil" (Galadriel deck, group 1, CR 701.25): the player is relative to the controller of the ability.
      const who = whoOf(t.actor);
      if (who === null) return failure(t);
      // Whispering Snitch: "Whenever you surveil for the first time each turn" (CR 603.2): the controller's own first surveil of the turn only.
      if (t.firstEachTurn === true && who !== 'you') return failure(t);
      const blocked = missingFeatures([
        'trigger:surveils',
        ...(t.firstEachTurn === true ? (['trigger:surveilsFirstEachTurn'] as const) : []),
      ]);
      return blocked.length > 0
        ? failure(t, blocked)
        : ok({
            kind: 'surveils',
            who,
            ...(t.firstEachTurn === true ? { firstEachTurn: true as const } : {}),
          });
    }
    case 'countersRemoved': {
      // "Whenever you remove a time counter from this card while it's exiled" (Watcher of Hours, CR 122.1, 702.62a): the owner removes it from the card itself, in exile.
      if (t.whileExiled !== true || t.counter === undefined || whoOf(t.actor) !== 'you') {
        return failure(t);
      }
      if (t.subject?.det !== 'self') return failure(t);
      const blocked = missingFeatures(['trigger:removesCounterWhileExiled']);
      return blocked.length > 0
        ? failure(t, blocked)
        : ok({ kind: 'removesCounterWhileExiled', counter: t.counter });
    }
    case 'milled': {
      // "Whenever a player mills one or more creature cards" (Zellix, CR 701.17a, 603.2c): the player is relative to the controller; a kind of card filters the cards milled.
      const who = whoOf(t.actor);
      if (who === null) return failure(t);
      const blocked = missingFeatures(['trigger:milled']);
      if (blocked.length > 0) return failure(t, blocked);
      const kind = t.subject?.filter;
      if (t.subject === undefined || (kind?.types === undefined && kind?.notTypes === undefined)) {
        return ok({ kind: 'milled', who });
      }
      const filter = lowerFilter(t.subject);
      if (!filter.ok) return filter;
      return ok({ kind: 'milled', who, filter: filter.value });
    }
    case 'rollsHighest': {
      // "Whenever you roll a die's highest natural result" (Galadriel deck, group 3, CR 706.1a, 706.2): the player is relative to the controller of the ability.
      const who = whoOf(t.actor);
      if (who === null) return failure(t);
      const blocked = missingFeatures(['trigger:rollsHighest']);
      return blocked.length > 0 ? failure(t, blocked) : ok({ kind: 'rollsHighest', who });
    }
    case 'votingFinished': {
      // "Whenever players finish voting" (Erestor of the Council, CR 701.38a): any vote of any spell or ability; the record of the votes goes to the ability.
      const blocked = missingFeatures(['trigger:votingFinished']);
      return blocked.length > 0 ? failure(t, blocked) : ok({ kind: 'votingFinished' });
    }
    case 'winsCoinFlip': {
      // "Whenever you win a coin flip" (Setzer, CR 705.2): the player is relative to the controller of the ability.
      const who = whoOf(t.actor);
      if (who === null) return failure(t);
      const blocked = missingFeatures(['trigger:winsCoinFlip']);
      return blocked.length > 0 ? failure(t, blocked) : ok({ kind: 'winsCoinFlip', who });
    }
    case 'winsClash': {
      // "Whenever you win a clash" (Marvo, Deep Operative, CR 701.30d): the player is relative to the controller of the ability.
      const who = whoOf(t.actor);
      if (who === null) return failure(t);
      const blocked = missingFeatures(['trigger:winsClash']);
      return blocked.length > 0 ? failure(t, blocked) : ok({ kind: 'winsClash', who });
    }
    case 'turnedFaceUp': {
      // CR 701.40b, 708.8: "~ is turned face up", "a permanent you control is turned face up", "you turn a permanent face up" (`by`: the player who turned it).
      const blocked = missingFeatures(['trigger:turnedFaceUp']);
      if (blocked.length > 0) return failure(t, blocked);
      const what = whatOf(t, ctx);
      if (!what.ok) return what;
      return ok({
        kind: 'turnedFaceUp',
        what: what.value,
        ...(t.by === 'you' ? { by: 'you' as const } : {}),
      });
    }
    case 'dies':
    case 'blocks':
    case 'becomesBlocked':
    case 'becomesUnblocked':
    case 'becomesUntapped':
    case 'becomesMonstrous': {
      const what = whatOf(t, ctx);
      if (!what.ok) return what;
      return ok({
        kind: TRIGGER_KIND[t.event],
        what: what.value,
        ...(t.event === 'dies' && t.by === 'you' ? { graveyardOwner: 'you' as const } : {}),
      });
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
      // `you` and `opponents` are recipients of the batch trigger only (`combatDamageBatch`).
      if (t.damaged === 'you' || t.damaged === 'opponents') return failure(t);
      return what.ok
        ? ok({ kind: 'dealsCombatDamage', what: what.value, to: t.damaged ?? 'any' })
        : what;
    }
    case 'dealsDamage': {
      // "Whenever enchanted creature deals damage to an opponent" (issue 347, CR 120.2, 603.2c): damage of any kind to a player.
      const what = whatOf(t, ctx);
      if (!what.ok) return what;
      if (t.damaged !== 'player' && t.damaged !== 'opponent' && t.damaged !== 'you') {
        return failure(t);
      }
      const missing = missingFeatures(['trigger:dealsDamage']);
      if (missing.length > 0) return failure(t, missing);
      return ok({ kind: 'dealsDamage', what: what.value, to: t.damaged });
    }
    case 'playerDealtDamage': {
      // "Whenever you're dealt damage" (issue 190, Sun Droplet, CR 120.2, 603.2c): damage of any kind to a player, once for each source.
      if (t.damaged !== 'you' && t.damaged !== 'opponent' && t.damaged !== 'player') {
        return failure(t);
      }
      const missing = missingFeatures(['trigger:dealtDamageToPlayer']);
      if (missing.length > 0) return failure(t, missing);
      return ok({ kind: 'dealtDamageToPlayer', who: t.damaged });
    }
    case 'damageToPlayerPrevented': {
      // "Whenever damage that would be dealt to you is prevented" (Selfless Squire, CR 615.6, 603.2c): damage to a player a prevention effect prevented, once for each source.
      if (t.damaged !== 'you' && t.damaged !== 'opponent' && t.damaged !== 'player') {
        return failure(t);
      }
      const missing = missingFeatures(['trigger:damageToPlayerPrevented']);
      if (missing.length > 0) return failure(t, missing);
      return ok({ kind: 'damageToPlayerPrevented', who: t.damaged });
    }
    case 'noncombatDamageDealt': {
      // "Whenever a source you control deals noncombat damage to an opponent" (issue 25, D-333, CR 120.2b, 603.2c): whose source it is and which player it damaged.
      if (t.by === undefined || (t.damaged !== 'player' && t.damaged !== 'opponent')) {
        return failure(t);
      }
      const missing = missingFeatures(['trigger:noncombatDamageDealt']);
      if (missing.length > 0) return failure(t, missing);
      return ok({ kind: 'noncombatDamageDealt', by: t.by, to: t.damaged });
    }
    case 'combatDamageBatch': {
      // "Whenever one or more artifact creatures you control deal combat damage to a player" (stage P31, D-140, CR 603.2c): one trigger
      // for each player damaged in one damage event, the creatures named by a filter of the controller's permanents.
      if (
        t.subject === undefined ||
        (t.damaged !== 'player' &&
          t.damaged !== 'opponent' &&
          t.damaged !== 'opponents' &&
          t.damaged !== 'you')
      ) {
        return failure(t);
      }
      const filter = lowerFilter(t.subject);
      if (!filter.ok) return filter;
      return ok({
        kind: 'combatDamageBatch',
        what: filter.value,
        to: t.damaged,
        ...(t.atLeast === undefined ? {} : { atLeast: t.atLeast }),
        ...(t.whileMonarch === true ? { whileMonarch: true as const } : {}),
      });
    }
    case 'damageBatch': {
      // "Whenever one or more Pirates you control deal damage to a player | to your opponents" (Ahoy Mateys group 1, CR 120.2, 603.2c): the engine's `damageBatch`.
      if (t.subject === undefined || (t.damaged !== 'player' && t.damaged !== 'opponent')) {
        return failure(t);
      }
      const filter = lowerFilter(t.subject);
      if (!filter.ok) return filter;
      const missing = missingFeatures(['trigger:damageBatch']);
      if (missing.length > 0) return failure(t, missing);
      return ok({
        kind: 'damageBatch',
        what: filter.value,
        to: t.damaged === 'opponent' ? 'opponents' : 'player',
        ...(t.atLeast === undefined ? {} : { atLeast: t.atLeast }),
      });
    }
    case 'tappedForMana': {
      // "Whenever you tap a permanent for {C}" (stage P31, D-140, CR 106.12, 605.1b): a mana ability of a permanent the filter matches,
      // activated with {T} by the controller, and the type of mana it made when the text names one.
      // "Whenever enchanted land is tapped for mana" (CR 106.12, 605.1b, 303.4): the land the Aura is attached to, tapped by whoever controls it, who gets the mana.
      if (t.enchantedTapped === true) {
        if (t.subject === undefined) return failure(t);
        const host = lowerFilter(t.subject);
        if (!host.ok) return host;
        const missing = missingFeatures(['trigger:tappedForMana', 'selector:hostOfSource']);
        if (missing.length > 0) return failure(t, missing);
        return ok({
          kind: 'tappedForMana',
          what: { ...host.value, hostOfSource: true },
          by: 'tapper',
        });
      }
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
    case 'playsCard': {
      // "Whenever you play a card with two or more card types" (Death Toll deck, group D, CR 305.1, 601.2, 205.2a): the player is the controller of the ability.
      // Urianger Augurelt: "you play a land from exile or cast a spell from exile" names no number of card types, only the zone.
      if (t.actor?.det !== 'you' || (t.atLeast === undefined && t.fromExile !== true)) {
        return failure(t);
      }
      const blocked = missingFeatures(['trigger:playsCard']);
      return blocked.length > 0
        ? failure(t, blocked)
        : ok({
            kind: 'playsCard',
            ...(t.atLeast === undefined ? {} : { minCardTypes: t.atLeast }),
            ...(t.fromExile === true ? { fromExile: true as const } : {}),
          });
    }
    case 'exploits': {
      // "When ~ exploits a creature" (CR 702.110b): the creature with the ability, which the engine's Exploit ability makes exploit what its controller sacrifices.
      const blocked = missingFeatures(['trigger:exploits']);
      return blocked.length > 0 ? failure(t, blocked) : ok({ kind: 'exploits' });
    }
    case 'doorUnlocked': {
      // "When you unlock this door" (CR 709.5h): an ability of one half of a Room, triggered by the controller unlocking that half; `validateCard` refuses it on a card that is not a Room.
      if (t.actor?.det !== 'you') return failure(t);
      const blocked = missingFeatures(['trigger:doorUnlocked']);
      return blocked.length > 0
        ? failure(t, blocked)
        : ok({ kind: 'doorUnlocked', who: 'you', door: 'this' });
    }
    case 'cycled': {
      // "When you cycle this card" (stage P37, D-180, CR 702.29c): the card with the ability, which the engine finds in the zone it wound up in.
      if (t.actor?.det !== 'you' || t.subject?.det !== 'self') return failure(t);
      const blocked = missingFeatures(['trigger:cycled']);
      return blocked.length > 0 ? failure(t, blocked) : ok({ kind: 'cycled' });
    }
    case 'exerted': {
      // "You may exert ~ as it attacks. When you do, ..." (CR 701.43d, 607.2h): the creature with the ability, exerted as it attacked.
      if (t.subject?.det !== 'self') return failure(t);
      const blocked = missingFeatures(['trigger:exerted']);
      return blocked.length > 0 ? failure(t, blocked) : ok({ kind: 'exerted' });
    }
    case 'crimeCommitted':
    case 'activatesAbility':
    case 'tokenCreated': {
      // "Whenever you commit a crime" (Gisa deck, D-464, CR 700.13), "whenever you create a token" (D-465, CR 111.2): the player is relative to the controller.
      const who = whoOf(t.actor);
      if (who === null) return failure(t);
      // Unbound Flourishing (CR 107.3, 602.2b, 603.4): "activate an ability, if that ability's activation cost contains {X}" (`xCost`), of any ability that uses the stack (`anySource`).
      const flagged = (name: string): boolean => {
        const a = t.args[name];
        return a?.kind === 'flag' && a.value;
      };
      const xCost = t.event === 'activatesAbility' && flagged('xCost');
      const anySource = t.event === 'activatesAbility' && flagged('anySource');
      // Avalanche of Sector 7 (CR 602.2): "an ability of an artifact they control": the permanent whose ability it is, as a filter.
      const sourceNoun = t.event === 'activatesAbility' ? t.args.ofSource : undefined;
      if (sourceNoun !== undefined && sourceNoun.kind !== 'noun') return failure(t);
      const blocked = missingFeatures([
        `trigger:${t.event}`,
        ...(xCost || anySource ? (['trigger:activatesAbilityX'] as const) : []),
        ...(sourceNoun === undefined ? [] : (['trigger:activatesAbilityOfSource'] as const)),
      ]);
      if (blocked.length > 0) return failure(t, blocked);
      const ofSource = sourceNoun === undefined ? undefined : lowerFilter(sourceNoun);
      if (ofSource !== undefined && !ofSource.ok) return ofSource;
      return ok({
        kind: t.event as 'crimeCommitted' | 'tokenCreated' | 'activatesAbility',
        who,
        ...(xCost ? { xCost: true as const } : {}),
        ...(anySource ? { anySource: true as const } : {}),
        ...(ofSource === undefined ? {} : { ofSource: ofSource.value }),
      });
    }
    case 'entersCausesTrigger': {
      // "Whenever a creature entering under an opponent's control causes a triggered ability of that creature to trigger" (Aboleth Spawn, CR 603.2, 603.6a): whose creature, and
      // what kind.
      const who = whoOf(t.actor);
      const entered = t.args.entered;
      if (who === null || entered?.kind !== 'noun') return failure(t);
      const blocked = missingFeatures(['trigger:entersCausesTrigger']);
      if (blocked.length > 0) return failure(t, blocked);
      const what = lowerFilter(entered);
      if (!what.ok) return what;
      return ok({ kind: 'entersCausesTrigger', who, what: what.value });
    }
    case 'ringTempted': {
      // "Whenever the Ring tempts you" (stage P45, D-197, CR 701.54d): the controller of the ability is the player tempted.
      const blocked = missingFeatures(['trigger:ringTempted']);
      return blocked.length > 0 ? failure(t, blocked) : ok({ kind: 'ringTempted' });
    }
    case 'dungeonCompleted': {
      // "Whenever you complete a dungeon" (CR 309.7, 701.49c): the controller of the ability is the player whose dungeon was completed.
      const blocked = missingFeatures(['trigger:dungeonCompleted']);
      return blocked.length > 0 ? failure(t, blocked) : ok({ kind: 'dungeonCompleted' });
    }
    case 'expend': {
      // "Whenever you expend N" (CR 700.14): the controller of the ability is the player who spent the mana.
      if (t.expend === undefined) return failure(t);
      const blocked = missingFeatures(['trigger:expend']);
      return blocked.length > 0 ? failure(t, blocked) : ok({ kind: 'expend', amount: t.expend });
    }
    case 'ringBearerChosen': {
      // CR 701.54a: unlike `ringTempted`, this trigger needs a creature to have been chosen.
      const blocked = missingFeatures(['trigger:ringTempted']);
      return blocked.length > 0
        ? failure(t, blocked)
        : ok({ kind: 'ringTempted', bearerChosen: true });
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
      // Professor Hojo (CR 602.2, 603.2c): "one or more creatures you control become the target of an activated ability".
      if (t.activatedOnly === true || t.batch === true) {
        const blocked = missingFeatures(['trigger:becomesTargetActivated']);
        if (blocked.length > 0) return { ...failure(t), needs: blocked };
      }
      return ok({
        kind: 'becomesTarget',
        what: what.value,
        by,
        ...(t.spellOnly === true ? { spellOnly: true as const } : {}),
        ...(t.activatedOnly === true ? { activatedOnly: true as const } : {}),
        ...(t.batch === true ? { batch: true as const } : {}),
      });
    }
    case 'upkeep':
    case 'endStep': {
      // "At the beginning of the monarch's end step" (CR 725.2, 603.2b): the engine's `step` of whoever is the monarch.
      if (t.monarchTurn === true) {
        const blocked = missingFeatures(['trigger:stepMonarch']);
        if (blocked.length > 0) return { ...failure(t), needs: blocked };
        return ok({ kind: 'step', step: t.event, whose: 'monarch' });
      }
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
      return ok({
        kind: 'step',
        step: t.step satisfies TriggerStep,
        whose,
        ...(t.alsoStep === undefined ? {} : { alsoStep: t.alsoStep satisfies TriggerStep }),
      });
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
      const another = t.another === true ? { another: true as const } : {};
      // "Whenever you discard a creature card" (D-383, CR 701.9a): the kind of card is a filter on the card discarded; "a card" has none.
      const kind = t.subject?.filter;
      // "Whenever you discard one or more nonland cards" (Lorehold group 1, CR 603.2c): one trigger for the cards discarded together.
      const batch = t.batch === true ? { batch: true as const } : {};
      if (kind === undefined || (kind.types === undefined && kind.notTypes === undefined)) {
        return ok({ kind: 'discarded', who, ...another, ...batch });
      }
      if (t.subject === undefined) return failure(t);
      const filter = lowerFilter(t.subject);
      if (!filter.ok) return filter;
      return ok({ kind: 'discarded', who, ...another, ...batch, filter: filter.value });
    }
    case 'drawn': {
      const who = whoOf(t.actor);
      if (who === null) return failure(t);
      return ok({
        kind: 'drawn',
        who,
        ...(t.nth === undefined ? {} : { nth: t.nth }),
        ...(t.exceptFirstInDrawStep === true ? { exceptFirstInDrawStep: true as const } : {}),
      });
    }
    case 'chapter':
      return lowerChapter(t);
    case 'classLevel': {
      const level = t.level;
      if (typeof level !== 'number') return failure(t);
      const blocked = missingFeatures(['trigger:classLevel']);
      return blocked.length > 0 ? failure(t, blocked) : ok({ kind: 'classLevel', level });
    }
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
    case 'lifeLost': {
      // "Whenever you lose life [for the first time each turn]" (CR 119.3, 603.2): the player is relative to the controller.
      const who = whoOf(t.actor);
      if (who === null) return failure(t);
      // "Whenever one or more opponents lose life" (CR 603.2c): one trigger for the losses of one run of events, only of other players and with no ordinal.
      if (t.batch === true && (who === 'you' || t.firstEachTurn === true)) return failure(t);
      if (t.duringTheirTurn === true && (t.batch === true || who === 'you')) return failure(t);
      const blocked = missingFeatures([
        'trigger:lifeLost',
        ...(t.batch === true ? (['trigger:lifeLostBatch'] as const) : []),
        ...(t.duringTheirTurn === true ? (['trigger:lifeLostDuringTheirTurn'] as const) : []),
      ]);
      if (blocked.length > 0) return failure(t, blocked);
      return ok({
        kind: 'lifeLost',
        who,
        ...(t.firstEachTurn === true ? { firstEachTurn: true as const } : {}),
        ...(t.batch === true ? { batch: true as const } : {}),
      });
    }
    case 'countersAdded': {
      // "Whenever you put one or more +1/+1 counters on ~" (stage P33, D-150, CR 122.6): once for one instance of putting.
      const what = whatOf(t, ctx);
      if (!what.ok) return what;
      if (t.by === undefined) return failure(t);
      const blocked = t.perCounter === true ? missingFeatures(['trigger:countersAddedEach']) : [];
      if (blocked.length > 0) return failure(t, blocked);
      return ok({
        kind: 'countersAdded',
        what: what.value,
        ...(t.counter === undefined ? {} : { counter: t.counter }),
        by: t.by,
        ...(t.reaches === undefined ? {} : { reaches: t.reaches }),
        ...(t.perCounter === true ? { each: true as const } : {}),
      });
    }
    case 'playerAttacksOpponent': {
      // "Whenever a player attacks one of your opponents" (D-648, CR 508.1, 508.6): once for each opponent the declaration attacks.
      if (t.actor?.det !== 'eachPlayer') return failure(t);
      return ok({ kind: 'playerAttacksOpponent' });
    }
    case 'unblockedAttackBatch': {
      // "Whenever one or more creatures an opponent controls attack you and aren't blocked" (CR 509.1h, 508.1b): the creatures of an opponent.
      if (whoOf(t.actor) !== 'opponent') return failure(t);
      const missing = missingFeatures(['trigger:unblockedAttackBatch']);
      if (missing.length > 0) return failure(t, missing);
      return ok({ kind: 'unblockedAttackBatch', who: 'opponent' });
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
        ...(t.attackedEnchantedPlayer === true ? { attackedEnchantedPlayer: true as const } : {}),
        ...(t.attackedYou === true ? { attackedYou: true as const } : {}),
        ...(t.attackedYouOrPlaneswalkers === true
          ? { attackedYouOrPlaneswalkers: true as const }
          : {}),
        ...(t.attackedInitiativeHolder === true ? { attackedInitiativeHolder: true as const } : {}),
        ...(t.eachAttackedPlayer === true ? { eachAttackedPlayer: true as const } : {}),
        ...(t.eachAttackedOpponent === true ? { eachAttackedOpponent: true as const } : {}),
        ...(t.includesSource === true ? { includesSource: true as const } : {}),
        ...(t.attackingYourOpponents === true ? { attackingYourOpponents: true as const } : {}),
      });
    }
    case 'entersBatch': {
      // "Whenever one or more tokens you control enter" (stage P65, D-218, CR 603.2c, 603.6a).
      if (t.subject === undefined) return failure(t);
      const filter = lowerFilter(t.subject);
      if (!filter.ok) return filter;
      // CR 305.1 (Deep Gnome Terramancer): "without being played".
      const notPlayed = t.args.notPlayed?.kind === 'flag' && t.args.notPlayed.value;
      const missing = missingFeatures([
        'trigger:entersBatch',
        ...(notPlayed ? (['ability:entersNotPlayed'] as const) : []),
      ]);
      if (missing.length > 0) return failure(t, missing);
      return ok({
        kind: 'entersBatch',
        what: filter.value,
        ...(notPlayed ? { notPlayed: true as const } : {}),
      });
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
      const chosen = t.actor?.filter.chosenPlayer === true;
      const by = chosen ? 'chosenPlayer' : whoOf(t.actor);
      if (by === null || t.subject === undefined) return failure(t);
      const filter = lowerFilter(t.subject);
      if (!filter.ok) return filter;
      // CR 603.2, 607.2d (Sewer Nemesis): "the chosen player casts a spell" is the plain cast trigger of the player the permanent chose as it entered.
      if (by === 'chosenPlayer') {
        if (t.nth !== undefined || t.firstOfKind === true || t.duringTurn !== undefined) {
          return failure(t);
        }
        const missing = missingFeatures(['selector:castByChosenPlayer']);
        if (missing.length > 0) return failure(t, missing);
        return ok({ kind: 'castSpell', filter: filter.value, by });
      }
      // "an opponent casts their second spell each turn" (stage P68, D-229, CR 601.2i): the caster's nth spell of the turn.
      if (t.nth !== undefined) {
        const missing = missingFeatures(
          t.duringTurn === undefined
            ? ['trigger:castNth']
            : ['trigger:castNth', 'trigger:castDuringOpponentTurn'],
        );
        if (missing.length > 0) return failure(t, missing);
        return ok({
          kind: 'castSpell',
          filter: filter.value,
          by,
          nth: t.nth,
          ...(t.duringTurn === undefined ? {} : { duringTurn: t.duringTurn }),
        });
      }
      // "Whenever you cast your first instant or sorcery spell each turn" (issue 100, CR 601.2i): the first spell of those card types the caster casts this turn.
      if (t.firstOfKind === true) {
        const missing = missingFeatures(['trigger:castFirstOfKind']);
        if (missing.length > 0) return failure(t, missing);
        return ok({ kind: 'castSpell', filter: filter.value, by, firstOfKind: true });
      }
      // "Whenever an opponent casts a spell during your turn" (CR 603.2): the active player is the controller of this ability.
      if (t.duringTurn === 'you') {
        const missing = missingFeatures(['trigger:castDuringYourTurn']);
        if (missing.length > 0) return failure(t, missing);
        return ok({ kind: 'castSpell', filter: filter.value, by, duringTurn: 'you' });
      }
      return ok({ kind: 'castSpell', filter: filter.value, by });
    }
    case 'leftGraveyard': {
      // "one or more cards leave your graveyard" (stage P68, D-229, CR 400.7, 603.2c): the cards of the controller's own zones; "one or more creature cards", "a creature
      // card leaves your graveyard" (CR 603.2): a kind of card is a filter on the card as it was in the graveyard.
      const missing = missingFeatures([`trigger:${t.event}`]);
      if (missing.length > 0) return failure(t, missing);
      const kind = t.subject?.filter;
      const filter =
        t.subject === undefined || (kind?.types === undefined && kind?.notTypes === undefined)
          ? null
          : lowerFilter(t.subject);
      if (filter !== null && !filter.ok) return filter;
      // "... during your turn" (issue 102, Kishla Skimmer, CR 603.2): the active player is the controller of this ability.
      if (t.duringTurn === 'you') {
        const during = missingFeatures(['trigger:leftGraveyardDuringYourTurn']);
        if (during.length > 0) return failure(t, during);
      }
      return ok({
        kind: 'leftGraveyard',
        who: 'you',
        ...(filter === null ? {} : { filter: filter.value }),
        ...(t.each === true ? { each: true as const } : {}),
        ...(t.duringTurn === 'you' ? { duringTurn: 'you' as const } : {}),
      });
    }
    case 'exiledFromLibraryOrGraveyard': {
      // "one or more cards are put into exile from your library and/or your graveyard" (stage P68, D-229, CR 400.7, 603.2c): the cards of the controller's own zones.
      const missing = missingFeatures([`trigger:${t.event}`]);
      if (missing.length > 0) return failure(t, missing);
      return ok({ kind: 'exiledFromLibraryOrGraveyard', who: 'you' });
    }
    case 'putIntoGraveyard': {
      // "Whenever a land card is put into your graveyard from anywhere" (Death Toll deck, group B, CR 603.2, 603.2c): the kind of card is a filter on the card in the graveyard.
      const missing = missingFeatures(['trigger:putIntoGraveyard']);
      if (missing.length > 0) return failure(t, missing);
      // "When ~ is put into a graveyard from anywhere" (Troyan 2 deck, CR 603.6c): the card with the ability, from any zone; no filter, no batch.
      if (t.subject?.det === 'self') {
        return ok({ kind: 'putIntoGraveyard', who: 'any', from: 'anywhere', self: true });
      }
      // A land type ("a Desert card", Yuma, CR 205.3i) is a filter on the card as it is in the graveyard as well.
      const kind = t.subject?.filter;
      const filter =
        t.subject === undefined ||
        (kind?.types === undefined && kind?.notTypes === undefined && kind?.subtypes === undefined)
          ? null
          : lowerFilter(t.subject);
      if (filter !== null && !filter.ok) return filter;
      return ok({
        kind: 'putIntoGraveyard',
        // "from anywhere other than the battlefield" is the card of any player's graveyard (CR 603.2, 404.1, 700.4).
        who:
          t.fromNotBattlefield === true || t.anyGraveyard === true
            ? 'any'
            : t.opponentGraveyard === true
              ? 'opponent'
              : 'you',
        from:
          t.fromNotBattlefield === true
            ? 'notBattlefield'
            : t.fromLibrary === true
              ? 'library'
              : 'anywhere',
        ...(filter === null ? {} : { filter: filter.value }),
        ...(t.batch === true ? { batch: true as const } : {}),
        ...(t.firstEachTurn === true ? { firstTimeEachTurn: true as const } : {}),
      });
    }
    case 'sacrifice': {
      // "you sacrifice" is the controller of this ability, "a player sacrifices" any player.
      const by =
        t.actor?.det === 'you'
          ? 'you'
          : t.actor?.det === 'eachPlayer'
            ? 'any'
            : t.actor?.det === 'eachOpponent'
              ? 'opponent'
              : null;
      if (by === null) return failure(t);
      // "... during your turn" (Szarel, CR 603.2): the active player is the controller of this ability.
      if (t.duringTurn === 'you') {
        const during = missingFeatures(['trigger:sacrificedDuringYourTurn']);
        if (during.length > 0) return failure(t, during);
      }
      const during = t.duringTurn === 'you' ? { duringTurn: 'you' as const } : {};
      if (t.subject === undefined) return ok({ kind: 'permanentSacrificed', by, ...during });
      const filter = lowerFilter(t.subject);
      if (!filter.ok) return filter;
      // "a permanent" says nothing about the permanent: no filter, any permanent.
      return ok(
        Object.keys(filter.value).length === 0
          ? { kind: 'permanentSacrificed', by, ...during }
          : { kind: 'permanentSacrificed', by, filter: filter.value, ...during },
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
  // Brainstealer Dragon (CR 108.3, 110.2): "a nonland permanent an opponent owns enters under your control, they lose life ...": "they" is the opponent who owns it, since the permanent
  // is under your control.
  if (
    only.event === 'enters' &&
    only.rule === 'trigger.enters-under-your-control-opponent-owned' &&
    only.actor === undefined
  ) {
    return {
      selector: { kind: 'ownerOf', of: { kind: 'triggerSubject' } },
      needs: ['selector:ownerOf', 'selector:triggerSubject'],
    };
  }
  // CR 603.10a, 400.7: the player of a death trigger is the controller of the permanent that died, read from last-known information. The player of "whenever a creature an
  // opponent controls enters" is the controller of the permanent that entered (CR 110.2a): "that player".
  if (
    (only.event === 'dies' || only.event === 'leavesBattlefield' || only.event === 'enters') &&
    only.subject !== undefined &&
    only.subject.det !== 'self' &&
    only.actor === undefined
  ) {
    return {
      selector: { kind: 'controllerOf', of: { kind: 'triggerSubject' } },
      needs: ['selector:controllerOf', 'selector:triggerSubject'],
    };
  }
  // CR 508.6 (Firkraag): "that player" of "attack an opponent" is the opponent attacked, which the engine gives as the trigger player.
  if (only.event === 'attackBatch' && only.eachAttackedOpponent === true) {
    return { selector: { kind: 'triggerPlayer' }, needs: ['selector:triggerPlayer'] };
  }
  if (only.actor?.det === 'you') {
    return { selector: { kind: 'you' }, needs: ['selector:you'] };
  }
  // CR 508.6 (Calculating Lich): "that player" of "whenever a creature attacks one of your opponents" is the opponent attacked, not the attacking player.
  if (only.event === 'attacks' && only.at === 'opponent') {
    return {
      selector: { kind: 'triggerAttackedPlayer' },
      needs: ['selector:triggerAttackedPlayer'],
    };
  }
  // Stage P29 (D-133): the engine's `triggerPlayer` is the player the event is about: the player who drew, who was dealt
  // combat damage, whose spell or ability targeted, who sacrificed. A step, a death and an entering have none.
  const aboutPlayer =
    // D-391 (CR 120.3, 113.7a): "a source deals damage to ~" is about the controller of the source (the engine's `dealtDamage` has it as the trigger player).
    ([
      'drawn',
      'sacrifice',
      'lifeGained',
      'lifeLost',
      'attackBatch',
      // CR 509.1h: the opponent whose creatures were not blocked ("that player").
      'unblockedAttackBatch',
      // D-648: the attacking player ("that attacking player").
      'playerAttacksOpponent',
      'dealtDamage',
      'crimeCommitted',
      'activatesAbility',
      'tokenCreated',
      'scries',
      'surveils',
      'milled',
      'rollsHighest',
      'winsCoinFlip',
      'winsClash',
    ].includes(only.event) &&
      only.actor !== undefined) ||
    // Exit from Exile deck (Bonecrusher Giant, CR 603.2, 115.1): the controller of the spell or ability that targeted is the player of the event, said or not ("that spell's controller").
    only.event === 'becomesTarget' ||
    ((only.event === 'dealsCombatDamage' ||
      only.event === 'dealsDamage' ||
      only.event === 'combatDamageBatch' ||
      only.event === 'damageBatch' ||
      only.event === 'noncombatDamageDealt' ||
      only.event === 'playerDealtDamage' ||
      only.event === 'damageToPlayerPrevented') &&
      only.recipient !== undefined);
  // The beginning of a step of another player's turn (CR 102.1: the active player is the player whose turn it is; CR 603.2b): "that player" is the active player, the engine's occurrence player of
  // `step`, `upkeep` and `endStep` (the beginning of your own step was answered above: "you").
  const aboutActivePlayer =
    (only.event === 'upkeep' || only.event === 'endStep' || only.event === 'step') &&
    (only.actor?.det === 'eachOpponent' || only.actor?.det === 'eachPlayer');
  if (aboutPlayer || aboutActivePlayer) {
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
  const lowered = lowerModes(modal, ctx, false, true);
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

/**
 * "..., you may pay {1}. When you do, choose one —" and its bullets (Hylda deck, D-511, CR 603.12, 700.2b, 603.3c): the offer of the payment and the modal reflexive ability the
 * payment creates, which is the engine's `mayPay` whose effect is a `reflexive` ability with `afterPayment` and the modes. The body is the one sentence of the offer; the modes are
 * chosen as the reflexive ability goes on the stack, and an X in a mode has nothing to read (CR 107.3j), as for any triggered ability.
 */
function lowerPaidModalTriggered(
  ability: Triggered,
  modal: IrModes,
  triggers: readonly Trigger[],
  own: {
    readonly interveningIf: Condition | undefined;
    readonly triggerCondition: Condition | undefined;
    readonly once: boolean;
  },
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  const [sentence, ...rest] = ability.body.sentences;
  const [clause, ...more] = sentence?.clauses ?? [];
  const offer = clause?.args.cost;
  // "..., you may sacrifice it. When you do, choose one —" (Gorbag of Minas Morgul, CR 603.12, 701.21): the offer is a sacrifice, not a payment.
  if (
    sentence !== undefined &&
    rest.length === 0 &&
    clause !== undefined &&
    clause.verb === 'sacrifice'
  ) {
    return lowerSacrificeModalTriggered(ability, sentence, modal, triggers, own, ctx);
  }
  if (
    sentence === undefined ||
    rest.length > 0 ||
    clause === undefined ||
    more.length > 0 ||
    clause.verb !== 'pay' ||
    !clause.optional ||
    clause.condition !== undefined ||
    clause.duration !== undefined ||
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    sentence.reflexive === true ||
    offer?.kind !== 'costList'
  ) {
    return failure(ability);
  }
  const cost: Cost[] = [];
  for (const item of offer.costs) {
    const lowered = lowerCost(item, { hybrid: true });
    if (!lowered.ok) return lowered;
    cost.push(lowered.value);
  }
  const blocked = missingFeatures([
    'effect:mayPay',
    'effect:reflexive',
    'ability:reflexiveModal',
    'ability:reflexivePaid',
    ...cost.map((c): FeatureRef => `cost:${c.kind}`),
  ]);
  if (blocked.length > 0) return failure(ability, blocked);
  const lowered = lowerModes(modal, ctx);
  if (!lowered.ok) return lowered;
  if (lowered.value.usesX) return failure(ability);
  const { modes, chooseModes } = lowered.value;
  const effect: Effect = {
    kind: 'mayPay',
    cost,
    effect: {
      kind: 'reflexive',
      afterPayment: true,
      effect: NO_EFFECT,
      modes: [...modes],
      chooseModes,
    },
  };
  return {
    ok: true,
    value: triggers.map((trigger) => ({
      kind: 'triggered',
      trigger,
      effect,
      ...(own.interveningIf === undefined ? {} : { interveningIf: own.interveningIf }),
      ...(own.triggerCondition === undefined ? {} : { triggerCondition: own.triggerCondition }),
      ...(own.once ? { oncePerTurn: true as const } : {}),
    })),
    rule: ability.trigger.rule,
  };
}

/**
 * "Whenever a Goblin or Orc you control deals combat damage to a player, you may sacrifice it. When you do, choose one —" and its bullets (Gorbag of Minas Morgul; CR 603.12,
 * 603.3c, 700.2b, 701.21): the engine's `may` of the sacrifice and, as the last effect of the same sequence, the modal `reflexive` ability, which is created only if the permanent was
 * sacrificed and whose modes are chosen as it goes on the stack, not as the first ability triggers.
 */
function lowerSacrificeModalTriggered(
  ability: Triggered,
  sentence: Triggered['body']['sentences'][number],
  modal: IrModes,
  triggers: readonly Trigger[],
  own: {
    readonly interveningIf: Condition | undefined;
    readonly triggerCondition: Condition | undefined;
    readonly once: boolean;
  },
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  const blocked = missingFeatures(['effect:reflexive', 'ability:reflexiveModal']);
  if (blocked.length > 0) return failure(ability, blocked);
  const offer = lowerOfferSentence(sentence, ctx);
  if (!offer.ok) return offer;
  const lowered = lowerModes(modal, ctx);
  if (!lowered.ok) return lowered;
  if (lowered.value.usesX) return failure(ability);
  const { modes, chooseModes } = lowered.value;
  const effect: Effect = {
    kind: 'sequence',
    effects: [
      offer.value,
      { kind: 'reflexive', effect: NO_EFFECT, modes: [...modes], chooseModes },
    ],
  };
  return {
    ok: true,
    value: triggers.map((trigger) => ({
      kind: 'triggered',
      trigger,
      effect,
      ...(own.interveningIf === undefined ? {} : { interveningIf: own.interveningIf }),
      ...(own.triggerCondition === undefined ? {} : { triggerCondition: own.triggerCondition }),
      ...(own.once ? { oncePerTurn: true as const } : {}),
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

/** Whether the clause is the offer "pay that much life" (D-364): a `pay` whose only cost is the life of the event. */
function paysThatMuchLife(clause: IrClause): boolean {
  const cost = clause.args.cost;
  return (
    clause.verb === 'pay' &&
    cost?.kind === 'costList' &&
    cost.costs.length === 1 &&
    cost.costs.every((c) => c.kind === 'payLife' && c.amount.kind === 'triggerDamage')
  );
}

/**
 * "Whenever you gain life, you may put that many +1/+1 counters on each creature you control." (D-256, CR 119.9) and "Whenever a source you control deals noncombat
 * damage to an opponent, you draw that many cards." (D-333, CR 120.2b): in the ability of a life gain or noncombat damage
 * trigger, "that many" in the first instruction of the body is the life that was gained or the damage that was dealt, which the engine reads as `triggerDamage` (the amount of the
 * event that caused the trigger). One that follows any other instruction (mill two cards, then draw that many; discard a card, then draw that many) may count what
 * that instruction did and is not changed, so the lowering refuses it. The engine's `validateCard` allows `triggerDamage` for this trigger.
 * D-364: the offer "you may pay that much life" is the event's own amount, so "If you do, draw that many cards" after it is the event's amount too.
 */
function eventAmountThatMany(ability: Triggered): Triggered {
  const events = [ability.trigger, ...(ability.trigger.alternatives ?? [])];
  if (ability.modal !== undefined) return ability;
  const castTargetCount = events.every(
    (e) => e.event === 'cast' && e.subject?.filter.targetCountAtLeast !== undefined,
  );
  const eventDamage = events.every(
    (e) =>
      e.event === 'lifeGained' ||
      (e.event === 'lifeLost' && e.batch !== true) ||
      // CR 122.6 (Earth Kingdom General): "Whenever you put one or more +1/+1 counters on a creature, you gain that much life": the counters put on.
      e.event === 'countersAdded' ||
      e.event === 'noncombatDamageDealt' ||
      e.event === 'playerDealtDamage' ||
      e.event === 'damageToPlayerPrevented' ||
      // Subterfuge: "Whenever ~ deals combat damage to a player, draw that many cards" (CR 510.2, 603.2): the combat damage the trigger is about.
      e.event === 'dealsCombatDamage' ||
      e.event === 'dealsDamage' ||
      // Body of Knowledge: "Whenever this creature is dealt damage, draw that many cards" (CR 120.3, 603.2g): the damage the permanent was dealt (the excess, for "excess damage").
      e.event === 'dealtDamage',
  );
  // Issue 81 (The Ur-Sphinx): "Whenever one or more Sphinxes you control attack, each player mills that many cards": the creatures of the declaration the trigger counted.
  const attackers = events.every((e) => e.event === 'attackBatch');
  if (!castTargetCount && !eventDamage && !attackers) return ability;
  const eventAmount = attackers
    ? 'triggerAttackerCount'
    : castTargetCount
      ? 'triggerTargetCount'
      : 'triggerDamage';
  let counted = false;
  const retarget = (amount: IrAmount): IrAmount => {
    switch (amount.kind) {
      case 'thisWay':
        return amount.thatMany === true && !counted
          ? { kind: eventAmount, span: amount.span }
          : amount;
      case 'half':
      case 'multiple':
      case 'minus':
        return { ...amount, of: retarget(amount.of) };
      case 'difference':
      case 'extreme':
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
      // D-364: but the payment of "that much life" counts nothing of its own: it is the life gained itself, so "If you do, draw that many cards" after it
      // still means the event's amount. Any other payment ("pay 2 life. If you do, draw that many cards") leaves "that many" unclear, so it is refused.
      if (!paysThatMuchLife(clause)) counted = true;
      return { ...clause, args };
    }),
  }));
  return { ...ability, body: { ...ability.body, sentences } };
}

/**
 * "When ~ dies, if it had one or more -1/-1 counters on it, its owner draws that many cards and each other player loses that much life." (Oft-Nabbed Goat, CR 603.10a, 122.1): in the
 * body of a trigger whose intervening "if" says the source had one or more counters of a kind, "that many" and "that much" are the number of those counters the source had, which the
 * engine reads from its last-known information (`countersOn` of `this`).
 */
function hadCountersThatMany(ability: Triggered): Triggered {
  const test = ability.interveningIf?.test;
  if (
    test?.kind !== 'hadCounters' ||
    test.oneOrMore !== true ||
    test.counter === undefined ||
    ability.modal !== undefined ||
    // Only about the source itself: of another permanent that left, the counters it had are not the source's.
    ability.trigger.subject?.det !== 'self'
  ) {
    return ability;
  }
  const counter = test.counter;
  const counters = (amount: IrAmount): IrAmount => ({
    kind: 'countersOn',
    of: {
      kind: 'noun',
      det: 'self',
      filter: { raw: '~' },
      upTo: false,
      plural: false,
      other: false,
      span: amount.span,
      rule: ability.interveningIf?.rule ?? 'condition.had-counters',
    },
    counter,
    span: amount.span,
  });
  const retarget = (amount: IrAmount): IrAmount => {
    switch (amount.kind) {
      case 'thisWay':
        return amount.thatMany === true ? counters(amount) : amount;
      case 'triggerDamage':
        return amount.life === true ? amount : counters(amount);
      default:
        return amount;
    }
  };
  const sentences = ability.body.sentences.map((sentence) => ({
    ...sentence,
    clauses: sentence.clauses.map(
      (clause): IrClause => ({
        ...clause,
        args: Object.fromEntries(
          Object.entries(clause.args).map(([key, arg]) => [
            key,
            isIrAmount(arg) ? retarget(arg) : arg,
          ]),
        ),
      }),
    ),
  }));
  return { ...ability, body: { ...ability.body, sentences } };
}

/**
 * "Whenever another permanent you control is put into a graveyard from the battlefield, if it had one or more counters on it, you may put that number of +1/+1 counters on target creature."
 * (Yuna, Grand Summoner; CR 603.10a, 113.7a, 122.1): in the body of a trigger about another permanent whose intervening "if" says it had counters on it, "that number" is the number of counters
 * of every kind the permanent had as it left, which the engine reads from its last-known information (`countersOn` of the `triggerSubject`, no kind named). Only the words "that number".
 */
function hadCountersThatNumber(ability: Triggered): Triggered {
  const test = ability.interveningIf?.test;
  if (
    test?.kind !== 'hadCounters' ||
    test.oneOrMore !== true ||
    test.counter !== undefined ||
    ability.modal !== undefined ||
    ability.trigger.subject === undefined ||
    ability.trigger.subject.det === 'self'
  ) {
    return ability;
  }
  const counters = (amount: IrAmount): IrAmount => ({
    kind: 'countersOn',
    of: {
      kind: 'noun',
      det: 'triggerSubject',
      filter: { raw: 'it' },
      upTo: false,
      plural: false,
      other: false,
      span: amount.span,
      rule: ability.interveningIf?.rule ?? 'condition.had-counters',
    },
    span: amount.span,
  });
  const retarget = (amount: IrAmount): IrAmount =>
    amount.kind === 'thisWay' &&
    amount.thatMany === true &&
    amount.words.length === 1 &&
    amount.words[0] === 'number'
      ? counters(amount)
      : amount;
  const sentences = ability.body.sentences.map((sentence) => ({
    ...sentence,
    clauses: sentence.clauses.map(
      (clause): IrClause => ({
        ...clause,
        args: Object.fromEntries(
          Object.entries(clause.args).map(([key, arg]) => [
            key,
            isIrAmount(arg) ? retarget(arg) : arg,
          ]),
        ),
      }),
    ),
  }));
  return { ...ability, body: { ...ability.body, sentences } };
}

/** The count a prime-number condition reads, inside the intervening "if" (alone or joined with others by "and"). */
function primeCountOf(condition: IrCondition | undefined): IrAmount | null {
  const test = condition?.test;
  if (test?.kind === 'amountIsPrime') return test.amount;
  if (test?.kind === 'and') {
    for (const term of test.terms) {
      const found = primeCountOf(term);
      if (found !== null) return found;
    }
  }
  return null;
}

/**
 * "..., if a land entered the battlefield under your control this turn and you control a prime number of lands, create Primo, the Indivisible, a legendary 0/0 ... token, then put that
 * many +1/+1 counters on it." (Zimone, All-Questioning, CR 603.4, 608.2c): in the body of a triggered ability whose intervening "if" says that a count is a prime number, "that many" is that
 * count (the number of lands), read as the ability resolves, when the condition holds again. Only before any instruction that could count something of its own ("sacrifice", "discard",
 * "mill", "draw", "exile"): after one, "that many" may mean what it did, and the lowering refuses it.
 */
function conditionAmountThatMany(ability: Triggered): Triggered {
  const count = primeCountOf(ability.interveningIf);
  if (count === null || ability.modal !== undefined) return ability;
  let counting = false;
  const retarget = (amount: IrAmount): IrAmount => {
    switch (amount.kind) {
      case 'thisWay':
        return amount.thatMany === true && !counting ? count : amount;
      case 'half':
      case 'multiple':
      case 'minus':
        return { ...amount, of: retarget(amount.of) };
      case 'difference':
      case 'extreme':
      case 'sum':
        return { ...amount, of: amount.of.map(retarget) };
      default:
        return amount;
    }
  };
  const COUNTS_ITS_OWN = new Set(['sacrifice', 'discard', 'mill', 'draw', 'exile', 'destroy']);
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
      if (COUNTS_ITS_OWN.has(clause.verb)) counting = true;
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
 * "..., if that spell's mana cost or that ability's activation cost contains {X}, ..." (Unbound Flourishing, CR 107.3, 603.4): the events must be exactly a spell being cast (not itself) and
 * an ability being activated; the spell gets `xInManaCost` and the activation `xCost`. Null for any other events.
 */
function foldCostContainsX(triggers: readonly Trigger[]): Trigger[] | null {
  const cast = triggers.filter((t) => t.kind === 'castSpell' && t.self !== true);
  const activate = triggers.filter((t) => t.kind === 'activatesAbility');
  if (triggers.length !== 2 || cast.length !== 1 || activate.length !== 1) return null;
  return triggers.map((t) =>
    t.kind === 'castSpell'
      ? { ...t, filter: { ...t.filter, xInManaCost: true as const } }
      : t.kind === 'activatesAbility'
        ? { ...t, xCost: true as const }
        : t,
  );
}

/**
 * A triggered ability, and for "You may exert ~ as it attacks. When you do, ..." (CR 701.43d, 607.2h) the two abilities the paragraph is: the static ability that
 * offers the optional cost of attacking (`exertOnAttack`) and the triggered ability linked to it, which the engine triggers when the creature is exerted.
 */
export function lowerTriggered(
  written: Triggered,
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  const lowered = lowerTriggeredAbility(written, ctx);
  if (!lowered.ok || written.trigger.event !== 'exerted') return lowered;
  const blocked = missingFeatures(['static:exertOnAttack']);
  if (blocked.length > 0) return failure(written, blocked);
  return {
    ...lowered,
    value: [
      {
        kind: 'static',
        static: {
          kind: 'exertOnAttack',
          ...(written.trigger.unlessExertedThisTurn === true
            ? { unlessExertedThisTurn: true as const }
            : {}),
        },
      },
      ...lowered.value,
    ],
  };
}

/**
 * A triggered ability. "A or B" is one engine ability per event (CR 603.2c: it triggers once each
 * time an event occurs; the two events cannot be the same event for one object), sharing the body.
 * "You may" covers the whole effect in the engine (D-060), so it is lowered only when the body is
 * that one instruction.
 */
function lowerTriggeredAbility(
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
  const ability = hadCountersThatNumber(
    hadCountersThatMany(conditionAmountThatMany(eventAmountThatMany(taken.ability))),
  );
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
  // Frontier Warmonger (CR 603.2c): "those creatures" of "Whenever one or more creatures attack one of your opponents or a planeswalker they control" are the creatures
  // that attacked them, the engine's `triggerAttackers`.
  if (
    triggers.length > 0 &&
    triggers.every((t) => t.kind === 'attackBatch' && t.attackingYourOpponents === true)
  ) {
    const blocked = missingFeatures(['selector:triggerAttackers']);
    if (blocked.length === 0) ctx.eachMentions.set(ATTACKERS_REF, { kind: 'triggerAttackers' });
  }
  // D-648: "that opponent": the player the declaration attacked, of a trigger about a player attacking one of your opponents.
  ctx.attackedPlayer =
    events.length === 1 && events[0]?.event === 'playerAttacksOpponent'
      ? {
          selector: { kind: 'triggerAttackedPlayer' },
          needs: ['selector:triggerAttackedPlayer'],
        }
      : null;
  // CR 508.4: "create a token that's tapped and attacking" after "whenever one or more Goblins you control attack": it attacks a player the declaration attacked (the first one).
  ctx.attackBatchPlayer =
    triggers.length === 1 &&
    triggers[0]?.kind === 'attackBatch' &&
    triggers[0].who === 'you' &&
    triggers[0].attackedEnchantedPlayer !== true
      ? {
          selector: { kind: 'triggerAttackedPlayer' },
          needs: ['selector:triggerAttackedPlayer'],
        }
      : null;
  ctx.enchantedPlayerTrigger =
    triggers.length > 0 &&
    triggers.every((t) => t.kind === 'attackBatch' && t.attackedEnchantedPlayer === true);
  ctx.attachedTrigger =
    triggers.length > 0 &&
    // CR 603.10a (Mask of Griselbrand): "Whenever equipped creature dies, ... its power" is the power the creature had, the trigger's subject, as is the host of an attack trigger.
    triggers.every(
      (t) =>
        (t.kind === 'attacks' || t.kind === 'dies') &&
        'kind' in t.what &&
        t.what.kind === 'attached',
    );
  ctx.lifeGainTrigger = triggers.every((t) => t.kind === 'lifeGained');
  ctx.scryTrigger = triggers.every((t) => t.kind === 'scries');
  ctx.excessDamageTrigger =
    triggers.length > 0 && triggers.every((t) => t.kind === 'dealtDamage' && t.excess === true);
  ctx.triggeredBody = true;
  ctx.deathOfOther =
    triggers.length > 0 && triggers.every((t) => t.kind === 'dies' && !('kind' in t.what));
  ctx.hadCountersTrigger = false;
  ctx.discardBatchTrigger = triggers.every((t) => t.kind === 'discarded' && t.batch === true);
  ctx.graveyardBatchTrigger =
    triggers.length > 0 && triggers.every((t) => t.kind === 'putIntoGraveyard' && t.batch === true);
  // Twilight Diviner: "a copy of one of them" names the permanents of a batch of enters.
  ctx.entersBatchTrigger = triggers.every((t) => t.kind === 'entersBatch');
  // Kodama of the East Tree (CR 603.2, 603.6a): "Whenever another permanent you control enters": the permanent that entered is the trigger's subject, whose mana value is a limit.
  ctx.entersPermanentTrigger =
    triggers.length > 0 &&
    triggers.every(
      (t) => t.kind === 'entersBattlefield' && !('kind' in t.what && t.what.kind === 'this'),
    );
  ctx.putWithThis = false;
  // D-184: "When you cast this spell": the source is the spell that was cast, which is what "the amount of mana spent to cast it" reads.
  ctx.selfCast = triggers.every((t) => t.kind === 'castSpell' && t.self === true);
  // Issue 25: "that spell" of "if five or more mana was spent to cast that spell" is the spell of a cast trigger (`castSpell` of another spell).
  ctx.castTrigger = triggers.every((t) => t.kind === 'castSpell' && t.self !== true);
  // Unbound Flourishing (CR 707.10): "copy that spell or ability" needs an activation among the events, or there is no ability to copy.
  ctx.activateTrigger = triggers.some((t) => t.kind === 'activatesAbility');
  // Issue 133 (Diffusion Sliver): "counter that spell or ability unless its controller pays {2}": the triggers are all about becoming a target.
  ctx.becomesTargetOf =
    triggers.length > 0 && triggers.every((t) => t.kind === 'becomesTarget')
      ? triggers.every((t) => t.kind === 'becomesTarget' && t.spellOnly === true)
        ? 'spell'
        : 'both'
      : null;
  // Quandrix Unlimited group E (CR 107.3): "put X +1/+1 counters" of "whenever you cast a spell with {X} in its mana cost" is the X of the spell that was cast.
  ctx.castTriggerX = triggers.every(
    (t) => t.kind === 'castSpell' && t.self !== true && t.filter.xInManaCost === true,
  );
  // Issue 81 (Shark Typhoon): "When you cycle this card, create an X/X ... token": X is the X of the cycling cost.
  ctx.cycleTriggerX = triggers.every((t) => t.kind === 'cycled');
  // CR 603.4: the intervening "if" is checked as the event happens and again on resolution, so
  // the ability does not trigger when it is false. It is not a conditional effect inside the
  // ability. "It" is the source only when every event is about the source itself.
  const itIsSelf = events.every((e) => e.subject?.det === 'self');
  ctx.itIsSelf = itIsSelf;
  let interveningIf: Condition | undefined;
  let foldedCounters = false;
  const ifWritten = ability.interveningIf ?? lift.condition;
  // "..., if you gained life this turn, distribute up to that many ...": "that many" is the life gained (CR 119.3, 603.4).
  ctx.lifeGainedIf = ifWritten?.test.kind === 'lifeGainedThisTurn' && ifWritten.test.atLeast === 1;
  if (ifWritten?.test.kind === 'hadCounters') {
    // "..., if it had counters on it, ..." (stage P33, D-150): a part of the filter of the trigger (see `foldHadCounters`).
    const [only] = triggers;
    const folded =
      events.length === 1 && only !== undefined && ability.trigger.subject?.det === 'a'
        ? foldHadCounters(only, ifWritten.test.counter)
        : null;
    if (folded !== null) {
      triggers[0] = folded;
      foldedCounters = true;
      // Resourceful Defense: "those counters" of the body are every counter the permanent had, which only an unnamed kind of counter makes of the text.
      ctx.hadCountersTrigger = ifWritten.test.counter === undefined;
    } else {
      // "When ~ dies, if it had one or more -1/-1 counters on it, ..." (Oft-Nabbed Goat, CR 603.10a, 122.1): the permanent itself, as it last was, had a counter of the kind the text names
      // (the engine's `sourceHasCounter`, which Persist and Undying read). "That many" of the body is the number of those counters.
      const kind = ifWritten.test.counter;
      if (!itIsSelf || kind === undefined || ability.trigger.event !== 'dies') {
        return failure(ifWritten, []);
      }
      const blocked = missingFeatures(['condition:sourceHasCounter']);
      if (blocked.length > 0) return failure(ifWritten, blocked);
      interveningIf = { kind: 'sourceHasCounter', counter: kind };
    }
  } else if (ifWritten?.test.kind === 'costContainsX') {
    // "Whenever you cast an instant or sorcery spell or activate an ability, if that spell's mana cost or that ability's activation cost contains {X}, ..." (Unbound Flourishing, CR 107.3,
    // 603.4): about the spell or ability of the event itself, so a part of each event, read as it happens: the spell has an {X} in its mana cost (`xInManaCost`), the ability an X in its
    // activation cost (`xCost`). The words name both, so the trigger must have both events and no other.
    const folded = foldCostContainsX(triggers);
    if (folded === null) return failure(ifWritten, []);
    const blocked = missingFeatures(['selector:xInManaCost', 'trigger:activatesAbilityX']);
    if (blocked.length > 0) return failure(ifWritten, blocked);
    triggers.splice(0, triggers.length, ...folded);
  } else if (ifWritten?.test.kind === 'youAreDefendingPlayer') {
    // "Whenever a creature an opponent controls attacks, if you're the defending player, ..." (Kazuul, CR 508.5, 603.4): whom the creature was declared as attacking is a part of the
    // event of the one `attacks` trigger, read as the attack is declared (the engine's `at: 'defendingYou'`), not an intervening "if" of its own.
    const [only] = triggers;
    if (events.length !== 1 || only?.kind !== 'attacks' || only.at !== undefined) {
      return failure(ifWritten, []);
    }
    const blocked = missingFeatures(['trigger:attacksAt']);
    if (blocked.length > 0) return failure(ifWritten, blocked);
    triggers[0] = { ...only, at: 'defendingYou' };
  } else if (ifWritten?.test.kind === 'enteredFromGraveyard') {
    // "Whenever one or more other creatures you control enter, if they entered or were cast from a graveyard, ..." (Twilight Diviner, CR 603.4, 603.6a): the zone each permanent came from
    // is a part of the event of the one `entersBatch` trigger, read as they enter (the engine's `fromGraveyard`), not an intervening "if" of its own.
    const [only] = triggers;
    if (events.length !== 1 || only?.kind !== 'entersBatch') return failure(ifWritten, []);
    const blocked = missingFeatures(['trigger:entersBattlefieldFromGraveyard']);
    if (blocked.length > 0) return failure(ifWritten, blocked);
    triggers[0] = { ...only, fromGraveyard: true };
  } else if (ifWritten?.test.kind === 'damageDealtByType') {
    // "Whenever your opponents are dealt combat damage, if any of that damage was dealt by a Warrior, ..." (issue 101, Mindblade Render, CR 510.2, 603.4): the batch trigger
    // counts the sources that match its filter, so "if any of that damage was dealt by a [type]" is the type in the filter of the sources, read as the damage is dealt.
    const [only] = triggers;
    if (events.length !== 1 || only?.kind !== 'combatDamageBatch') return failure(ifWritten, []);
    triggers[0] = {
      ...only,
      what: { ...only.what, subtypes: [...(only.what.subtypes ?? []), ifWritten.test.subtype] },
    };
  } else if (ifWritten?.test.kind === 'discardedCardHasKeyword') {
    // "Whenever you discard a card, if it has madness, ..." (Anje Falkenrath, CR 603.4, 702.35): the card the discard was about, as it is where it went, is a part of the event of the one
    // `discarded` trigger (its `filter`, which the engine reads against that card). The card does not lose or gain madness in the graveyard or in exile, so reading it as it is discarded
    // is the same as reading it again as the ability resolves.
    const [only] = triggers;
    if (events.length !== 1 || only?.kind !== 'discarded' || only.batch === true) {
      return failure(ifWritten, []);
    }
    const blocked = missingFeatures(['selector:hasMadness']);
    if (blocked.length > 0) return failure(ifWritten, blocked);
    triggers[0] = {
      ...only,
      filter: { ...(only.filter ?? {}), hasMadness: true },
    };
  } else if (ifWritten?.test.kind === 'notDeclaredAttacker') {
    // "Whenever a creature an opponent controls becomes tapped, if it isn't being declared as an attacker, ..." (Hylda deck, D-510, CR 508.1f): a part of the event of the one
    // `becomesTapped` trigger, read as it happens (the engine's `notAsAttacker`), not an intervening "if" of its own.
    const [only] = triggers;
    if (events.length !== 1 || only?.kind !== 'becomesTapped') return failure(ifWritten, []);
    const blocked = missingFeatures(['trigger:notAsAttacker']);
    if (blocked.length > 0) return failure(ifWritten, blocked);
    triggers[0] = { ...only, notAsAttacker: true };
  } else if (ifWritten !== undefined) {
    // D-271: "if ~ is in your graveyard" is read only here, as the intervening "if" (CR 603.4), and only for an ability that works from the graveyard (below).
    ctx.interveningCondition = true;
    const lowered = lowerCondition(ifWritten, itIsSelf, ctx);
    ctx.interveningCondition = false;
    if (!lowered.ok) return lowered;
    interveningIf = lowered.value;
    // Kodama of the East Tree (CR 400.7): "if it wasn't put onto the battlefield with this ability": the card this ability puts onto the battlefield remembers this ability's source.
    ctx.putWithThis = ifWritten.test.kind === 'notPutWithThisAbility' && ctx.entersPermanentTrigger;
    if (ifWritten.test.kind === 'notPutWithThisAbility' && !ctx.entersPermanentTrigger) {
      return failure(ifWritten, []);
    }
    // "if you chose a creature other than ~ as your Ring-bearer" (Galadriel deck, group 1, CR 701.54a): only the tempting of the Ring chooses a creature; the engine reads it from that event.
    if (
      interveningIf.kind === 'ringBearerChosen' &&
      !triggers.every((t) => t.kind === 'ringTempted')
    ) {
      return failure(ifWritten, []);
    }
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
  // Barbflare Gremlin: "Whenever a player taps a land for mana, if ~ is tapped, that player adds one mana of any type that land produced. Then that land deals 1 damage to that player."
  if (triggers.some((t) => t.kind === 'tapsForMana')) {
    const tapper = lowerTapperAddsMana(ability, triggers, interveningIf);
    if (tapper !== null) return tapper;
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

  // CR 107.3m (Hylda group 3): "When ~ enters, draw X cards": the X is the one of the spell the permanent came from.
  ctx.entersX = triggers.every(
    (t) => t.kind === 'entersBattlefield' && 'kind' in t.what && t.what.kind === 'this',
  );
  // CR 701.37c (Death Kiss): "When ~ becomes monstrous, goad up to X target creatures": the X is the one of the monstrosity.
  ctx.monstrousX = triggers.every(
    (t) => t.kind === 'becomesMonstrous' && 'kind' in t.what && t.what.kind === 'this',
  );
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
  ctx.itIsDamageSource = triggers.length > 0 && triggers.every((t) => t.kind === 'dealsDamage');
  // CR 509.1h, 509.3c: after a creature becomes blocked (or unblocked) it is still the same permanent in combat, which "it" names.
  ctx.itStaysInCombat =
    triggers.length > 0 &&
    triggers.every((t) => t.kind === 'becomesBlocked' || t.kind === 'becomesUnblocked');
  // Troyan 2 deck (CR 603.6c): "When ~ is put into a graveyard from anywhere": "it" is the card of the ability itself.
  ctx.selfGraveyardEntry =
    triggers.length > 0 && triggers.every((t) => t.kind === 'putIntoGraveyard' && t.self === true);
  // D-657: "When enchanted creature dies, return this card from your graveyard to the battlefield": the Aura has gone to the graveyard as well.
  ctx.auraDies = triggers.every(
    (t) => t.kind === 'dies' && 'kind' in t.what && t.what.kind === 'attached',
  );
  // D-284: "it" is the card of a creature that died only when every event is `~` dying: a leave-the-battlefield trigger may find the card in any zone.
  ctx.itDied = triggers.every(
    (t) => t.kind === 'dies' && 'kind' in t.what && t.what.kind === 'this',
  );
  ctx.diesTrigger = triggers.every((t) => t.kind === 'dies');
  ctx.damageBatchTrigger = triggers.every((t) => t.kind === 'combatDamageBatch');
  ctx.attackBatchThose =
    triggers.length > 0 &&
    triggers.every(
      (t) =>
        t.kind === 'attackBatch' &&
        t.who === 'you' &&
        t.attackedEnchantedPlayer !== true &&
        t.eachAttackedPlayer !== true &&
        t.eachAttackedOpponent !== true &&
        (t.what === undefined ||
          JSON.stringify(t.what) === JSON.stringify({ types: ['creature'] })),
    );
  ctx.youAttackBatchTrigger =
    triggers.length > 0 && triggers.every((t) => t.kind === 'attackBatch' && t.who === 'you');
  ctx.selfAttackTrigger =
    triggers.length > 0 &&
    triggers.every((t) => t.kind === 'attacks' && 'kind' in t.what && t.what.kind === 'this');
  // Haunted One (CR 603.2e): a creature that "becomes tapped" is an ability about the creature itself as well; "it" is the creature that has the ability.
  ctx.selfEntersOrAttacksTrigger =
    triggers.length > 0 &&
    triggers.every(
      (t) =>
        (t.kind === 'attacks' || t.kind === 'entersBattlefield' || t.kind === 'becomesTapped') &&
        'kind' in t.what &&
        t.what.kind === 'this',
    );
  // Titan of Littjara: "shares a creature type with it" is read only where "it" is the card itself.
  // Folk Hero (CR 205.3m): a spell cast "that shares a creature type with ~" is read against the creature types of the source of the ability, whatever the trigger is.
  // Only in the trigger: "it" in the body of a cast trigger could be the spell.
  const castTrigger =
    triggers.length > 0 &&
    triggers.every((t) => t.kind === 'castSpell') &&
    !usesSharesWithSource([ability.body, ability.modal]);
  if (!ctx.selfEntersOrAttacksTrigger && !castTrigger && usesSharesWithSource(written)) {
    return failure(written);
  }
  const bodies = ability.modal === undefined ? [ability.body] : ability.modal.modes;
  const clauses = bodies.flatMap((b) => b.sentences.flatMap((s) => s.clauses));
  // "It" in the body of "becomes the target" is the spell or ability that targeted (the engine's
  // `triggerSubject`), and the binding pass cannot tell that from the permanent: not read.
  if (
    triggers.some((t) => t.kind === 'becomesTarget') &&
    clauses.some((c) =>
      nounsOfClause(c).some(
        // Issue 133: "that spell or ability" of `effect.counter-that-unless` is the spell or ability itself, which the lowering of that clause reads as `triggerSubject`.
        (n) => n.det === 'triggerSubject' && n.rule !== 'effect.counter-that-unless',
      ),
    )
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
  if (ability.reflexiveModal !== undefined) {
    return lowerPaidModalTriggered(
      ability,
      ability.reflexiveModal,
      triggers,
      { interveningIf, triggerCondition, once },
      ctx,
    );
  }
  if (ability.modal !== undefined)
    return lowerModalTriggered(ability, ability.modal, triggers, interveningIf, ctx);
  // "You may draw a card unless that player pays {1}": the engine's `unlessPays` has its own `optional`
  // (the question comes after the payment, CR 118.12a), so the sentence keeps it and the ability's
  // `optional` is for the other sentences.
  type Sentence = Triggered['body']['sentences'][number];
  const sentences = withoutAnyNumberOffer(ability.body.sentences);
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
  // Death Toll deck, group D: "you may destroy another target creature. If a creature is destroyed this way, ..." is the same offer, and its sentence reads what the destroy did.
  const boughtSentence = (s: Sentence) =>
    s.condition?.test.kind === 'didPrevious' || s.condition?.test.kind === 'destroyedThisWay';
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
  // "You may cast target instant or sorcery card from a graveyard" (D-354): the engine's `castCard` asks the question itself, so the sentence's "you may" is no
  // question of the ability's; a cast with no "you may" is not read, and stays a sentence of the ability's own (`castCard` lowers only an optional clause).
  // D-394 (group 9): "you may put it onto the battlefield" and "you may cast it without paying its mana cost" of the card an instruction before exiled: the engine's `may`
  // of that move and its `castFree` ask the question themselves, so the same holds.
  // Lorehold group 1 (CR 608.2c): "you may search ... Then if an opponent controls more lands than you, repeat this process once": each search is its own offer (the engine's `search`
  // with `optional`), asked again when the process is repeated, so the "you may" is no question of the ability as a whole.
  const repeats = sentences.some((s) => s.clauses.some((c) => c.verb === 'repeatProcess'));
  const asksItself = (c: Sentence['clauses'][number]) =>
    c.optional &&
    ((repeats && c.verb === 'search') ||
      // Lorehold group 1: "you may exile one of them from your graveyard": the engine's choice of none or one card is the question.
      c.verb === 'exileOneOfThem' ||
      c.verb === 'castCard' ||
      c.verb === 'castThisFromGraveyard' ||
      c.verb === 'castMovedFree' ||
      // Prismari group 3 (D-660): "you may cast up to two spells from among ...": the engine's `castFree` asks which spells, and may stop.
      c.verb === 'castFromAmong' ||
      // Issue 100 (Baral and Kari Zev): "you may cast a spell ... from your hand without paying its mana cost. If you don't, ...": the engine's `castFree` asks (and may be declined).
      c.verb === 'castFree' ||
      // Issue 102 (Diviner of Mist): the engine's `castFree` of a card of the graveyard asks, and may be declined.
      c.verb === 'castChosenGraveyardSpell' ||
      // Summon: Esper Valigarmanda (issue 97): the engine's `castFree` with `paying` asks (and may be declined).
      c.verb === 'castExiledWithPaying' ||
      c.verb === 'putMovedOntoBattlefield' ||
      // Issue 103: "you may put a commander you own from the command zone onto the battlefield": the engine's choice of none or one card is the question.
      c.verb === 'putCommanderFromCommandZone' ||
      // Issue 102 (Teval, the Balanced Scale): "Then you may return a land card from your graveyard to the battlefield tapped": the engine's choice of none or one card is the offer.
      (c.verb === 'putFromZone' && sentences.length > 1) ||
      // D-411: "you may put a land card from among them into your hand": the engine's choice of none or one card is the question.
      c.verb === 'putFromAmong' ||
      // Journey to the Lost City: "you may put a land card from among those cards onto the battlefield": the engine's choice of none or one exiled card is the offer.
      c.verb === 'putFromAmongExiled' ||
      // Zimone, Mystery Unraveler: "Otherwise, you may turn a permanent you control face up": the engine's choice of none or one face-down permanent is the offer.
      c.verb === 'turnFaceUpChosen' ||
      // Kimahri, Valiant Guardian (CR 707.9b): "Then you may have ~ become a copy of that creature, except ...": the lowering wraps the copy in the engine's `may`.
      c.verb === 'becomeCopyKeepingAbility' ||
      // Limit Break deck (Yuffie, Materia Hunter): "Then you may attach an Equipment you control to ~": the engine's choice of none or one Equipment is the offer.
      c.verb === 'attachOwnToSelf' ||
      // Death Toll deck, group D (CR 608.2c, 608.2d): "you may mill three cards. Then if ..., ...": with sentences after it that do not depend on the offer, the "you may" is the
      // engine's `may` of the mill alone (the ability's own `optional` would cover the whole effect); a trigger of the one offer keeps the ability's `optional`.
      (c.verb === 'mill' && sentences.length > 1));
  // D-660 (Ajani's Chosen): "If that enchantment is an Aura, you may attach it to the token": the offer is the `may` of the attach, which sits beside the condition (the ability's own
  // `optional` could not). Without a condition the "you may" of an attach stays the ability's.
  const conditionalAttach = (s: Sentence) =>
    s.condition !== undefined && s.clauses.every((c) => c.verb === 'attach' && c.optional);
  const permission = (s: Sentence) =>
    conditionalAttach(s) || s.clauses.every((c) => c.verb === 'mayPlay' || asksItself(c));
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
  // Ahoy Mateys deck, Admiral Brass (CR 608.2d, 608.2c): "you may return target ... to the battlefield. It has base power and toughness 4/4. It gains haste until end of turn.": the one
  // "you may" is of the return, and every sentence after it is about the card it returned ("it"), which does nothing when the player does not return it; so the ability's own `optional`
  // asks the one question for the whole chain.
  const [first, ...rest] = others;
  const returnChain =
    first !== undefined &&
    first.verb === 'return' &&
    first.optional &&
    rest.length > 0 &&
    rest.every((c) => {
      const objects = arg(c, 'objects');
      return (
        !c.optional &&
        (c.verb === 'setPt' || c.verb === 'grantKeyword') &&
        objects?.kind === 'noun' &&
        objects.det === 'anaphor'
      );
    });
  // Terastodon (CR 608.2d, 608.2c): "you may destroy up to three target noncreature permanents. For each permanent put into a graveyard this way, its controller creates a 3/3 ... token.":
  // the one "you may" is of the destroy, and the tokens are made only for what it put into graveyards (none when the player declines), so the ability's own `optional` asks the one question.
  const destroyChain =
    first !== undefined &&
    first.verb === 'destroy' &&
    first.optional &&
    rest.length > 0 &&
    rest.every((c) => {
      const player = arg(c, 'player');
      return (
        !c.optional &&
        c.verb === 'createToken' &&
        player?.kind === 'noun' &&
        player.det === 'controllerOf' &&
        player.of?.det === 'graveyardedThisWay'
      );
    });
  // Embodiment of Fury (CR 608.2d, 603.5): "you may have target land you control become a 3/3 Elemental creature with haste until end of turn. It's still a land.": the one "you may" is of the
  // whole animation (the types and base power and toughness, then each keyword), so the ability's own `optional` asks the one question.
  const becomeChain =
    first !== undefined &&
    first.verb === 'becomes' &&
    first.optional &&
    rest.length > 0 &&
    rest.every((c) => c.optional && c.verb === 'grantKeyword') &&
    sentences.filter(ownMay).length === 1 &&
    others.slice(0, -1).every((c) => c.connector === 'and');
  const chain = returnChain || destroyChain || becomeChain;
  // Sephiroth, Fallen Hero (CR 608.2d, 603.3d): "you may put a cell counter on target creature. Until end of turn, each modified creature you control has base power and toughness 7/5.":
  // the "you may" is of the first instruction alone (the target is chosen as the ability goes on the stack, the question is asked as it resolves), and the sentences after it are
  // not about what it did, so it is the engine's `may` of that one instruction and not the ability's own `optional`, which would also drop the rest.
  const mayFirst =
    optional &&
    !chain &&
    !conditional &&
    first !== undefined &&
    first.verb === 'addCounters' &&
    first.optional &&
    others.length > 1 &&
    rest.every((c) => !c.optional) &&
    sentences[0]?.clauses[0] === first &&
    missingFeatures(['effect:may']).length === 0;
  // Tidus, Yuna's Guardian (CR 608.2d, 603.5): "you may draw a card and proliferate": the one "you may" of one sentence is for everything it joins with "and" (the parse marks each clause of it
  // optional), so the engine's `optional`
  // of the whole ability (all or nothing) is the question. Only the one sentence of the text, its first clause the offered one, no condition, and "and" between every clause ("then" says
  // an order the text of an offer does not, and is left to its own readings).
  const mayAnd =
    optional &&
    !chain &&
    !mayFirst &&
    !conditional &&
    first?.optional === true &&
    rest.length > 0 &&
    sentences.filter(ownMay).length === 1 &&
    rest.every((c) => c.optional && c.verb === 'proliferate') &&
    others.slice(0, -1).every((c) => c.connector === 'and');
  // Knollspine Dragon (CR 608.2d): "you may discard your hand and draw cards equal to ...": one sentence whose first instruction is the optional one and which joins others with "and"
  // is one offer for the whole sentence, which is what the ability's own `optional` is.
  const mayWholeSentence =
    optional &&
    !chain &&
    !conditional &&
    sentences.length === 1 &&
    others.length > 1 &&
    first?.optional === true &&
    // Only the shape "discard ... and draw ...": the draw goes with the discard it follows. Other pairs ("draw a card and you gain 1 life", a search and its shuffle) are not read.
    first.verb === 'discard' &&
    others.slice(1).every((c) => c.verb === 'draw');
  if (
    optional &&
    !mayFirst &&
    !mayAnd &&
    !mayWholeSentence &&
    ((others.length !== 1 && !chain) || conditional)
  ) {
    return failure(ability);
  }
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
        // `castCard` keeps its "you may": its lowering reads it (a cast that is not the player's choice is not run). So do the two instructions of D-394.
        optional:
          ownMay(s, i) || (permission(s) && !asksItself(c) && !conditionalAttach(s))
            ? false
            : c.optional,
      })),
    })),
    ctx,
  );
  ctx.graveyardSource = false;
  if (!lowered.ok) return lowered;
  let effects: readonly Effect[] = lowered.value;
  if (mayFirst) {
    const [head, ...tail] = effects;
    if (head?.kind !== 'addCounters') return failure(ability);
    effects = [{ kind: 'may', effect: head }, ...tail];
  }
  const [only] = effects;
  const effect: Effect =
    effects.length === 1 && only !== undefined ? only : { kind: 'sequence', effects: [...effects] };
  // D-271 (CR 113.6b, 113.6m): "if ~ is in your graveyard" belongs to an ability that works from the graveyard, which a trigger says by what it does to its
  // own card ("return ~ from your graveyard to the battlefield"); a trigger that only has the condition is not read (its card would be on the battlefield).
  if (
    JSON.stringify(interveningIf ?? null).includes('"thisInYourGraveyard"') &&
    !ctx.usedGraveyardSource
  ) {
    return failure(ability);
  }
  // CR 702.62b, 113.6b (Nihilith): "if this card is suspended" belongs to an ability that works from exile; the trigger is about other cards (a card put into a graveyard).
  const fromExile = JSON.stringify(interveningIf ?? null).includes('"thisSuspended"');
  if (fromExile) {
    const blockedExile = missingFeatures(['ability:functionsInExile']);
    if (blockedExile.length > 0) return failure(ability, blockedExile);
    if (ctx.usedGraveyardSource || !triggers.every((t) => t.kind === 'putIntoGraveyard')) {
      return failure(ability);
    }
  }
  if (ctx.usedGraveyardSource) {
    const blockedGraveyard = missingFeatures(['ability:functionsInGraveyard']);
    if (blockedGraveyard.length > 0) return failure(ability, blockedGraveyard);
    // A trigger of a card in its graveyard is about other things (CR 113.6b): "When ~ enters" would be about a card that is not on the battlefield.
    if (triggers.some((t) => 'what' in t && 'kind' in t.what)) return failure(ability);
  }
  // "none of those creatures attacked you" is about the attackers of the declaration that triggered the ability (stage P33, D-150, CR 508.1b).
  if (
    JSON.stringify([effect, interveningIf ?? null]).includes('"attackersAttackedYou"') &&
    !triggers.every((t) => t.kind === 'attackBatch')
  ) {
    return failure(ability);
  }
  // D-643 (CR 508.1b): "if two or more of those creatures are attacking you and/or planeswalkers you control" is about the attackers of the declaration that triggered the ability.
  if (
    JSON.stringify(interveningIf ?? null).includes('"attackersAtYouAtLeast"') &&
    // Whom the attackers attacked is said of another player's attack: the controller's own creatures never attack the controller.
    !triggers.every((t) => t.kind === 'attackBatch' && t.who !== 'you')
  ) {
    return failure(ability);
  }
  // D-654 (CR 603.10a): "for each Aura you controlled that was attached to it" is about the permanent that left the battlefield, which only a `dies` or `leavesBattlefield` trigger has.
  if (
    JSON.stringify(effect).includes('"aurasAttachedToTriggerSubject"') &&
    !triggers.every((t) => t.kind === 'dies' || t.kind === 'leavesBattlefield')
  ) {
    return failure(ability);
  }
  // D-653 (CR 508.6): "if that opponent has more life than another of your opponents" is about the player a "whenever a player attacks one of your opponents" trigger is about.
  if (
    JSON.stringify(interveningIf ?? null).includes('"attackedHasMoreLifeThanOtherOpponent"') &&
    !triggers.every((t) => t.kind === 'playerAttacksOpponent')
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
      ...(optional && !mayFirst ? { optional: true } : {}),
      ...(interveningIf === undefined ? {} : { interveningIf }),
      ...(triggerCondition === undefined ? {} : { triggerCondition }),
      ...(once ? { oncePerTurn: true as const } : {}),
      ...(doOnce ? { doOnlyOnceEachTurn: true as const } : {}),
      ...(ctx.usedGraveyardSource ? { functionsIn: 'graveyard' as const } : {}),
      ...(fromExile ? { functionsIn: 'exile' as const } : {}),
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
    (spec.what.kind !== 'symbols' &&
      spec.what.kind !== 'anyColor' &&
      spec.what.kind !== 'producedType')
  ) {
    return failure(ability);
  }
  const [trigger] = triggers;
  if (trigger === undefined || trigger.kind !== 'tappedForMana') return failure(ability);
  // CR 605.1b, 106.12: "its controller adds" is for the controller of the land tapped (`by: 'tapper'`), and "add" for the controller of the ability (`by: 'you'`).
  if ((clause.args.controller !== undefined) !== (trigger.by === 'tapper')) return failure(ability);
  // CR 106.1b, 605.3b: one mana of any color is chosen as the mana ability that triggered this one is activated.
  if (spec.what.kind === 'anyColor' && (spec.what.count !== undefined || trigger.by !== 'tapper')) {
    return failure(ability);
  }
  // CR 106.12a, 605.4a: "one mana of any type that land produced" is for the controller of the ability, and the permanent it names is the kind the trigger names.
  if (spec.what.kind === 'producedType') {
    const named = spec.what.noun;
    const tappedTypes: readonly string[] = trigger.what.types ?? [];
    if (
      trigger.by !== 'you' ||
      trigger.mana !== undefined ||
      (named !== 'permanent' && !tappedTypes.includes(named))
    ) {
      return failure(ability);
    }
  }
  const blocked = missingFeatures([
    'ability:triggered',
    'trigger:tappedForMana',
    'effect:addMana',
    ...(spec.what.kind === 'producedType' ? (['manaProduction:producedType'] as const) : []),
  ]);
  if (blocked.length > 0) return failure(ability, blocked);
  const mana: ManaProduction =
    spec.what.kind === 'anyColor'
      ? { kind: 'anyColor' }
      : spec.what.kind === 'producedType'
        ? { kind: 'producedType' }
        : { kind: 'fixed', mana: spec.what.symbols as ('W' | 'U' | 'B' | 'R' | 'G' | 'C')[] };
  return {
    ok: true,
    value: [{ kind: 'triggered', trigger, effect: { kind: 'addMana', mana } }],
    rule: ability.trigger.rule,
  };
}

/**
 * "Whenever a player taps a land for mana, [if ~ is tapped,] that player adds one mana of any type that land produced. Then that land deals 1 damage to that player." (Barbflare
 * Gremlin; CR 605.1b, 605.4a, 106.12a, 603.4): a triggered mana ability about whoever taps the land (`tappedForMana` by the `tapper`), whose effect is the mana and the damage, with the
 * "if" only about the permanent itself (the engine reads it when the mana ability is activated). Null when the body is not that one instruction (the ordinary lowering takes the ability).
 */
function lowerTapperAddsMana(
  ability: Triggered,
  triggers: readonly Trigger[],
  interveningIf: Condition | undefined,
): LowerResult<readonly Ability[]> | null {
  const [sentence, ...more] = ability.body.sentences;
  const [clause, ...others] = sentence?.clauses ?? [];
  if (clause?.verb !== 'tapperAddsProducedTypeThenDamage') return null;
  const amount = clause.args.amount;
  const [trigger] = triggers;
  if (
    triggers.length !== 1 ||
    trigger?.kind !== 'tapsForMana' ||
    trigger.who !== 'any' ||
    more.length > 0 ||
    others.length > 0 ||
    ability.modal !== undefined ||
    clause.optional ||
    clause.condition !== undefined ||
    amount?.kind !== 'number' ||
    (interveningIf !== undefined &&
      !(
        interveningIf.kind === 'thisMatches' &&
        Object.keys(interveningIf.filter).every((k) => k === 'tapped' || k === 'raw')
      )) ||
    sentence === undefined ||
    sentence.where !== undefined
  ) {
    return failure(ability);
  }
  const blocked = missingFeatures([
    'ability:triggered',
    'trigger:tappedForMana',
    'effect:addMana',
    'effect:dealDamage',
    'manaProduction:producedType',
    ...(interveningIf === undefined ? [] : (['trigger:interveningIf'] as const)),
  ]);
  if (blocked.length > 0) return failure(ability, blocked);
  return {
    ok: true,
    value: [
      {
        kind: 'triggered',
        trigger: { kind: 'tappedForMana', what: trigger.what, by: 'tapper' },
        ...(interveningIf === undefined ? {} : { interveningIf }),
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'addMana', mana: { kind: 'producedType' } },
            { kind: 'dealDamage', amount: amount.value, to: { kind: 'triggerPlayer' } },
          ],
        },
      },
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
  'trigger:entersCausesTrigger',
  'trigger:dies',
  'trigger:attacks',
  'trigger:alone',
  'trigger:attacksAt',
  'trigger:dealtDamage',
  'trigger:dealtDamageNoncombat',
  'trigger:dealtDamageExcess',
  'trigger:becomesTapped',
  'trigger:becomesUntapped',
  'trigger:becomesMonstrous',
  'trigger:turnedFaceUp',
  'trigger:blocks',
  'trigger:becomesBlocked',
  'trigger:becomesUnblocked',
  'trigger:landfall',
  'trigger:upkeep',
  'trigger:endStep',
  'trigger:permanentSacrificed',
  'trigger:castSpell',
  'trigger:becomesTarget',
  'trigger:becomesTargetActivated',
  'trigger:chapter',
  'trigger:step',
  'trigger:drawn',
  'trigger:dealsCombatDamage',
  'trigger:dealsDamage',
  'trigger:leavesBattlefield',
  'trigger:entersUntapped',
  'trigger:leavesToAnyOf',
  'trigger:combatDamageBatch',
  'trigger:damageBatch',
  'trigger:diesBatch',
  'trigger:discarded',
  'trigger:exerted',
  'trigger:playsCard',
  'trigger:doorUnlocked',
  'trigger:exploits',
  'static:exertOnAttack',
  'trigger:tappedForMana',
  'trigger:tapsForMana',
  'trigger:state',
  'trigger:lifeGained',
  'trigger:lifeLost',
  'trigger:noncombatDamageDealt',
  'trigger:dealtDamageToPlayer',
  'trigger:damageToPlayerPrevented',
  'trigger:countersAdded',
  'trigger:attackBatch',
  'trigger:unblockedAttackBatch',
  'trigger:playerAttacksOpponent',
  'trigger:entersBatch',
  'trigger:leftGraveyard',
  'trigger:exiledFromLibraryOrGraveyard',
  'trigger:putIntoGraveyard',
  'trigger:castNth',
  'trigger:castFirstOfKind',
  'trigger:crimeCommitted',
  'trigger:tokenCreated',
  'trigger:activatesAbility',
  'trigger:activatesAbilityOfSource',
  'trigger:tappedBy',
  'trigger:tapBatch',
  'trigger:lifeLostBatch',
  'trigger:lifeLostDuringTheirTurn',
  'trigger:notAsAttacker',
  'trigger:entersBattlefieldFromGraveyard',
  'trigger:entersBattlefieldFromYourGraveyard',
  'trigger:scries',
  'trigger:surveils',
  'trigger:surveilsFirstEachTurn',
  'trigger:removesCounterWhileExiled',
  'trigger:rollsHighest',
  'trigger:winsCoinFlip',
  'trigger:winsClash',
  'trigger:votingFinished',
  'ability:oncePerTurn',
  'ability:doOnlyOnceEachTurn',
  'condition:duringStep',
  'condition:chosenOption',
  'selector:attached',
  'layout:saga',
];
