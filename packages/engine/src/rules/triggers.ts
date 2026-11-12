/**
 * Triggered abilities (CR 603): noticing that one has triggered.
 *
 * `collectTriggers` reads the events a batch of game changes produced and adds a `PendingTrigger`
 * for every triggered ability whose trigger event they contain (CR 603.2). The pending triggers
 * wait in `GameState.pendingTriggers` until `putTriggersOnStack` (trigger-stack.ts) puts them on the
 * stack the next time a player would receive priority (CR 603.3).
 *
 * Which objects are checked, and how they look (CR 603.10):
 * - Normally the objects that exist immediately after the event, so an enters ability sees the
 *   permanents on the battlefield including the newcomers (CR 603.6a).
 * - Leaves-the-battlefield triggers and "whenever you sacrifice" abilities look back in time
 *   (CR 603.10a): the objects on the battlefield immediately before the event, as they were. Objects
 *   that leave together see each other leave, and a permanent that leaves sees itself leave. The
 *   engine keeps the last-known information of everything that leaves (`GameState.lki`).
 *
 * The intervening "if" (CR 603.4) is checked here, against the same battlefield the trigger event
 * is matched on, and again when the ability resolves (`stack.ts`). For the look-back triggers
 * (CR 603.10a) the check reads the game as it is after the event, so `validateCard` refuses an
 * intervening "if" that counts permanents on one of them (`ast/supported.ts`).
 *
 * A Saga's chapter abilities (CR 714.2) trigger from the `counterAdded` events of lore counters, once
 * for each chapter number the counters newly reached (rules/saga.ts).
 *
 * Delayed triggered abilities (CR 603.7) are kept in `GameState.delayedTriggers` and found here too
 * (`findDelayedTriggers`, D-121); reflexive triggers (CR 603.12) are made by `may-effects.ts` when an effect
 * resolves. Not yet: triggers of objects outside the battlefield; see docs/ROADMAP.md. A trigger's targets are chosen as it goes on the stack
 * (CR 603.3d, trigger-stack.ts).
 */
import { LOOK_BACK_TRIGGER_KINDS } from '../ast/features';
import type { Ability, Trigger, TriggerStep, TriggerSubject, Zone } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { AttackTarget, DamageRecipient } from '../state/combat-types';
import type { GameEvent } from '../state/events';
import type {
  DelayedTrigger,
  GameObject,
  GameState,
  PendingTrigger,
  StepId,
  TriggeredAbility,
} from '../state/types';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { derive } from './derive';
import { emblemsOf } from './emblem';
import { findLaterTriggers } from './later-triggers';
import { findMonarchTriggers } from './monarch';
import { findRingTriggers } from './ring';
import { chaptersReached, loreChange, readAheadBlocks } from './saga';
import { matchesFilter } from './select';
import { objectOrLki } from './source-info';
import { findStateTriggers } from './state-triggers';
import { withDoubledTriggers } from './trigger-doubling';
import { readsTriggerPlayer } from './trigger-subject';

/** Trigger kinds that look back in time (CR 603.10a). */
const LOOK_BACK: ReadonlySet<Trigger['kind']> = new Set(LOOK_BACK_TRIGGER_KINDS);

/**
 * The step each `step` trigger names (CR 500.1, 500.2): the precombat and postcombat main phases are the
 * steps of those names here, and "combat ends" the end of combat step (CR 511).
 */
const STEP_OF: Readonly<Record<TriggerStep, StepId>> = {
  upkeep: 'upkeep',
  draw: 'draw',
  main1: 'precombatMain',
  beginCombat: 'beginningOfCombat',
  combatEnd: 'endOfCombat',
  main2: 'postcombatMain',
  endStep: 'end',
};
const TRIGGER_STEP_IDS: ReadonlySet<StepId> = new Set(Object.values(STEP_OF));

/** Who caused the trigger event: an object, a seat, or both. */
interface Occurrence {
  readonly subject: ObjectId | null;
  readonly seat: SeatId | null;
  /** For `becomesTarget`: the object that became a target, while `subject` is what targeted it. */
  readonly target?: ObjectId;
  /** For `chapter`: the chapter number that was reached (CR 714.2b). */
  readonly chapter?: number;
  /** For `dealsCombatDamage`: what the damage was dealt to. */
  readonly damaged?: DamageRecipient;
  /** For `leavesBattlefield`: the zone the permanent went to. */
  readonly toZone?: Zone;
  /** For `drawn`: how many cards the player has drawn this turn, this one included. */
  readonly nth?: number;
  /** For `attacks`: whom the creature was declared as attacking (CR 508.1b). */
  readonly attackTarget?: AttackTarget;
  /** The player the event is about, for `triggerPlayer` (D-133). */
  readonly player?: SeatId;
  /** The damage the event dealt, for `triggerDamage` and `dealtDamage` (D-133). */
  readonly damage?: number;
  /** For `lifeGained`: how many times the player has gained life this turn, this one included (D-149). */
  readonly gainNth?: number;
  /** For `countersAdded`: the kind of the counters put on (D-149). */
  readonly counter?: string;
  /** For `attackBatch`: the creatures declared as attackers and the players they were declared as attacking (D-149). */
  readonly attackers?: readonly ObjectId[];
  readonly attacked?: readonly SeatId[];
}

/** The controller of a damage source, as it is or as it last was (CR 113.7a); null when unknown. */
function controllerOfSource(state: GameState, source: ObjectId): SeatId | null {
  const live = state.objects[source];
  if (live !== undefined) return controllerOf(state, live);
  return state.lki[source]?.object.controller ?? null; // stored controller: frozen as it left (`recordLki`)
}

/**
 * The player the event is about, for the pending trigger. The player of the beginning of a step is the active player (the Bruna deck, "that player" of
 * "at the beginning of each opponent's end step"): it is kept only for an ability that reads it, so the other step triggers stay as they were.
 */
function eventPlayer(ability: Ability, occ: Occurrence): { readonly player?: SeatId } {
  const kind = ability.kind === 'triggered' ? ability.trigger.kind : null;
  const ofStep = kind === 'step' || kind === 'upkeep' || kind === 'endStep';
  return occ.player === undefined || (ofStep && !readsTriggerPlayer(ability))
    ? {}
    : { player: occ.player };
}

/** The trigger occurrences an event contains for a trigger kind. */
function occurrences(
  state: GameState,
  trigger: Trigger,
  event: GameEvent,
  lore: { readonly before: number; readonly after: number } | null,
): Occurrence[] {
  switch (trigger.kind) {
    case 'entersBattlefield':
    case 'landfall':
      // CR 603.6a. A token entering has no previous object, so it has its own event. The player the event is about (`triggerPlayer`, D-229:
      // "that player controls more lands than you") is whoever controls the permanent as it enters.
      if (event.kind === 'zoneChanged' && event.toZone === 'battlefield') {
        const entered = state.objects[event.to];
        return [
          {
            subject: event.to,
            seat: null,
            ...(entered === undefined ? {} : { player: controllerOf(state, entered) }),
          },
        ];
      }
      return event.kind === 'tokenCreated'
        ? [{ subject: event.object, seat: event.seat, player: event.seat }]
        : [];
    case 'entersBatch':
      // CR 603.2c, 603.6a (D-218): every permanent that enters in these events is an occurrence; `findTriggers` keeps the first one that the filter names.
      if (event.kind === 'zoneChanged' && event.toZone === 'battlefield') {
        return [{ subject: event.to, seat: null }];
      }
      return event.kind === 'tokenCreated' ? [{ subject: event.object, seat: event.seat }] : [];
    case 'dies':
      return event.kind === 'died' ? [{ subject: event.object, seat: null }] : [];
    case 'attacks':
      if (event.kind !== 'attackersDeclared') return [];
      // CR 506.5, 702.83b: a creature attacks alone if it is the only creature declared as an attacker.
      if (trigger.alone === true && event.attackers.length !== 1) return [];
      return event.attackers.map((a) => ({
        subject: a.object,
        seat: event.seat,
        attackTarget: a.target,
        player: event.seat,
      }));
    case 'castSpell':
      // D-218 (CR 707.10): a copy put onto the stack is not cast, but "cast or copy" counts it, under the control of the player who has it.
      if (trigger.orCopy === true && event.kind === 'spellCopied') {
        return [{ subject: event.copy, seat: event.seat, player: event.seat }];
      }
      return event.kind === 'spellCast'
        ? [{ subject: event.object, seat: event.seat, player: event.seat, nth: event.nth }]
        : [];
    case 'cycled':
      // CR 702.29c (D-179): the card that was cycled, where it wound up.
      return event.kind === 'cycled'
        ? [{ subject: event.object, seat: event.seat, player: event.seat }]
        : [];
    case 'blocks':
      // CR 509.1g, 702.45a: one occurrence for each creature declared as a blocker.
      return event.kind === 'blockersDeclared'
        ? event.blocks.map((b) => ({ subject: b.blocker, seat: event.seat }))
        : [];
    case 'becomesBlocked':
      // CR 509.1h: an attacking creature becomes blocked once, however many creatures block it.
      return event.kind === 'blockersDeclared'
        ? [...new Set(event.blocks.map((b) => b.attacker))].map((attacker) => ({
            subject: attacker,
            seat: null,
          }))
        : [];
    case 'step':
      // CR 500.2, 603.2: as the step begins; the active player is the one whose turn it is.
      return event.kind === 'stepBegan' && event.step === STEP_OF[trigger.step]
        ? [{ subject: null, seat: event.seat, player: event.seat }]
        : [];
    case 'drawn':
      // CR 121.1: a card drawn; a draw that was replaced (CR 903.9b) has no `cardDrawn` event.
      return event.kind === 'cardDrawn'
        ? [{ subject: event.object, seat: event.seat, nth: event.nth, player: event.seat }]
        : [];
    case 'dealsCombatDamage':
      // CR 120.2a, 510.2: one occurrence for each source and each object or player it damages. Damage
      // that was prevented entirely has no `damageDealt` event, so it triggers nothing (CR 603.2g).
      return event.kind === 'damageDealt' && event.combat
        ? [
            {
              subject: event.source,
              seat: null,
              damaged: event.to,
              damage: event.amount,
              ...(event.to.kind === 'player' ? { player: event.to.seat } : {}),
            },
          ]
        : [];
    case 'dealtDamage':
      // CR 120.3, 603.2 (D-133): one occurrence for each source that damages a permanent, when the damage is dealt.
      // The controller of the source is the player "that creature's controller" names.
      return event.kind === 'damageDealt' &&
        event.to.kind === 'object' &&
        (trigger.combat !== true || event.combat)
        ? [
            {
              subject: event.to.id,
              seat: null,
              damage: event.amount,
              ...(controllerOfSource(state, event.source) === null
                ? {}
                : { player: controllerOfSource(state, event.source) as SeatId }),
            },
          ]
        : [];
    case 'leavesBattlefield':
      // CR 603.6c: a permanent moved from the battlefield to another zone (a token too).
      return event.kind === 'zoneChanged' && event.fromZone === 'battlefield'
        ? [{ subject: event.from, seat: null, toZone: event.toZone }]
        : [];
    case 'upkeep':
      return event.kind === 'stepBegan' && event.step === 'upkeep'
        ? [{ subject: null, seat: event.seat, player: event.seat }]
        : [];
    case 'endStep':
      return event.kind === 'stepBegan' && event.step === 'end'
        ? [{ subject: null, seat: event.seat, player: event.seat }]
        : [];
    case 'permanentSacrificed':
      return event.kind === 'sacrificed'
        ? [{ subject: event.permanent, seat: event.controller, player: event.controller }]
        : [];
    case 'becomesTapped':
      return event.kind === 'tapped' ? [{ subject: event.object, seat: null }] : [];
    case 'becomesUntapped':
      // CR 603.2e (D-206): a permanent that untaps (the untap step or an effect); a stun counter that stops it (CR 122.1d) makes no `untapped` event.
      return event.kind === 'untapped' ? [{ subject: event.object, seat: null }] : [];
    case 'discarded':
      // CR 701.9a (D-206): the card is the object it became in the graveyard (or exile, for madness), so the ability may name it.
      return event.kind === 'discarded' && event.to !== null
        ? [{ subject: event.to, seat: event.seat, player: event.seat }]
        : [];
    case 'diesBatch':
      // CR 603.10a, 603.2c (D-206): every creature that died in these events is an occurrence; `findTriggers` keeps the first one that the filter names.
      return event.kind === 'died' ? [{ subject: event.object, seat: null }] : [];
    case 'leftGraveyard':
      // CR 400.7, 603.2c (D-229): a card that left a graveyard for another zone, by the player who owns it ("your graveyard").
      return event.kind === 'zoneChanged' &&
        event.fromZone === 'graveyard' &&
        event.toZone !== 'graveyard' &&
        event.card !== null
        ? [{ subject: null, seat: state.cards[event.card]?.owner ?? null }]
        : [];
    case 'exiledFromLibraryOrGraveyard':
      // CR 400.7, 603.2c (D-229): a card put into exile from its owner's library or graveyard, by the player who owns it.
      return event.kind === 'zoneChanged' &&
        event.toZone === 'exile' &&
        (event.fromZone === 'library' || event.fromZone === 'graveyard') &&
        event.card !== null
        ? [{ subject: null, seat: state.cards[event.card]?.owner ?? null }]
        : [];
    case 'tapsForMana':
      // CR 106.12, 603.2 (D-189): the permanent tapped for mana (gone already when it was sacrificed as part of the ability: its last-known
      // information is read) and the player who tapped it.
      return event.kind === 'tappedForMana'
        ? [{ subject: event.object, seat: event.seat, player: event.seat }]
        : [];
    case 'becomesTarget':
      // CR 702.21a: the spell or ability is the subject, the permanent it targeted the `target`.
      return event.kind === 'becameTarget'
        ? [{ subject: event.by, seat: event.seat, target: event.object, player: event.seat }]
        : [];
    case 'state':
      // CR 603.8 (D-139): a state trigger has no event: it is found from the state (`rules/state-triggers.ts`).
      return [];
    case 'tappedForMana':
      // CR 605.4 (D-139): a triggered mana ability resolves as the mana ability that triggered it is activated (`rules/mana-triggers.ts`).
      return [];
    case 'combatDamageBatch':
      // CR 603.2c (D-139): "one or more": once for the whole batch of damage, found after the events are read (`batchOccurrences`).
      return [];
    case 'lifeGained':
      // CR 119.9 (D-149): one occurrence for each gain of life.
      return event.kind === 'lifeGained'
        ? [
            {
              subject: null,
              seat: event.seat,
              player: event.seat,
              gainNth: event.nth,
              // D-256: "that many" is the life gained, after replacement (CR 119.9).
              damage: event.amount,
            },
          ]
        : [];
    case 'countersAdded':
      // CR 122.6, 122.6a (D-149): counters put on a permanent, by the player who put them.
      return event.kind === 'counterAdded'
        ? [
            {
              subject: event.object,
              seat: event.by ?? null,
              counter: event.counter,
            },
          ]
        : [];
    case 'attackBatch':
      // CR 508.1, 603.2 (D-149): once for the whole declaration, whoever the creatures attack.
      return event.kind === 'attackersDeclared'
        ? [
            {
              subject: null,
              seat: event.seat,
              player: event.seat,
              attackers: event.attackers.map((a) => a.object),
              attacked: event.attackers.flatMap((a) =>
                a.target.kind === 'player' ? [a.target.seat] : [],
              ),
            },
          ]
        : [];
    case 'ringTempted':
      // CR 701.54d (D-196): each time the Ring tempts a player, whatever they could choose.
      return event.kind === 'ringTempted'
        ? [{ subject: null, seat: event.seat, player: event.seat }]
        : [];
    case 'chapter':
      // CR 714.2b, 714.2c: once for each chapter number the lore counters newly reached.
      if (event.kind !== 'counterAdded' || lore === null) return [];
      return chaptersReached(lore, trigger.from, trigger.to).map((chapter) => ({
        subject: event.object,
        seat: null,
        chapter,
      }));
    default: {
      const unreachable: never = trigger;
      return unreachable;
    }
  }
}

/** An object that may have triggered abilities: where they are and who controls them. */
interface Candidate {
  readonly id: ObjectId;
  readonly controller: SeatId;
  /** What it is attached to, as it was when the event happened (D-111, `attached` subjects). */
  readonly attachedTo: ObjectId | null;
  /** Triggered abilities with their index among the object's abilities. */
  readonly triggered: readonly { readonly index: number; readonly ability: TriggeredAbility }[];
}

function triggeredOf(abilities: readonly Ability[], inGraveyard = false): Candidate['triggered'] {
  // CR 113.6b (D-151): an ability that works from the graveyard works only there; the others work where the object is checked from.
  // CR 702.29c (D-179): "when you cycle this card" works from whatever zone the card winds up in, so it is found wherever the card is.
  return abilities.flatMap((ability, index) =>
    ability.kind === 'triggered' &&
    ((ability.functionsIn === 'graveyard') === inGraveyard || ability.trigger.kind === 'cycled')
      ? [{ index, ability }]
      : [],
  );
}

/**
 * The objects outside the battlefield that have a triggered ability working there: the cards in the graveyards (CR 113.6b, D-151), by their
 * definitions, and the emblems of the command zones (CR 114.4, D-201).
 */
function graveyardTriggerCards(state: GameState): ObjectId[] {
  const out: ObjectId[] = [];
  for (const seat of state.seats) {
    for (const id of seat.graveyard) {
      const card = state.objects[id]?.card;
      const definition = card === null || card === undefined ? undefined : state.cards[card];
      const face =
        definition === undefined ? undefined : state.definitions[definition.definition]?.faces[0];
      if (face?.abilities.some((a) => a.kind === 'triggered' && a.functionsIn === 'graveyard')) {
        out.push(id);
      }
    }
  }
  // CR 114.4 (D-201): the triggered abilities of an emblem work from the command zone.
  out.push(...emblemsOf(state));
  return out;
}

function candidateFor(state: GameState, id: ObjectId): Candidate | null {
  const live = state.objects[id];
  if (live) {
    return {
      id,
      controller: controllerOf(state, live),
      attachedTo: live.attachedTo,
      triggered: triggeredOf(derive(state, live).abilities, live.zone === 'graveyard'),
    };
  }
  // CR 113.7a, 603.10a: an object that has left is checked as it last existed.
  const lki = state.lki[id];
  if (!lki) return null;
  return {
    id,
    controller: lki.object.controller, // stored controller
    attachedTo: lki.object.attachedTo,
    triggered: triggeredOf(lki.abilities),
  };
}

function matchesWhat(
  state: GameState,
  what: TriggerSubject,
  subject: GameObject | null,
  candidate: Candidate,
): boolean {
  if (subject === null) return false;
  if ('kind' in what) {
    // D-111: "equipped creature": the permanent this one is attached to, which is still the id the host
    // had when it left (the attachment is only undone by a later state-based action, CR 704.5n).
    return what.kind === 'attached'
      ? candidate.attachedTo === subject.id
      : subject.id === candidate.id;
  }
  return matchesFilter(state, subject, what, {
    controller: candidate.controller,
    source: candidate.id,
  });
}

/**
 * CR 508.1b (D-133): whether the creature was declared as attacking what the trigger names: the controller of the
 * ability as a player, or also a planeswalker that player controls.
 */
function attacksAt(
  state: GameState,
  at: 'you' | 'youOrPlaneswalkers' | undefined,
  target: AttackTarget | undefined,
  you: SeatId,
): boolean {
  if (at === undefined) return true;
  if (target === undefined) return false;
  if (target.kind === 'player') return target.seat === you;
  if (at === 'you') return false;
  const permanent = objectOrLki(state, target.object);
  return (
    permanent !== null &&
    controllerOf(state, permanent) === you &&
    derive(state, permanent).types.includes('planeswalker')
  );
}

function matches(
  state: GameState,
  trigger: Trigger,
  occ: Occurrence,
  candidate: Candidate,
): boolean {
  const subject = occ.subject === null ? null : objectOrLki(state, occ.subject);
  const ctx = { controller: candidate.controller, source: candidate.id };
  switch (trigger.kind) {
    case 'attacks':
      if (!matchesWhat(state, trigger.what, subject, candidate)) return false;
      // D-151: "attacks for the first time each turn": this declaration is the only one of the creature in the turn log.
      if (
        trigger.firstTimeEachTurn === true &&
        state.turnLog.attacked.filter((a) => a === occ.subject).length !== 1
      ) {
        return false;
      }
      return attacksAt(state, trigger.at, occ.attackTarget, candidate.controller);
    case 'entersBattlefield':
      // D-135: "enters untapped" / "enters tapped": how it entered, as it is the moment the event is noticed (the state its
      // enters replacements, CR 614.1c, left it in).
      if (trigger.tapped !== undefined && subject?.tapped !== trigger.tapped) return false;
      return matchesWhat(state, trigger.what, subject, candidate);
    case 'diesBatch':
    case 'entersBatch':
      return subject !== null && matchesFilter(state, subject, trigger.what, ctx);
    case 'leftGraveyard':
    case 'exiledFromLibraryOrGraveyard':
      return occ.seat === candidate.controller;
    case 'discarded':
      if (trigger.who === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.who === 'opponent' && occ.seat === candidate.controller) return false;
      return true;
    case 'dies':
    case 'dealtDamage':
    case 'becomesTapped':
    case 'becomesUntapped':
    case 'blocks':
    case 'becomesBlocked':
      return matchesWhat(state, trigger.what, subject, candidate);
    case 'state':
    case 'tappedForMana':
    case 'combatDamageBatch':
      return false;
    case 'lifeGained':
      if (trigger.who === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.who === 'opponent' && occ.seat === candidate.controller) return false;
      return trigger.firstEachTurn !== true || occ.gainNth === 1;
    case 'countersAdded':
      if (trigger.counter !== undefined && occ.counter !== trigger.counter) return false;
      if (trigger.by === 'you' && occ.seat !== candidate.controller) return false;
      return matchesWhat(state, trigger.what, subject, candidate);
    case 'attackBatch': {
      if (trigger.who === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.who === 'opponent' && occ.seat === candidate.controller) return false;
      const attackers = occ.attackers ?? [];
      const counted =
        trigger.what === undefined
          ? attackers.length
          : attackers.filter((id) => {
              const creature = objectOrLki(state, id);
              return creature !== null && matchesFilter(state, creature, trigger.what ?? {}, ctx);
            }).length;
      return counted >= trigger.atLeast;
    }
    case 'chapter':
      // CR 714.2b: "when lore counters are put onto this Saga": the Saga the ability sits on.
      return subject !== null && subject.id === candidate.id;
    case 'cycled':
      // CR 702.29c: "when you cycle this card": the card with the ability is the one that was cycled.
      return subject !== null && subject.id === candidate.id;
    case 'ringTempted':
      // CR 701.54d: "Whenever the Ring tempts you": the player the Ring tempted controls the ability.
      return occ.seat === candidate.controller;
    case 'landfall':
      // "Whenever a land enters under your control": the land's controller is the ability's.
      return (
        subject !== null &&
        controllerOf(state, subject) === candidate.controller &&
        derive(state, subject).types.includes('land')
      );
    case 'castSpell':
      if (subject === null) return false;
      // CR 702.85a (D-120): "When you cast this spell" is the spell's own ability, for that spell only.
      if (trigger.self === true && subject.id !== candidate.id) return false;
      if (trigger.by === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.by === 'opponent' && occ.seat === candidate.controller) return false;
      // D-229: "their second spell each turn": the caster's nth spell of the turn.
      if (trigger.nth !== undefined && occ.nth !== trigger.nth) return false;
      return matchesFilter(state, subject, trigger.filter, ctx);
    case 'step':
      // CR 503 to 514: whose turn it is, relative to the controller of the ability.
      if (trigger.whose === 'you') return occ.seat === candidate.controller;
      return trigger.whose === 'each' || occ.seat !== candidate.controller;
    case 'drawn':
      if (trigger.who === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.who === 'opponent' && occ.seat === candidate.controller) return false;
      return trigger.nth === undefined || occ.nth === trigger.nth;
    case 'dealsCombatDamage': {
      if (!matchesWhat(state, trigger.what, subject, candidate)) return false;
      const to = occ.damaged;
      if (to === undefined) return false;
      if (trigger.to === 'any') return true;
      if (trigger.to === 'player') return to.kind === 'player';
      if (trigger.to === 'opponent')
        return to.kind === 'player' && to.seat !== candidate.controller;
      // A creature: the filter, when there is one, narrows it. It has not left yet (state-based
      // actions come after the damage), so it is read as it is, or as it last was if it already has.
      if (to.kind !== 'object') return false;
      const hit = objectOrLki(state, to.id);
      const hitFilter = trigger.filter ?? {};
      return (
        hit !== null &&
        matchesFilter(
          state,
          hit,
          { ...hitFilter, types: [...(hitFilter.types ?? []), 'creature'] },
          ctx,
        )
      );
    }
    case 'leavesBattlefield':
      // D-135: one zone or several ("dies or is put into exile from the battlefield").
      if (trigger.to !== undefined) {
        const zones = typeof trigger.to === 'string' ? [trigger.to] : trigger.to;
        if (occ.toZone === undefined || !zones.includes(occ.toZone)) return false;
      }
      return matchesWhat(state, trigger.what, subject, candidate);
    case 'upkeep':
    case 'endStep':
      // CR 603.2b: at the beginning of the step. "Your" means the active player is the controller.
      return trigger.whose === 'each' || occ.seat === candidate.controller;
    case 'tapsForMana':
      if (trigger.who === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.who === 'opponent' && occ.seat === candidate.controller) return false;
      return subject !== null && matchesFilter(state, subject, trigger.what, ctx);
    case 'permanentSacrificed': {
      if (trigger.by === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.filter === undefined) return true;
      return subject !== null && matchesFilter(state, subject, trigger.filter, ctx);
    }
    case 'becomesTarget': {
      // CR 702.21a: "an opponent controls" is read against the controller of this ability.
      if (trigger.by === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.by === 'opponent' && occ.seat === candidate.controller) return false;
      // D-177: "becomes the target of a spell": the object that targeted it is on the stack as a spell, not as an ability.
      if (trigger.spellOnly === true) {
        const by = occ.subject === null ? null : objectOrLki(state, occ.subject);
        if (by?.stack?.kind !== 'spell') return false;
      }
      const target = occ.target === undefined ? null : objectOrLki(state, occ.target);
      return matchesWhat(state, trigger.what, target, candidate);
    }
    default: {
      const unreachable: never = trigger;
      return unreachable;
    }
  }
}

function isRelevant(event: GameEvent): boolean {
  switch (event.kind) {
    case 'zoneChanged':
      // Entering (CR 603.6a) or leaving (CR 603.6c) the battlefield; D-229: leaving a graveyard, or exiled from a library or a graveyard.
      return (
        event.toZone === 'battlefield' ||
        event.fromZone === 'battlefield' ||
        (event.fromZone === 'graveyard' && event.toZone !== 'graveyard') ||
        (event.toZone === 'exile' && event.fromZone === 'library')
      );
    case 'damageDealt':
      return true; // CR 510.2 (combat damage), 120.3 (D-133: "is dealt damage" reads any damage)
    case 'tokenCreated':
    case 'died':
    case 'sacrificed':
    case 'cardDrawn':
    case 'attackersDeclared':
    case 'blockersDeclared':
    case 'spellCast':
    case 'spellCopied': // D-218: "whenever you cast or copy"
    case 'cycled':
    case 'discarded':
    case 'tapped':
    case 'untapped':
    case 'tappedForMana':
    case 'becameTarget':
    case 'ringTempted':
      return true;
    case 'counterAdded':
      return true; // CR 714.2b (lore counters), CR 122.6 (D-149: counters put on a permanent)
    case 'lifeGained':
      return true; // CR 119.9 (D-149)
    case 'stepBegan':
      return TRIGGER_STEP_IDS.has(event.step); // includes upkeep and end
    default:
      return false;
  }
}

/** The battlefield as it was before the events happened, by undoing their zone changes. */
function battlefieldBefore(state: GameState, events: readonly GameEvent[]): ObjectId[] {
  let members: ObjectId[] = [...state.battlefield];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e?.kind === 'zoneChanged') {
      if (e.toZone === 'battlefield') members = members.filter((m) => m !== e.to);
      if (e.fromZone === 'battlefield') members.push(e.from);
    } else if (e?.kind === 'tokenCreated') {
      members = members.filter((m) => m !== e.object);
    }
  }
  return members;
}

/** The permanents that enter in the same event as `events[from]`: its own and those of the unbroken run of `simultaneous` entries that follows it. */
function simultaneousEntries(events: readonly GameEvent[], from: number): ObjectId[] {
  const entering: ObjectId[] = [];
  for (const e of events.slice(from)) {
    if (e.kind === 'zoneChanged' && e.toZone === 'battlefield') {
      if (e.simultaneous !== true) break;
      entering.push(e.to);
    } else if (e.kind === 'tokenCreated') {
      break;
    }
  }
  return entering;
}

/** Numeric order of object ids: the order objects came to exist, for a deterministic scan. */
function byAge(a: ObjectId, b: ObjectId): number {
  return Number(a.slice(1)) - Number(b.slice(1));
}

function leavesBattlefield(event: GameEvent): boolean {
  return (
    (event.kind === 'zoneChanged' && event.fromZone === 'battlefield') ||
    event.kind === 'died' ||
    event.kind === 'sacrificed'
  );
}

/** The cards (as the objects they became) that left the graveyard of `seat` for another zone in these events (CR 400.7, 603.2c; D-232). */
function cardsThatLeftGraveyard(
  state: GameState,
  events: readonly GameEvent[],
  seat: SeatId,
): ObjectId[] {
  return events.flatMap((e) =>
    e.kind === 'zoneChanged' &&
    e.fromZone === 'graveyard' &&
    e.toZone !== 'graveyard' &&
    e.card !== null &&
    state.cards[e.card]?.owner === seat
      ? [e.to]
      : [],
  );
}

/** Every triggered ability that the events trigger, in event order (CR 603.2). */
export function findTriggers(state: GameState, events: readonly GameEvent[]): PendingTrigger[] {
  if (!events.some(isRelevant)) return [];
  const cache = new Map<ObjectId, Candidate | null>();
  const candidateOf = (id: ObjectId): Candidate | null => {
    if (!cache.has(id)) cache.set(id, candidateFor(state, id));
    return cache.get(id) ?? null;
  };
  const found: PendingTrigger[] = [];
  // CR 603.2c (D-206): a batch trigger of dying permanents triggers once for the events it is looking at, whichever of them it noticed first.
  const batched = new Set<string>();
  // CR 113.6b (D-151): "Whenever a Dragon you control enters, you may pay {R}. If you do, return this card from your graveyard to your hand."
  const yard = graveyardTriggerCards(state);
  let members = battlefieldBefore(state, events).sort(byAge);
  // The battlefield just before a run of simultaneous departures (CR 603.10a).
  let beforeDepartures: ObjectId[] | null = null;

  for (const [eventIndex, event] of events.entries()) {
    if (leavesBattlefield(event)) beforeDepartures ??= [...members];
    else beforeDepartures = null;
    if (event.kind === 'zoneChanged') {
      if (event.fromZone === 'battlefield') members = members.filter((m) => m !== event.from);
      if (event.toZone === 'battlefield') {
        // CR 603.6a (D-951): one event puts several permanents onto the battlefield, and every one of them is checked for the triggers of all.
        const entering =
          event.simultaneous === true ? simultaneousEntries(events, eventIndex) : [event.to];
        members = [...new Set([...members, ...entering])].sort(byAge);
      }
    } else if (event.kind === 'tokenCreated') {
      members = [...members, event.object].sort(byAge);
    }
    if (!isRelevant(event)) continue;
    const lore = loreChange(state, events, eventIndex);

    // Both the current battlefield and the one before departures can hold the source. A spell that was
    // just cast holds the abilities that work on the stack ("When you cast this spell", CR 702.85a).
    const castObject = event.kind === 'spellCast' ? event.object : null;
    // CR 702.29c (D-179): the card that was just cycled, in the graveyard (or exile) it wound up in.
    const cycledObject = event.kind === 'cycled' ? event.object : null;
    const pool = [
      ...new Set([
        ...members,
        ...(beforeDepartures ?? []),
        ...(castObject === null ? [] : [castObject]),
        ...(cycledObject === null ? [] : [cycledObject]),
        ...yard,
      ]),
    ].sort(byAge);
    for (const id of pool) {
      const candidate = candidateOf(id);
      if (!candidate) continue;
      for (const { index, ability } of candidate.triggered) {
        const lookBack = LOOK_BACK.has(ability.trigger.kind);
        const fromStack = ability.trigger.kind === 'castSpell' && ability.trigger.self === true;
        const checked = lookBack ? (beforeDepartures ?? members) : members;
        // A `self` cast trigger is found on the spell itself, on the stack, and nowhere else.
        if (ability.trigger.kind === 'cycled' ? id !== cycledObject : false) continue;
        if (
          fromStack
            ? id !== castObject
            : ability.trigger.kind !== 'cycled' && !checked.includes(id) && !yard.includes(id)
        ) {
          continue;
        }
        for (const occ of occurrences(state, ability.trigger, event, lore)) {
          if (!matches(state, ability.trigger, occ, candidate)) continue;
          if (
            ability.trigger.kind === 'diesBatch' ||
            ability.trigger.kind === 'entersBatch' ||
            ability.trigger.kind === 'leftGraveyard' ||
            ability.trigger.kind === 'exiledFromLibraryOrGraveyard'
          ) {
            const key = `${id}:${index}`;
            if (batched.has(key)) continue;
            batched.add(key);
          }
          // CR 702.155a (D-151): read ahead, the turn the Saga entered, lets only the chapter its lore counters say trigger.
          const holder = state.objects[id];
          if (
            occ.chapter !== undefined &&
            holder !== undefined &&
            readAheadBlocks(state, id, occ.chapter, derive(state, holder).abilities)
          ) {
            continue;
          }
          // CR 603.4: with an intervening "if" the ability triggers only if the condition is true
          // now; otherwise it does nothing, so no pending trigger is made.
          if (
            ability.interveningIf !== undefined &&
            !evaluateCondition(state, ability.interveningIf, {
              controller: candidate.controller,
              source: id,
              ...(occ.subject === null ? {} : { triggerSubject: occ.subject }),
              ...(occ.player === undefined ? {} : { triggerPlayer: occ.player }),
            })
          ) {
            continue;
          }
          // CR 603.2 (D-145): "attacks while you don't control another Dinosaur": part of the event, read only now.
          if (
            ability.triggerCondition !== undefined &&
            !evaluateCondition(state, ability.triggerCondition, {
              controller: candidate.controller,
              source: id,
              ...(occ.subject === null ? {} : { triggerSubject: occ.subject }),
              ...(occ.player === undefined ? {} : { triggerPlayer: occ.player }),
            })
          ) {
            continue;
          }
          found.push({
            source: id,
            controller: candidate.controller,
            abilityIndex: index,
            ability,
            subject: occ.subject,
            ...eventPlayer(ability, occ),
            ...(occ.damage === undefined ? {} : { damage: occ.damage }),
            ...(occ.chapter === undefined ? {} : { chapter: occ.chapter }),
            ...(occ.attacked === undefined ? {} : { attacked: occ.attacked }),
            // D-232: "become a copy of an artifact or creature card from among those cards": every card of the player that left the graveyard in these events.
            ...(ability.trigger.kind === 'leftGraveyard'
              ? { cards: cardsThatLeftGraveyard(state, events, candidate.controller) }
              : {}),
          });
        }
      }
    }
  }
  found.push(...batchTriggers(state, events, members, candidateOf));
  return found;
}

/**
 * CR 603.2c (D-139): "Whenever one or more [creatures] you control deal combat damage to a player": the combat damage dealt in one step is
 * one event, so the ability triggers once for each player damaged in these events, if at least `atLeast` different sources the trigger's
 * filter names damaged that player. Prevented damage has no event (CR 603.2g). The sources are read as they are (a creature destroyed by the
 * same damage is still on the battlefield until state-based actions are checked).
 */
function batchTriggers(
  state: GameState,
  events: readonly GameEvent[],
  members: readonly ObjectId[],
  candidateOf: (id: ObjectId) => Candidate | null,
): PendingTrigger[] {
  const damage = events.flatMap((e) =>
    e.kind === 'damageDealt' && e.combat && e.to.kind === 'player' && e.amount > 0
      ? [{ source: e.source, seat: e.to.seat }]
      : [],
  );
  if (damage.length === 0) return [];
  const found: PendingTrigger[] = [];
  for (const id of members) {
    const candidate = candidateOf(id);
    if (!candidate) continue;
    for (const { index, ability } of candidate.triggered) {
      const trigger = ability.trigger;
      if (trigger.kind !== 'combatDamageBatch') continue;
      const seats = [...new Set(damage.map((d) => d.seat))];
      for (const seat of seats) {
        if (trigger.to === 'opponent' && seat === candidate.controller) continue;
        const sources = [
          ...new Set(damage.filter((d) => d.seat === seat).map((d) => d.source)),
        ].filter((source) => {
          const obj = objectOrLki(state, source);
          return (
            obj !== null &&
            matchesFilter(state, obj, trigger.what, {
              controller: candidate.controller,
              source: candidate.id,
            })
          );
        });
        if (sources.length < (trigger.atLeast ?? 1)) continue;
        if (
          ability.interveningIf !== undefined &&
          !evaluateCondition(state, ability.interveningIf, {
            controller: candidate.controller,
            source: id,
            triggerPlayer: seat, // the player damaged: "if that player controls more creatures than you"
          })
        ) {
          continue;
        }
        if (
          ability.triggerCondition !== undefined &&
          !evaluateCondition(state, ability.triggerCondition, {
            controller: candidate.controller,
            source: id,
            triggerPlayer: seat,
          })
        ) {
          continue;
        }
        found.push({
          source: id,
          controller: candidate.controller,
          abilityIndex: index,
          ability,
          subject: null,
          player: seat,
        });
      }
    }
  }
  return found;
}

/**
 * CR 603.7: the delayed triggered abilities the events trigger. Each one triggers once, the first time its
 * trigger event happens after it was created (the state is the one after the events, and an ability is
 * created as a spell resolves, after the events it could have seen), and then it is gone. It is the ability
 * of the spell that created it, not of an object, so `source` is only what it refers to (CR 603.7c, 603.7e);
 * its `abilityIndex` is -1, since it is not among any object's abilities.
 */
function findDelayedTriggers(
  state: GameState,
  events: readonly GameEvent[],
): { readonly found: PendingTrigger[]; readonly remaining: readonly DelayedTrigger[] } {
  if (state.delayedTriggers.length === 0 || !events.some(isRelevant)) {
    return { found: [], remaining: state.delayedTriggers };
  }
  const found: PendingTrigger[] = [];
  const remaining: DelayedTrigger[] = [];
  for (const delayed of state.delayedTriggers) {
    const candidate: Candidate = {
      id: delayed.source,
      controller: delayed.controller,
      attachedTo: null,
      triggered: [],
    };
    const trigger = delayed.ability.trigger;
    const occurrence = events
      .flatMap((event) => occurrences(state, trigger, event, null))
      .find((occ) => matches(state, trigger, occ, candidate));
    if (occurrence === undefined) {
      remaining.push(delayed);
      continue;
    }
    found.push({
      source: delayed.source,
      controller: delayed.controller,
      abilityIndex: -1,
      ability: delayed.ability,
      // D-149: a delayed trigger may name its own subject (the card exiled "until this leaves the battlefield").
      subject: delayed.subject ?? occurrence.subject,
      // D-217: the player a delayed effect is about, fixed as it was created, or the one the event is about.
      ...(delayed.player !== undefined
        ? { player: delayed.player }
        : eventPlayer(delayed.ability, occurrence)),
      ...(occurrence.damage === undefined ? {} : { damage: occurrence.damage }),
    });
  }
  return { found, remaining };
}

/**
 * "This ability triggers only once each turn" (CR 603.2, D-149): of the triggers found, drops those of an ability with `oncePerTurn` that
 * has triggered this turn already (or earlier in this very batch) and records the ones that go on.
 */
function limitOncePerTurn(
  state: GameState,
  found: readonly PendingTrigger[],
): { readonly found: PendingTrigger[]; readonly state: GameState } {
  // CR 603.2h (D-256): "Do this only once each turn": the ability triggers only if its controller has not yet taken the action this turn.
  // The action is recorded as the ability resolves (`recordActionTaken`), not as it triggers.
  const afterAction = found.filter(
    (t) =>
      t.ability.doOnlyOnceEachTurn !== true ||
      t.source === null ||
      !state.turnLog.actionTaken.some(
        (a) =>
          a.object === t.source && a.abilityIndex === t.abilityIndex && a.seat === t.controller,
      ),
  );
  if (!afterAction.some((t) => t.ability.oncePerTurn === true)) {
    return { found: afterAction, state };
  }
  const seen = [...state.turnLog.triggered];
  const kept: PendingTrigger[] = [];
  for (const t of afterAction) {
    if (t.ability.oncePerTurn === true && t.source !== null) {
      const source = t.source;
      if (seen.some((s) => s.object === source && s.abilityIndex === t.abilityIndex)) continue;
      seen.push({ object: source, abilityIndex: t.abilityIndex });
    }
    kept.push(t);
  }
  return { found: kept, state: { ...state, turnLog: { ...state.turnLog, triggered: seen } } };
}

/** Adds the triggers the events cause to the pending list (CR 603.2, 603.3). */
export function collectTriggers(input: GameState, events: readonly GameEvent[]): GameState {
  const limited = limitOncePerTurn(input, findTriggers(input, events));
  const state = limited.state;
  // D-220 (CR 603.2d): "If a triggered ability of ... triggers, that ability triggers an additional time."
  const own = [...withDoubledTriggers(state, limited.found, events)];
  const delayed = findDelayedTriggers(state, events);
  // CR 725.2 (D-127): the monarch's two inherent abilities, which belong to no object.
  const monarch = findMonarchTriggers(state, events);
  // CR 701.54c (D-196): the abilities of the Ring, which belong to no object either.
  const ring = findRingTriggers(state, events);
  // CR 702.62a, 702.35a (D-128): the abilities of Suspend and Madness that work from exile.
  const later = findLaterTriggers(state, events);
  // CR 603.8 (D-139): state triggers, found from the state as it is after these events, once each time their condition becomes
  // true (not while the same ability waits or is on the stack).
  const stateful =
    events.length === 0
      ? []
      : findStateTriggers(state, [...own, ...delayed.found, ...monarch, ...ring, ...later]);
  if (
    own.length === 0 &&
    delayed.found.length === 0 &&
    monarch.length === 0 &&
    ring.length === 0 &&
    later.length === 0 &&
    stateful.length === 0
  ) {
    return state;
  }
  return {
    ...state,
    pendingTriggers: [
      ...state.pendingTriggers,
      ...own,
      ...delayed.found,
      ...monarch,
      ...ring,
      ...later,
      ...stateful,
    ],
    delayedTriggers: delayed.remaining,
  };
}
