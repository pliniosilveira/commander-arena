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
import type { VoteCast } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { getSeat, opponentsOf } from '../state/ops';
import type {
  DelayedTrigger,
  GameObject,
  GameState,
  PendingTrigger,
  StepId,
  TriggeredAbility,
} from '../state/types';
import { amountOf } from './amounts';
import { chosenOf } from './chosen';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { attackerDefender, defenderOf } from './defending';
import { derive } from './derive';
import { findDungeonTriggers } from './dungeon';
import { emblemsOf } from './emblem';
import { findInitiativeTriggers } from './initiative';
import { findLaterTriggers } from './later-triggers';
import { isLoyaltyAbility } from './loyalty';
import { findMonarchTriggers } from './monarch';
import { findRingTriggers } from './ring';
import { chaptersReached, loreChange, readAheadBlocks } from './saga';
import { matchesFilter, type SelectContext } from './select';
import { objectOrLki } from './source-info';
import { findSpeedTriggers } from './speed';
import { findStateTriggers } from './state-triggers';
import { withDoubledTriggers } from './trigger-doubling';
import { readsTriggerDamage, readsTriggerPlayer } from './trigger-subject';
import { isAbilityOfDoor } from './unlock-legality';

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
// CR 514.3a (Necromancy): the cleanup step too, for the engine's own delayed trigger at the beginning of the next one (`cleanupStep`).
const TRIGGER_STEP_IDS: ReadonlySet<StepId> = new Set<StepId>([
  ...Object.values(STEP_OF),
  'cleanup',
]);

/** Who caused the trigger event: an object, a seat, or both. */
interface Occurrence {
  readonly subject: ObjectId | null;
  readonly seat: SeatId | null;
  /** For `becomesTarget`: the object that became a target, while `subject` is what targeted it. */
  readonly target?: ObjectId;
  /** For `entersCausesTrigger`: the permanent that entered, whose own ability is `subject` on the stack. */
  readonly entered?: ObjectId;
  /** For `becomesTarget` with `batch`: the objects the same spell or ability targeted in the events before this one of the same batch (CR 603.2c: "one or more" triggers once). */
  readonly earlierTargets?: readonly ObjectId[];
  /** For `chapter`: the chapter number that was reached (CR 714.2b). */
  readonly chapter?: number;
  /** For `dealsCombatDamage`: what the damage was dealt to. */
  readonly damaged?: DamageRecipient;
  /** For `leftGraveyard`: the card as it was in the graveyard it left (CR 400.7), which the trigger's filter reads. */
  readonly card?: ObjectId;
  /** For `leavesBattlefield`: the zone the permanent went to. */
  readonly toZone?: Zone;
  /** For `drawn`: how many cards the player has drawn this turn, this one included. */
  readonly nth?: number;
  /** For `drawn`: this was the first card the active player drew in their draw step (CR 504.1). */
  readonly firstInDrawStep?: true;
  /** For `attacks`: whom the creature was declared as attacking (CR 508.1b). */
  readonly attackTarget?: AttackTarget;
  /** The player the event is about, for `triggerPlayer` (D-133). */
  readonly player?: SeatId;
  /** The damage the event dealt, for `triggerDamage` and `dealtDamage` (D-133). */
  readonly damage?: number;
  readonly targetCount?: number;
  /** For `playsCard`: the zone the land was played from or the spell was cast from (CR 305.1, 601.2a), for "from exile". */
  readonly fromZone?: Zone;
  /** For `lifeGained`: how many times the player has gained life this turn, this one included (D-149). */
  readonly gainNth?: number;
  /** For `milled`: the cards the instruction milled, as the objects they became in the graveyard (CR 701.17a), which the trigger's filter reads. */
  readonly cards?: readonly ObjectId[];
  /** For `lifeLost`: whether this is the first time the player lost life this turn (CR 119.3, 603.2). */
  readonly firstLoss?: boolean;
  /** For `surveils`: whether this is the first surveil of the player this turn (CR 603.2, Whispering Snitch). */
  readonly firstSurveil?: boolean;
  /** For `countersAdded`: the kind of the counters put on (D-149). */
  readonly counter?: string;
  /** For `countersAdded`: how many counters were put on in this instance of putting (issue 121: `reaches`). */
  readonly countersPut?: number;
  /** For `becomesTapped`: the permanent was tapped as it was declared as an attacker (CR 508.1f, D-510). */
  readonly attacker?: true;
  /** For `doorUnlocked`: which half of the Room was unlocked, 0 the left half and 1 the right half (CR 709.5h). */
  readonly door?: number;
  /** For `attackBatch`: the creatures declared as attackers and the players they were declared as attacking (D-149). */
  readonly attackers?: readonly ObjectId[];
  readonly attacked?: readonly SeatId[];
  /** For `becomesBlockedBy` (CR 509.3d, 702.25a): the creature that was declared as a blocker of the subject, the one `triggerSources` names in the effect. */
  readonly blocker?: ObjectId;
  /** For `attackBatch` (D-643): for each creature declared, the player it attacked or the controller of the planeswalker it attacked. */
  readonly attackedAt?: readonly SeatId[];
  /** For `votingFinished` (CR 701.38a): who voted for what in the vote that finished. */
  readonly votes?: readonly VoteCast[];
  /**
   * For `attackBatch`: as `attackers`, one entry for each: the player the creature was declared as attacking, or the controller of the planeswalker it was declared as
   * attacking; null for a creature that attacks a battle (CR 508.1b, 506.3), which is neither (`attackingYourOpponents`).
   */
  readonly attackersAt?: readonly (SeatId | null)[];
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

/**
 * CR 603.3d (D-513): a target slot that takes "up to X" targets, X being the number the trigger event carries (`TargetSpec.upToTriggerAmount`), is written as
 * the bounds it has this time (none to `amount`). Null when `amount` is 0: an ability with up to 0 targets and nothing else to do does nothing, so it is not put on the stack.
 */
function withTriggerAmount(
  state: GameState,
  ability: TriggeredAbility,
  amount: number,
  ctx: SelectContext,
): TriggeredAbility | null {
  if (
    !ability.targets?.some(
      (spec) => spec.upToTriggerAmount === true || spec.upToAmount !== undefined,
    )
  ) {
    return ability;
  }
  // CR 107.3c, 603.3d: "up to X target ..., where X is the number of opponents you have": X is what the text says, as the ability is put on the stack.
  const counts = ability.targets.map((spec) =>
    spec.upToTriggerAmount === true
      ? amount
      : spec.upToAmount === undefined
        ? null
        : amountOf(state, spec.upToAmount, ctx, []),
  );
  if (counts.some((n) => n !== null && n <= 0)) return null;
  return {
    ...ability,
    targets: ability.targets.map((spec, i) => {
      const n = counts[i];
      if (n === null || n === undefined) return spec;
      const { upToTriggerAmount: _fixed, upToAmount: _amount, ...rest } = spec;
      return { ...rest, min: 0, max: n };
    }),
  };
}

/**
 * Whether the loss of life that `events[index]` (a `lifeChanged` downward) tells of is the first of its player in the turn (CR 603.2: "for the first time each turn"
 * counts the player's losses). `state` already holds every loss of these events, so the life lost before them is what it records less their total; the losses
 * of these events that come before this one count as earlier ones.
 */
function isFirstLifeLoss(state: GameState, events: readonly GameEvent[], index: number): boolean {
  const event = events[index];
  if (event?.kind !== 'lifeChanged') return false;
  const lostIn = (e: GameEvent): number =>
    e.kind === 'lifeChanged' && e.seat === event.seat && e.to < e.from ? e.from - e.to : 0;
  const inBatch = events.reduce((sum, e) => sum + lostIn(e), 0);
  const earlierInBatch = events.slice(0, index).reduce((sum, e) => sum + lostIn(e), 0);
  const before = getSeat(state, event.seat).lifeLostThisTurn - inBatch;
  return before + earlierInBatch <= 0;
}

/**
 * Whether the surveil that `events[index]` (a `surveiled`) tells of is the first of its player in the turn (CR 603.2: "for the first time each turn" counts the player's surveils).
 * `state` already holds every surveil of these events in its turn log, so the surveils before them are what it records less their number; the surveils of these events that come
 * before this one count as earlier ones.
 */
function isFirstSurveil(state: GameState, events: readonly GameEvent[], index: number): boolean {
  const event = events[index];
  if (event?.kind !== 'surveiled') return false;
  const by = (e: GameEvent): number => (e.kind === 'surveiled' && e.seat === event.seat ? 1 : 0);
  const inBatch = events.reduce((sum, e) => sum + by(e), 0);
  const earlierInBatch = events.slice(0, index).reduce((sum, e) => sum + by(e), 0);
  const recorded = (state.turnLog.surveils ?? []).filter((s) => s === event.seat).length;
  return recorded - inBatch + earlierInBatch <= 0;
}

/** The trigger occurrences an event contains for a trigger kind. */
function occurrences(
  state: GameState,
  trigger: Trigger,
  event: GameEvent,
  lore: { readonly before: number; readonly after: number } | null,
  batch: { readonly events: readonly GameEvent[]; readonly index: number } = {
    events: [event],
    index: 0,
  },
): Occurrence[] {
  switch (trigger.kind) {
    case 'entersBattlefield':
    case 'landfall':
      // CR 603.6a. A token entering has no previous object, so it has its own event. The player the event is about (`triggerPlayer`, D-229:
      // "that player controls more lands than you") is whoever controls the permanent as it enters.
      // D-277 (CR 712.21): the second card of a melded permanent is not another permanent entering.
      if (
        event.kind === 'zoneChanged' &&
        event.toZone === 'battlefield' &&
        event.component !== true
      ) {
        // Issue 102 (River Kelpie, CR 603.6a, 400.7): "enters from a graveyard": the zone the permanent moved from.
        if (
          trigger.kind === 'entersBattlefield' &&
          trigger.fromGraveyard === true &&
          event.fromZone !== 'graveyard'
        ) {
          return [];
        }
        // CR 603.6a, 400.7, 406.1 (Faldorn): "enters from exile": the zone the permanent moved from.
        if (
          trigger.kind === 'entersBattlefield' &&
          trigger.fromExile === true &&
          event.fromZone !== 'exile'
        ) {
          return [];
        }
        const entered = state.objects[event.to];
        return [
          {
            subject: event.to,
            seat: null,
            ...(entered === undefined ? {} : { player: controllerOf(state, entered) }),
          },
        ];
      }
      // A token was never in a graveyard (issue 102).
      return event.kind === 'tokenCreated' &&
        !(
          trigger.kind === 'entersBattlefield' &&
          (trigger.fromGraveyard === true || trigger.fromExile === true)
        )
        ? [{ subject: event.object, seat: event.seat, player: event.seat }]
        : [];
    case 'entersBatch':
      // CR 603.2c, 603.6a (D-218): every permanent that enters in these events is an occurrence; `findTriggers` keeps the first one that the filter names.
      if (
        event.kind === 'zoneChanged' &&
        event.toZone === 'battlefield' &&
        event.component !== true
      ) {
        // CR 603.4, 601.2a (Twilight Diviner): "if they entered or were cast from a graveyard": the zone this permanent came from, or the zone its spell was cast from.
        if (
          trigger.fromGraveyard === true &&
          event.fromZone !== 'graveyard' &&
          state.objects[event.to]?.castFrom !== 'graveyard'
        ) {
          return [];
        }
        // CR 305.1 (Deep Gnome Terramancer): "without being played": the land was put onto the battlefield by an effect, so no `landPlayed` event names it.
        if (
          trigger.notPlayed === true &&
          batch.events.some((e) => e.kind === 'landPlayed' && e.object === event.to)
        ) {
          return [];
        }
        return [{ subject: event.to, seat: null }];
      }
      // A token was never in a graveyard, and was not cast.
      return event.kind === 'tokenCreated' && trigger.fromGraveyard !== true
        ? [{ subject: event.object, seat: event.seat }]
        : [];
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
        // CR 508.6: the player this creature attacks (not a planeswalker or battle), what "that player" of an `at: 'opponent'` trigger is.
        ...(a.target.kind === 'player' ? { attacked: [a.target.seat] } : {}),
      }));
    case 'castSpell':
      // D-218 (CR 707.10): a copy put onto the stack is not cast, but "cast or copy" counts it, under the control of the player who has it.
      // A copy of an ability (`spellCopied` of an ability, Unbound Flourishing) is no spell: "cast or copy a spell" does not see it.
      if (
        trigger.orCopy === true &&
        event.kind === 'spellCopied' &&
        state.objects[event.copy]?.stack?.kind === 'spell'
      ) {
        return [
          {
            subject: event.copy,
            seat: event.seat,
            player: event.seat,
            targetCount: state.objects[event.copy]?.stack?.chosenTargets.length ?? 0,
          },
        ];
      }
      return event.kind === 'spellCast'
        ? [
            {
              subject: event.object,
              seat: event.seat,
              player: event.seat,
              nth: event.nth,
              targetCount: event.targetCount,
            },
          ]
        : [];
    case 'cycled':
      // CR 702.29c (D-179): the card that was cycled, where it wound up.
      return event.kind === 'cycled'
        ? [
            {
              subject: event.object,
              seat: event.seat,
              player: event.seat,
              // The X of the cycling cost, for `triggerCycleX` (Shark Typhoon).
              ...(event.x === undefined ? {} : { damage: event.x }),
            },
          ]
        : [];
    case 'exerted':
      // CR 701.43d, 603.12: the creature that was exerted as it attacked, with the ability linked to its exert ability.
      return event.kind === 'exerted'
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
    case 'becomesUnblocked': {
      // CR 509.1h, 603.2: as the declaration of blockers is made (the event is made with none declared too), each creature attacking a player or a planeswalker or battle of the
      // declaring player that no creature was declared to block. `blocked` stays true when a blocker leaves later, so such a creature is not unblocked.
      if (event.kind !== 'blockersDeclared') return [];
      const out: Occurrence[] = [];
      for (const a of state.combat?.attackers ?? []) {
        if (a.blocked || attackerDefender(state, a) !== event.seat) continue;
        const creature = state.objects[a.object];
        if (creature === undefined || creature.zone !== 'battlefield') continue;
        out.push({ subject: a.object, seat: null });
      }
      return out;
    }
    case 'becomesBlockedBy':
      // CR 509.3d, 702.25a: an attacking creature becomes blocked by each creature declared as its blocker, once for each of them.
      return event.kind === 'blockersDeclared'
        ? event.blocks.map((b) => ({ subject: b.attacker, seat: null, blocker: b.blocker }))
        : [];
    case 'step':
      // CR 500.2, 603.2: as the step begins; the active player is the one whose turn it is.
      return event.kind === 'stepBegan' &&
        (event.step === STEP_OF[trigger.step] ||
          (trigger.alsoStep !== undefined && event.step === STEP_OF[trigger.alsoStep]))
        ? [{ subject: null, seat: event.seat, player: event.seat }]
        : [];
    case 'drawn':
      // CR 121.1: a card drawn; a draw that was replaced (CR 903.9b) has no `cardDrawn` event.
      return event.kind === 'cardDrawn'
        ? [
            {
              subject: event.object,
              seat: event.seat,
              nth: event.nth,
              player: event.seat,
              ...(event.firstInDrawStep === true ? { firstInDrawStep: true as const } : {}),
            },
          ]
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
    case 'dealsDamage':
      // CR 120.2, 603.2c: damage of any kind to a player, once for each source and each player; damage prevented entirely, or 0, has no `damageDealt` event (CR 603.2g).
      return event.kind === 'damageDealt' && event.to.kind === 'player' && event.amount > 0
        ? [
            {
              subject: event.source,
              seat: null,
              damaged: event.to,
              damage: event.amount,
              player: event.to.seat,
            },
          ]
        : [];
    case 'dealtDamageToPlayer':
      // CR 120.2, 603.2c, 603.2g: damage of any kind to a player, once for each source and each player; damage prevented entirely, or 0, has no `damageDealt` event.
      return event.kind === 'damageDealt' && event.to.kind === 'player' && event.amount > 0
        ? [
            {
              subject: event.source,
              seat: null,
              damaged: event.to,
              damage: event.amount,
              player: event.to.seat,
            },
          ]
        : [];
    case 'damageToPlayerPrevented':
      // CR 615.6, 603.2c: damage that would be dealt to a player and was prevented, once for each source and each player; `amount` is the part prevented.
      return event.kind === 'damagePrevented' && event.to.kind === 'player' && event.amount > 0
        ? [
            {
              subject: event.source,
              seat: null,
              damaged: event.to,
              damage: event.amount,
              player: event.to.seat,
            },
          ]
        : [];
    case 'noncombatDamageDealt':
      // CR 120.2b, 603.2c (D-333): one occurrence for each source and each player it damages. Damage that was prevented entirely, or is 0, has no
      // `damageDealt` event (CR 603.2g); the controller of the source is read as it is or as it last was (CR 113.7a).
      return event.kind === 'damageDealt' &&
        !event.combat &&
        event.to.kind === 'player' &&
        event.amount > 0
        ? [
            {
              subject: event.source,
              seat: controllerOfSource(state, event.source),
              damaged: event.to,
              damage: event.amount,
              player: event.to.seat,
            },
          ]
        : [];
    case 'dealtDamage':
      // CR 120.3, 603.2 (D-133): one occurrence for each source that damages a permanent, when the damage is dealt.
      // The controller of the source is the player "that creature's controller" names.
      // CR 120.10 (excess damage): the occurrence is only damage that was more than lethal, and its amount is the excess.
      return event.kind === 'damageDealt' &&
        event.to.kind === 'object' &&
        (trigger.combat !== true || event.combat) &&
        (trigger.noncombat !== true || !event.combat) &&
        (trigger.excess !== true || (event.excess ?? 0) > 0)
        ? [
            {
              subject: event.to.id,
              seat: null,
              damage: trigger.excess === true ? (event.excess ?? 0) : event.amount,
              ...(controllerOfSource(state, event.source) === null
                ? {}
                : { player: controllerOfSource(state, event.source) as SeatId }),
            },
          ]
        : [];
    case 'leavesBattlefield':
      // CR 603.6c: a permanent moved from the battlefield to another zone (a token too).
      // D-277 (CR 712.21): one melded permanent leaves, however many cards it becomes.
      return event.kind === 'zoneChanged' &&
        event.fromZone === 'battlefield' &&
        event.component !== true
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
      // CR 701.26a, 508.1f (D-510): the permanent that went from untapped to tapped, the player who tapped it (none when no player did) and whether it was declared as an attacker.
      return event.kind === 'tapped'
        ? [
            {
              subject: event.object,
              seat: event.by ?? null,
              ...(event.attacker === true ? { attacker: true as const } : {}),
            },
          ]
        : [];
    case 'scries':
      // CR 701.22 (D-513): the player who scried; the cards looked at are what the number of the trigger is.
      return event.kind === 'scried'
        ? [
            {
              subject: null,
              seat: event.seat,
              player: event.seat,
              damage: event.top + event.bottom,
            },
          ]
        : [];
    case 'surveils':
      // CR 701.25 (Galadriel group 1): the player who surveilled, as for a scry; the cards looked at are those put into the graveyard and those put back on top.
      return event.kind === 'surveiled'
        ? [
            {
              subject: null,
              seat: event.seat,
              player: event.seat,
              damage: event.top + event.toGraveyard,
              firstSurveil: isFirstSurveil(state, batch.events, batch.index),
            },
          ]
        : [];
    case 'milled':
      // CR 701.17a, 603.2c: one occurrence for the cards one player milled in one instruction; the filter reads them in `matches`.
      return event.kind === 'milled'
        ? [{ subject: null, seat: event.seat, player: event.seat, cards: event.objects }]
        : [];
    case 'rollsHighest':
      // CR 706.1a, 706.2 (Galadriel group 3): a die rolled whose natural result is the highest its sides allow (the engine has no modifier of a roll, so the result is natural).
      return event.kind === 'dieRolled' && event.result === event.sides
        ? [{ subject: null, seat: event.seat, player: event.seat }]
        : [];
    case 'winsCoinFlip':
      // CR 705.2 (Setzer): the player who flipped the coin and whose call matched the result.
      return event.kind === 'coinFlipped' && event.won
        ? [{ subject: null, seat: event.seat, player: event.seat }]
        : [];
    case 'winsClash':
      // CR 701.30d (Marvo, Deep Operative): the player who won the clash.
      return event.kind === 'clashWon'
        ? [{ subject: null, seat: event.seat, player: event.seat }]
        : [];
    case 'becomesMonstrous':
      // CR 701.37a, 701.37b: the permanent that became monstrous.
      return event.kind === 'becameMonstrous' ? [{ subject: event.object, seat: null }] : [];
    case 'turnedFaceUp':
      // CR 701.40b, 708.8: the permanent that was turned face up (the same object, now face up), by the player who took the special action.
      return event.kind === 'turnedFaceUp' ? [{ subject: event.object, seat: event.seat }] : [];
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
      // CR 400.7, 603.2c (D-229): a card that left a graveyard for another zone, by the player who owns it ("your graveyard"); the card as it was there is what a filter reads.
      return event.kind === 'zoneChanged' &&
        event.fromZone === 'graveyard' &&
        event.toZone !== 'graveyard' &&
        event.card !== null
        ? [{ subject: null, seat: state.cards[event.card]?.owner ?? null, card: event.from }]
        : [];
    case 'exploits':
      // CR 702.110b (Exploit): the creature whose exploit ability had its controller sacrifice a creature; the creature itself is the subject.
      return event.kind === 'exploited' ? [{ subject: event.creature, seat: event.seat }] : [];
    case 'doorUnlocked':
      // CR 709.5h: a half of a Room was given its unlocked designation, by the player who unlocked it; `door` is which half.
      return event.kind === 'doorUnlocked'
        ? [{ subject: event.object, seat: event.seat, door: event.door }]
        : [];
    case 'putIntoGraveyard':
      // CR 603.2, 404.1: a card (never a token) put into a graveyard from another zone, by the player who owns it ("your graveyard"); `from` is the zone it came from.
      return event.kind === 'zoneChanged' &&
        event.toZone === 'graveyard' &&
        event.fromZone !== 'graveyard' &&
        (trigger.from === 'anywhere' ||
          (trigger.from === 'library'
            ? event.fromZone === 'library'
            : event.fromZone !== 'battlefield')) &&
        event.card !== null
        ? [{ subject: event.to, seat: state.cards[event.card]?.owner ?? null }]
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
    case 'crimeCommitted':
      // CR 700.13 (D-464): the spell or ability that committed the crime is the subject, the player who put it on the stack the player.
      return event.kind === 'crimeCommitted'
        ? [{ subject: event.object, seat: event.seat, player: event.seat }]
        : [];
    case 'entersCausesTrigger':
      // CR 603.2, 603.6a (Aboleth Spawn): the triggered ability on the stack is the subject, the permanent that entered (its source) is what the filter reads; the player is the one who
      // controls it, which is the controller of the ability it caused.
      return event.kind === 'abilityTriggered' && event.entered !== undefined
        ? [{ subject: event.stackObject, seat: event.seat, entered: event.entered }]
        : [];
    case 'activatesAbility':
      // CR 602.2, 605.1a: an activated ability of a permanent that uses the stack (a mana ability is no such event); the ability on the stack is the subject.
      // `anySource` (Unbound Flourishing, "activate an ability"): an ability of a card in a hand or a graveyard counts as well.
      return event.kind === 'abilityActivated' &&
        (event.fromBattlefield === true || trigger.anySource === true) &&
        event.stackObject !== null
        ? [{ subject: event.stackObject, seat: event.seat, player: event.seat }]
        : [];
    case 'playsCard':
      // CR 305.1, 601.2: a land played (the land is the subject, as it is on the battlefield) or a spell cast (as it is on the stack), by the player the event names.
      // Urianger Augurelt: "from exile": the zone a land was played from (only recorded when it is not the hand) or a spell was cast from.
      if (event.kind === 'landPlayed') {
        return [
          {
            subject: event.object,
            seat: event.seat,
            player: event.seat,
            fromZone: event.fromZone ?? 'hand',
          },
        ];
      }
      return event.kind === 'spellCast'
        ? [
            {
              subject: event.object,
              seat: event.seat,
              player: event.seat,
              fromZone: event.fromZone,
            },
          ]
        : [];
    case 'tokenCreated':
      // CR 111.2 (D-465): a token enters under the control of the player who creates it; one occurrence for each token.
      return event.kind === 'tokenCreated'
        ? [{ subject: event.object, seat: event.seat, player: event.seat }]
        : [];
    case 'becomesTarget':
      // CR 702.21a: the spell or ability is the subject, the permanent it targeted the `target`.
      return event.kind === 'becameTarget'
        ? [
            {
              subject: event.by,
              seat: event.seat,
              target: event.object,
              player: event.seat,
              ...(trigger.batch === true
                ? {
                    earlierTargets: batch.events
                      .slice(0, batch.index)
                      .flatMap((e) =>
                        e.kind === 'becameTarget' && e.by === event.by ? [e.object] : [],
                      ),
                  }
                : {}),
            },
          ]
        : [];
    case 'state':
      // CR 603.8 (D-139): a state trigger has no event: it is found from the state (`rules/state-triggers.ts`).
      return [];
    case 'tappedForMana':
      // CR 605.4 (D-139): a triggered mana ability resolves as the mana ability that triggered it is activated (`rules/mana-triggers.ts`).
      return [];
    case 'combatDamageBatch':
    case 'damageBatch':
      // CR 603.2c (D-139): "one or more": once for the whole batch of damage, found after the events are read (`batchTriggers`).
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
    case 'lifeLost':
      // CR 119.3: one occurrence for each reduction of a life total (`lifeChanged` downward).
      return event.kind === 'lifeChanged' && event.to < event.from
        ? [
            {
              subject: null,
              seat: event.seat,
              player: event.seat,
              firstLoss: isFirstLifeLoss(state, batch.events, batch.index),
              // CR 119.3: "that many" is the life this event lost.
              damage: event.from - event.to,
            },
          ]
        : [];
    case 'countersAdded':
      // CR 122.6, 122.6a (D-149): counters put on a permanent, by the player who put them.
      // CR 603.2: the singular wording ("whenever a -1/-1 counter is put on") triggers once for each counter put on.
      return event.kind === 'counterAdded'
        ? Array.from({ length: trigger.each === true ? Math.max(event.count, 1) : 1 }, () => ({
            subject: event.object,
            seat: event.by ?? null,
            counter: event.counter,
            countersPut: event.count,
            // CR 122.6 ("you gain that much life"): "that much" is the counters this instance of putting put on, one for each trigger of the singular wording.
            damage: trigger.each === true ? 1 : event.count,
          }))
        : [];
    case 'lastCounterRemoved':
      // CR 702.63a: counters of this kind were taken off a permanent; whether it was the last of them is read against the permanent as it is when the event is noticed.
      return event.kind === 'counterRemoved' && event.counter === trigger.counter && event.count > 0
        ? [{ subject: event.object, seat: null, counter: event.counter }]
        : [];
    case 'playerAttacksOpponent': {
      // CR 508.1, 508.6, 603.2c (D-648): once for each player the declaration attacks (a planeswalker or a battle attacked is no player), however many creatures attack them.
      if (event.kind !== 'attackersDeclared') return [];
      const seats = [
        ...new Set(
          event.attackers.flatMap((a) => (a.target.kind === 'player' ? [a.target.seat] : [])),
        ),
      ];
      return seats.map((seat) => ({
        subject: null,
        seat: event.seat,
        player: event.seat,
        attacked: [seat],
      }));
    }
    case 'unblockedAttackBatch': {
      // CR 509.1h, 603.2: as the blockers are declared (the event is made with none declared too), once for each player whose attacking creatures attack the
      // declaring player and have no blocker; the creatures are read from the combat after the declaration.
      if (event.kind !== 'blockersDeclared') return [];
      const byController = new Map<SeatId, ObjectId[]>();
      for (const a of state.combat?.attackers ?? []) {
        if (a.blocked || a.target.kind !== 'player' || a.target.seat !== event.seat) continue;
        const creature = state.objects[a.object];
        if (creature === undefined || creature.zone !== 'battlefield') continue;
        const controller = controllerOf(state, creature);
        byController.set(controller, [...(byController.get(controller) ?? []), a.object]);
      }
      return [...byController].map(([controller, attackers]) => ({
        subject: null,
        seat: controller,
        player: controller,
        attackers,
        attacked: [event.seat],
      }));
    }
    case 'attackBatch':
      // CR 508.1b, 508.6, 603.2c (Demonic Covenant): "attack a player": one occurrence for each player attacked as a player, with the creatures that attack that player.
      // "attack an opponent" (Firkraag): the same, and "that player" is the player attacked.
      if (
        event.kind === 'attackersDeclared' &&
        (trigger.eachAttackedPlayer === true || trigger.eachAttackedOpponent === true)
      ) {
        const players = [
          ...new Set(
            event.attackers.flatMap((a) => (a.target.kind === 'player' ? [a.target.seat] : [])),
          ),
        ];
        return players.map((player) => ({
          subject: null,
          seat: event.seat,
          player: trigger.eachAttackedOpponent === true ? player : event.seat,
          attackers: event.attackers
            .filter((a) => a.target.kind === 'player' && a.target.seat === player)
            .map((a) => a.object),
          attacked: [player],
          attackedAt: [player],
        }));
      }
      // CR 508.1, 603.2 (D-149): once for the whole declaration, whoever the creatures attack.
      return event.kind === 'attackersDeclared'
        ? [
            {
              subject: null,
              seat: event.seat,
              player: event.seat,
              attackers: event.attackers.map((a) => a.object),
              attackersAt: event.attackers.map((a) => {
                if (a.target.kind === 'player') return a.target.seat;
                const attacked = state.objects[a.target.object];
                return attacked !== undefined &&
                  derive(state, attacked).types.includes('planeswalker')
                  ? controllerOf(state, attacked)
                  : null;
              }),
              attacked: event.attackers.flatMap((a) =>
                a.target.kind === 'player' ? [a.target.seat] : [],
              ),
              // CR 508.1b (D-643): a planeswalker attacked counts for its controller as the declaration is made; a battle is neither a player nor a planeswalker.
              attackedAt: event.attackers.flatMap((a) => {
                if (a.target.kind === 'player') return [a.target.seat];
                const attacked = state.objects[a.target.object];
                return attacked !== undefined &&
                  derive(state, attacked).types.includes('planeswalker')
                  ? [controllerOf(state, attacked)]
                  : [];
              }),
            },
          ]
        : [];
    case 'ringTempted':
      // CR 701.54d (D-196): each time the Ring tempts a player, whatever they could choose.
      // Galadriel group 1: the creature chosen is the subject, for "if you chose a creature other than ~ as your Ring-bearer" (`ringBearerChosen`); no other ability reads it.
      return event.kind === 'ringTempted' &&
        (trigger.bearerChosen !== true || event.bearer !== null)
        ? [
            {
              subject: event.bearer,
              seat: event.seat,
              player: event.seat,
            },
          ]
        : [];
    case 'dungeonCompleted':
      // CR 309.7, 701.49c: once each time a player's dungeon is completed.
      return event.kind === 'dungeonCompleted'
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
    case 'classLevel':
      return event.kind === 'classLevelReached' && event.level === trigger.level
        ? [{ subject: event.object, seat: null }]
        : [];
    case 'removesCounterWhileExiled':
      // CR 113.6b (Watcher of Hours): the ability of a card in exile, found by `findLaterTriggers`; a permanent on the battlefield has none of this event.
      return [];
    case 'votingFinished':
      // CR 701.38a (Erestor of the Council): every player has voted in a vote of any spell or ability; the record of the votes goes to the ability.
      return event.kind === 'votesRevealed'
        ? [{ subject: null, seat: null, votes: event.cast }]
        : [];
    case 'cleanupStep':
      // CR 514.3a, 603.2b (Necromancy): at the beginning of a cleanup step, whoever's turn it is.
      return event.kind === 'stepBegan' && event.step === 'cleanup'
        ? [{ subject: null, seat: event.seat, player: event.seat }]
        : [];
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
  /** The player an Aura that enchants a player is attached to (D-629). */
  readonly attachedToPlayer?: SeatId;
  /** Triggered abilities with their index among the object's abilities. */
  readonly triggered: readonly { readonly index: number; readonly ability: TriggeredAbility }[];
}

/** CR 603.6c, 603.10a: "When ~ is put into a graveyard from anywhere" is found on the card in the graveyard it became, wherever it works from. */
function isSelfGraveyardEntry(trigger: Trigger): boolean {
  return trigger.kind === 'putIntoGraveyard' && trigger.self === true;
}

function triggeredOf(
  abilities: readonly Ability[],
  where?: 'graveyard' | 'exile',
): Candidate['triggered'] {
  const inGraveyard = where === 'graveyard';
  // CR 113.6b (D-151): an ability that works from the graveyard works only there; the others work where the object is checked from.
  // CR 702.29c (D-179): "when you cycle this card" works from whatever zone the card winds up in, so it is found wherever the card is.
  return abilities.flatMap((ability, index) =>
    ability.kind === 'triggered' &&
    // CR 113.6b, 702.62b (Nihilith): an ability that works from exile works only there.
    (((ability.functionsIn === 'graveyard') === inGraveyard &&
      (ability.functionsIn === 'exile') === (where === 'exile')) ||
      ability.trigger.kind === 'cycled' ||
      isSelfGraveyardEntry(ability.trigger))
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
  // CR 113.6b, 702.62b (Nihilith): the cards in exile with a triggered ability that works there.
  for (const id of state.exile) {
    const card = state.objects[id]?.card;
    const definition = card === null || card === undefined ? undefined : state.cards[card];
    const face =
      definition === undefined ? undefined : state.definitions[definition.definition]?.faces[0];
    if (face?.abilities.some((a) => a.kind === 'triggered' && a.functionsIn === 'exile')) {
      out.push(id);
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
      ...(live.attachedToPlayer === undefined ? {} : { attachedToPlayer: live.attachedToPlayer }),
      triggered: triggeredOf(
        derive(state, live).abilities,
        live.zone === 'graveyard' ? 'graveyard' : live.zone === 'exile' ? 'exile' : undefined,
      ),
    };
  }
  // CR 113.7a, 603.10a: an object that has left is checked as it last existed.
  const lki = state.lki[id];
  if (!lki) return null;
  return {
    id,
    controller: lki.object.controller, // stored controller
    attachedTo: lki.object.attachedTo,
    ...(lki.object.attachedToPlayer === undefined
      ? {}
      : { attachedToPlayer: lki.object.attachedToPlayer }),
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
  at: 'you' | 'youOrPlaneswalkers' | 'defendingYou' | 'opponent' | undefined,
  target: AttackTarget | undefined,
  you: SeatId,
): boolean {
  if (at === undefined) return true;
  if (target === undefined) return false;
  // CR 508.1b, 508.6: "attacks one of your opponents": a player other than the controller, as a player.
  if (at === 'opponent') return target.kind === 'player' && target.seat !== you;
  if (target.kind === 'player') return target.seat === you;
  if (at === 'you') return false;
  // CR 508.5: the defending player of a creature attacking a planeswalker or a battle is the controller or the protector.
  if (at === 'defendingYou') return defenderOf(state, target) === you;
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
      // CR 400.7, 404.1 (Flayer of the Hatebound): "from your graveyard": a graveyard is its owner's, so the permanent is owned by the controller of this ability.
      if (trigger.graveyardOwner === 'you' && subject?.owner !== candidate.controller) return false;
      return matchesWhat(state, trigger.what, subject, candidate);
    case 'diesBatch':
    case 'entersBatch':
      return subject !== null && matchesFilter(state, subject, trigger.what, ctx);
    case 'leftGraveyard': {
      if (occ.seat !== candidate.controller) return false;
      // CR 603.2 (issue 102, Kishla Skimmer): "during your turn": the active player is the controller of this ability.
      if (trigger.duringTurn === 'you' && state.turn.activeSeat !== candidate.controller) {
        return false;
      }
      if (trigger.filter === undefined) return true;
      // CR 400.7: the card as it was in the graveyard (its last-known information).
      const card = occ.card === undefined ? null : objectOrLki(state, occ.card);
      return (
        card !== null && matchesFilter(state, card, { ...trigger.filter, zone: card.zone }, ctx)
      );
    }
    case 'exiledFromLibraryOrGraveyard':
      return occ.seat === candidate.controller;
    case 'exploits':
      // CR 702.110b: "When this creature exploits a creature": only the creature with the ability, which the controller of the ability controls.
      return subject?.id === candidate.id;
    case 'doorUnlocked':
      // CR 709.5h: "you unlock this door": the player is the controller of the ability and the Room is its source; whether the half is the ability's own is checked by the caller.
      return occ.seat === candidate.controller && subject?.id === candidate.id;
    case 'putIntoGraveyard':
      // CR 603.6c: "When ~ is put into a graveyard from anywhere": only the card with the ability itself.
      if (trigger.self === true) return subject !== null && subject.id === candidate.id;
      // CR 603.2: the card as it is in the graveyard (or as it last was); the filter names card types only.
      return (
        (trigger.who === 'any' ||
          (trigger.who === 'opponent'
            ? occ.seat !== null && occ.seat !== candidate.controller
            : occ.seat === candidate.controller)) &&
        (trigger.filter === undefined ||
          (subject !== null &&
            matchesFilter(state, subject, { ...trigger.filter, zone: subject.zone }, ctx)))
      );
    case 'discarded':
      if (trigger.who === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.who === 'opponent' && occ.seat === candidate.controller) return false;
      // D-374: "another card" is any card but the one with this ability (the Oracle word excludes the object itself).
      if (trigger.another === true && subject !== null && subject.id === candidate.id) return false;
      // D-383 (CR 701.9a): "a creature card": the card as it is where it went (its graveyard, or exile for madness), or as it last was.
      return (
        trigger.filter === undefined ||
        (subject !== null &&
          matchesFilter(state, subject, { ...trigger.filter, zone: subject.zone }, ctx))
      );
    case 'dies':
      if (trigger.graveyardOwner === 'you' && subject?.owner !== candidate.controller) return false;
      return matchesWhat(state, trigger.what, subject, candidate);
    case 'becomesTapped':
      // CR 701.26a, 508.1f (D-510): who tapped it, relative to the controller of this ability, and "if it isn't being declared as an attacker".
      if (trigger.by === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.by === 'opponent' && (occ.seat === null || occ.seat === candidate.controller)) {
        return false;
      }
      if (trigger.notAsAttacker === true && occ.attacker === true) return false;
      return matchesWhat(state, trigger.what, subject, candidate);
    case 'milled':
      if (trigger.who === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.who === 'opponent' && occ.seat === candidate.controller) return false;
      // CR 701.17a: at least one card milled is of the kind the filter names, as it is in the graveyard (or as it last was).
      return (
        trigger.filter === undefined ||
        (occ.cards ?? []).some((id) => {
          const card = objectOrLki(state, id);
          return (
            card !== null && matchesFilter(state, card, { ...trigger.filter, zone: card.zone }, ctx)
          );
        })
      );
    case 'scries':
    case 'surveils':
    case 'rollsHighest':
    case 'winsCoinFlip':
    case 'winsClash':
      // CR 701.22, 701.25 (D-513): the player who scried or surveilled, relative to the controller of this ability. CR 706.1a: the player who rolled the die.
      if (trigger.who === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.who === 'opponent' && occ.seat === candidate.controller) return false;
      // CR 603.2 (Whispering Snitch): "for the first time each turn" is the first surveil of that player in the turn.
      return (
        trigger.kind !== 'surveils' || trigger.firstEachTurn !== true || occ.firstSurveil === true
      );
    case 'dealtDamage':
    case 'becomesUntapped':
    case 'becomesMonstrous':
    case 'blocks':
    case 'becomesBlocked':
    case 'becomesUnblocked':
      return matchesWhat(state, trigger.what, subject, candidate);
    case 'turnedFaceUp':
      // CR 116.2b: "Whenever you turn a permanent face up": the player who took the special action is the controller of this ability.
      if (trigger.by === 'you' && occ.seat !== candidate.controller) return false;
      return matchesWhat(state, trigger.what, subject, candidate);
    case 'becomesBlockedBy': {
      // CR 702.25a: "a creature without flanking": the blocker as it is when it is declared.
      const blocker = occ.blocker === undefined ? null : objectOrLki(state, occ.blocker);
      return (
        blocker !== null &&
        matchesWhat(state, trigger.what, subject, candidate) &&
        matchesFilter(state, blocker, trigger.by, ctx)
      );
    }
    case 'state':
    case 'tappedForMana':
    case 'combatDamageBatch':
    case 'damageBatch':
      return false;
    case 'entersCausesTrigger': {
      // CR 603.2, 603.6a, 113.7a (Aboleth Spawn): the permanent that entered, as it is or as it last was, matches the filter ("a creature") and is controlled by the player `who` names.
      if (trigger.who === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.who === 'opponent' && occ.seat === candidate.controller) return false;
      const entered = occ.entered === undefined ? null : objectOrLki(state, occ.entered);
      return (
        entered !== null &&
        matchesFilter(state, entered, { ...trigger.what, zone: entered.zone }, ctx)
      );
    }
    case 'crimeCommitted':
    case 'tokenCreated':
    case 'activatesAbility':
      // CR 107.3, 602.2b, 603.4: "if that ability's activation cost contains {X}": an {X} symbol in the mana of its cost ("Pay X life" and "-X" are not an {X}).
      if (
        trigger.kind === 'activatesAbility' &&
        trigger.xCost === true &&
        !(
          subject?.stack?.ability?.kind === 'activated' &&
          subject.stack.ability.cost.some((c) => c.kind === 'mana' && c.symbols.includes('X'))
        )
      ) {
        return false;
      }
      // CR 606.2, 602.2 (Jaya's Phoenix): "the next loyalty ability you activate": an activated ability with a loyalty symbol in its cost.
      if (
        trigger.kind === 'activatesAbility' &&
        trigger.loyalty === true &&
        !(
          subject?.stack?.ability?.kind === 'activated' &&
          isLoyaltyAbility(subject.stack.ability.cost)
        )
      ) {
        return false;
      }
      // CR 700.13, 111.2, 602.2 (D-464, D-465): the player who committed the crime or created the token, relative to the controller of this ability.
      if (trigger.who === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.who === 'opponent' && occ.seat === candidate.controller) return false;
      // CR 602.2, 113.7a: "an ability of an artifact they control": the source of the ability activated, as it was as the ability was activated.
      if (trigger.kind === 'activatesAbility' && trigger.ofSource !== undefined) {
        const sourceId = subject?.stack?.source ?? null;
        const source = sourceId === null ? null : objectOrLki(state, sourceId);
        if (
          source === null ||
          !matchesFilter(
            state,
            source,
            { ...trigger.ofSource, zone: source.zone },
            { ...ctx, ...(occ.player === undefined ? {} : { triggerPlayer: occ.player }) },
          )
        ) {
          return false;
        }
      }
      return true;
    case 'lifeGained':
      if (trigger.who === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.who === 'opponent' && occ.seat === candidate.controller) return false;
      return trigger.firstEachTurn !== true || occ.gainNth === 1;
    case 'lifeLost':
      if (trigger.who === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.who === 'opponent' && occ.seat === candidate.controller) return false;
      return trigger.firstEachTurn !== true || occ.firstLoss === true;
    case 'countersAdded':
      if (trigger.counter !== undefined && occ.counter !== trigger.counter) return false;
      if (trigger.by === 'you' && occ.seat !== candidate.controller) return false;
      // CR 122.6 (Midnight Clock): "When the twelfth hour counter is put on this artifact": the putting that takes the number from below `reaches` to `reaches` or more.
      if (trigger.reaches !== undefined) {
        const now = subject?.counters[trigger.counter ?? ''] ?? 0;
        if (now < trigger.reaches || now - (occ.countersPut ?? 0) >= trigger.reaches) return false;
      }
      return matchesWhat(state, trigger.what, subject, candidate);
    case 'lastCounterRemoved':
      // CR 702.63a: the permanent has none of that kind of counter now, and is the one the ability belongs to.
      return (
        (subject?.counters[trigger.counter] ?? 0) === 0 &&
        matchesWhat(state, trigger.what, subject, candidate)
      );
    case 'playerAttacksOpponent': {
      // "One of your opponents": a player other than the controller of the ability (D-648).
      const attacked = occ.attacked?.[0];
      return attacked !== undefined && attacked !== candidate.controller;
    }
    case 'unblockedAttackBatch':
      // CR 509.1h: the unblocked creatures are an opponent's and attack the controller of this ability.
      return occ.seat !== candidate.controller && occ.attacked?.[0] === candidate.controller;
    case 'attackBatch': {
      if (trigger.who === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.who === 'opponent' && occ.seat === candidate.controller) return false;
      // CR 508.6 (Firkraag): "attack an opponent": the player attacked is an opponent of the controller of this ability.
      if (trigger.eachAttackedOpponent === true && occ.attacked?.[0] === candidate.controller) {
        return false;
      }
      // D-629 (CR 303.4m, 508.1b): "Whenever enchanted player is attacked": the Aura's player was declared as attacked, as a player and not through a planeswalker.
      if (
        trigger.attackedEnchantedPlayer === true &&
        (candidate.attachedToPlayer === undefined ||
          !(occ.attacked ?? []).includes(candidate.attachedToPlayer))
      ) {
        return false;
      }
      // CR 508.1b: "Whenever an opponent attacks you": the controller of the ability was declared as attacked, as a player.
      if (trigger.attackedYou === true && !(occ.attacked ?? []).includes(candidate.controller)) {
        return false;
      }
      // CR 508.1b, 508.6 (Cunning Rhetoric): "attacks you and/or one or more planeswalkers you control": a creature was declared as attacking the controller of the ability or a
      // planeswalker they control (`attackersAt`: the player, or the controller of the planeswalker; null for a battle).
      if (
        trigger.attackedYouOrPlaneswalkers === true &&
        !(occ.attackersAt ?? []).includes(candidate.controller)
      ) {
        return false;
      }
      // CR 726.1, 508.1b (Loot Dispute): "you attack the player who has the initiative": that player was declared as attacked, as a player.
      if (
        trigger.attackedInitiativeHolder === true &&
        (state.initiative === undefined || !(occ.attacked ?? []).includes(state.initiative))
      ) {
        return false;
      }
      // CR 508.1, 603.2c (Frontline Medic): "Whenever ~ and at least two other creatures attack": the permanent itself is one of the creatures counted.
      return (
        attackBatchMembers(state, trigger, occ, candidate.controller, candidate.id, ctx).length >=
        trigger.atLeast
      );
    }
    case 'chapter':
      // CR 714.2b: "when lore counters are put onto this Saga": the Saga the ability sits on.
      return subject !== null && subject.id === candidate.id;
    case 'classLevel':
      // CR 716.2: a Class's own level changed; another Class reaching the same level does not trigger this ability.
      return subject !== null && subject.id === candidate.id;
    case 'cycled':
      // CR 702.29c: "when you cycle this card": the card with the ability is the one that was cycled.
      return subject !== null && subject.id === candidate.id;
    case 'exerted':
      // CR 607.2h: the ability is linked to the exert ability of the creature itself: only that creature's exert triggers it.
      return subject !== null && subject.id === candidate.id;
    case 'ringTempted':
      // CR 701.54d: "Whenever the Ring tempts you": the player the Ring tempted controls the ability.
      return occ.seat === candidate.controller;
    case 'dungeonCompleted':
      // CR 309.7: "Whenever you complete a dungeon": the player whose dungeon was completed controls the ability.
      return occ.seat === candidate.controller;
    case 'landfall':
      // "Whenever a land enters under your control": the land's controller is the ability's.
      return (
        subject !== null &&
        controllerOf(state, subject) === candidate.controller &&
        derive(state, subject).types.includes('land')
      );
    case 'playsCard':
      // CR 305.1, 601.2, 205.2a: "you play a card with two or more card types": the player is the controller of the ability, the card types are those of the card as it is played
      // (the land on the battlefield, the spell on the stack).
      return (
        subject !== null &&
        occ.seat === candidate.controller &&
        // Urianger Augurelt (CR 305.1, 601.2a): "a land from exile or a spell from exile".
        (trigger.fromExile !== true || occ.fromZone === 'exile') &&
        derive(state, subject).types.length >= (trigger.minCardTypes ?? 1)
      );
    case 'castSpell':
      if (subject === null) return false;
      // CR 702.85a (D-120): "When you cast this spell" is the spell's own ability, for that spell only.
      if (trigger.self === true && subject.id !== candidate.id) return false;
      if (trigger.by === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.by === 'opponent' && occ.seat === candidate.controller) return false;
      // CR 607.2d (Sewer Nemesis): "Whenever the chosen player casts a spell": the player this permanent chose as it entered; none chosen, no trigger.
      if (trigger.by === 'chosenPlayer') {
        const chosenSeat = chosenOf(state, candidate.id)?.player;
        if (chosenSeat === undefined || occ.seat !== chosenSeat) return false;
      }
      // D-229: "their second spell each turn": the caster's nth spell of the turn.
      if (trigger.nth !== undefined && occ.nth !== trigger.nth) return false;
      // CR 601.2i, 603.2: "your first instant or sorcery spell each turn": no other spell of those card types was cast by the caster before it this turn (this one is in the log).
      if (trigger.firstOfKind === true) {
        const wanted = [
          ...(trigger.filter.types ?? []),
          ...(trigger.filter.anyOf ?? []).flatMap((m) => m.types ?? []),
        ];
        // Issue 81 (Plan for All Outcomes): "your first noncreature spell each turn": the card types the spell must not have (`notTypes`), with no type to name.
        const unwanted = trigger.filter.notTypes ?? [];
        // CR 700.12 (Discreet Retreat): "your first outlaw spell each turn": the spells that were outlaws as they were cast.
        const outlawOnly = trigger.filter.outlaw === true;
        const same = state.turnLog.castSpells.filter(
          (s) =>
            s.seat === occ.seat &&
            (!outlawOnly || s.outlaw === true) &&
            (wanted.length === 0 || s.types.some((t) => wanted.includes(t))) &&
            !s.types.some((t) => unwanted.includes(t)),
        );
        if (same.length !== 1) return false;
      }
      // D-565: "during each opponent's turn" is relative to the controller of this ability.
      if (trigger.duringTurn === 'opponent' && state.turn.activeSeat === candidate.controller)
        return false;
      // CR 603.2: "during your turn": the active player is the controller of this ability.
      if (trigger.duringTurn === 'you' && state.turn.activeSeat !== candidate.controller)
        return false;
      return matchesFilter(state, subject, trigger.filter, ctx);
    case 'step':
      // CR 503 to 514: whose turn it is, relative to the controller of the ability.
      if (trigger.whose === 'you') return occ.seat === candidate.controller;
      // CR 725.2, 603.2b: the active player is the monarch as the step begins.
      if (trigger.whose === 'monarch') return state.monarch !== null && occ.seat === state.monarch;
      return trigger.whose === 'each' || occ.seat !== candidate.controller;
    case 'drawn':
      if (trigger.who === 'you' && occ.seat !== candidate.controller) return false;
      if (trigger.who === 'opponent' && occ.seat === candidate.controller) return false;
      // CR 504.1 (Orcish Bowmasters): "except the first one they draw in each of their draw steps".
      if (trigger.exceptFirstInDrawStep === true && occ.firstInDrawStep === true) return false;
      return trigger.nth === undefined || occ.nth === trigger.nth;
    case 'dealsCombatDamage': {
      if (!matchesWhat(state, trigger.what, subject, candidate)) return false;
      const to = occ.damaged;
      if (to === undefined) return false;
      if (trigger.to === 'any') return true;
      if (trigger.to === 'player') return to.kind === 'player';
      if (trigger.to === 'playerOrPlaneswalker') {
        // D-373: a player, or a planeswalker (a creature or a battle is not), read as it is or as it last was.
        if (to.kind === 'player') return true;
        const hit = objectOrLki(state, to.id);
        return hit !== null && derive(state, hit).types.includes('planeswalker');
      }
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
    case 'dealsDamage': {
      // CR 110.1, 120.3: "a permanent deals damage" is about a permanent (as it is, or as it last was on the battlefield), never a spell or an ability on the stack.
      if (subject?.zone !== 'battlefield') return false;
      if (!matchesWhat(state, trigger.what, subject, candidate)) return false;
      const damaged = occ.damaged;
      if (damaged?.kind !== 'player') return false;
      // CR 113.7a: "an opponent" is an opponent of the controller of the ability (of the host's controller, for an ability the Aura grants); "you" is that controller.
      if (trigger.to === 'you') return damaged.seat === candidate.controller;
      return trigger.to === 'player' || damaged.seat !== candidate.controller;
    }
    case 'damageToPlayerPrevented':
    case 'dealtDamageToPlayer': {
      const damaged = occ.damaged;
      if (damaged?.kind !== 'player') return false;
      // CR 113.7a: "you" is the controller of the ability (of the host's controller, for an ability an Aura grants); "an opponent" is another player.
      if (trigger.who === 'you') return damaged.seat === candidate.controller;
      return trigger.who === 'player' || damaged.seat !== candidate.controller;
    }
    case 'noncombatDamageDealt': {
      // D-333: the source is controlled by the controller of this ability (`you`), and the player damaged is an opponent of it, or any player.
      if (trigger.by === 'you' && occ.seat !== candidate.controller) return false;
      const damaged = occ.damaged;
      if (damaged?.kind !== 'player') return false;
      return trigger.to === 'player' || damaged.seat !== candidate.controller;
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
      if (trigger.by === 'opponent' && occ.seat === candidate.controller) return false;
      // CR 603.2 (Szarel, Genesis Shepherd): "during your turn": the active player is the controller of this ability.
      if (trigger.duringTurn === 'you' && state.turn.activeSeat !== candidate.controller) {
        return false;
      }
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
      // CR 602.2 (Professor Hojo): "the target of an activated ability": the object that targeted it is on the stack as an activated ability.
      if (trigger.activatedOnly === true) {
        const by = occ.subject === null ? null : objectOrLki(state, occ.subject);
        if (by?.stack?.kind !== 'ability' || by.stack.ability?.kind !== 'activated') return false;
      }
      const target = occ.target === undefined ? null : objectOrLki(state, occ.target);
      if (!matchesWhat(state, trigger.what, target, candidate)) return false;
      // CR 603.2c: "one or more": only the first permanent the same spell or ability targets that `what` names makes it trigger.
      return !(occ.earlierTargets ?? []).some((earlier) =>
        matchesWhat(state, trigger.what, objectOrLki(state, earlier), candidate),
      );
    }
    case 'removesCounterWhileExiled':
      return false; // CR 113.6b: found from exile by `findLaterTriggers`, never matched on the battlefield
    case 'votingFinished':
      return true;
    case 'cleanupStep':
      return true;
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
        (event.toZone === 'exile' && event.fromZone === 'library') ||
        // CR 603.2 (Skola Grovedancer): a card put into a graveyard from anywhere.
        (event.toZone === 'graveyard' && event.fromZone !== 'graveyard')
      );
    case 'damageDealt':
      return true; // CR 510.2 (combat damage), 120.3 (D-133: "is dealt damage" reads any damage)
    case 'damagePrevented':
      return true; // CR 615.6 (Selfless Squire): "whenever damage that would be dealt to you is prevented"
    case 'scried':
    case 'surveiled':
    case 'dieRolled': // CR 706.2 (Galadriel group 3): "whenever you roll a die's highest natural result"
    case 'coinFlipped': // CR 705.2 (Setzer): "whenever you win a coin flip"
    case 'clashWon': // CR 701.30d (Marvo, Deep Operative): "whenever you win a clash"
    case 'tokenCreated':
    case 'died':
    case 'sacrificed':
    case 'cardDrawn':
    case 'attackersDeclared':
    case 'blockersDeclared':
    case 'spellCast':
    case 'landPlayed': // CR 305.1: "whenever you play a card"
    case 'spellCopied': // D-218: "whenever you cast or copy"
    case 'exerted': // CR 701.43d
    case 'cycled':
    case 'discarded':
    case 'tapped':
    case 'untapped':
    case 'becameMonstrous': // CR 701.37: "When this creature becomes monstrous"
    case 'tappedForMana':
    case 'becameTarget':
    case 'crimeCommitted':
    case 'abilityActivated':
    case 'abilityTriggered': // CR 603.2 (Aboleth Spawn): "causes a triggered ability to trigger"
    case 'doorUnlocked': // CR 709.5h
    case 'exploited': // CR 702.110b
    case 'turnedFaceUp': // CR 701.40b, 708.8
    case 'ringTempted':
    case 'dungeonCompleted': // CR 309.7, 701.49c
    case 'classLevelReached':
    case 'votesRevealed': // CR 701.38a: "whenever players finish voting"
      return true;
    case 'counterRemoved':
      return true; // CR 702.63a (Vanishing): "When the last time counter is removed from this permanent"
    case 'counterAdded':
      return true; // CR 714.2b (lore counters), CR 122.6 (D-149: counters put on a permanent)
    case 'lifeGained':
      return true; // CR 119.9 (D-149)
    case 'milled':
      return true; // CR 701.17a
    case 'lifeChanged':
      return true; // CR 119.3: a reduction of a life total is a loss ("whenever you lose life")
    case 'stepBegan':
      return TRIGGER_STEP_IDS.has(event.step); // includes upkeep and end
    default:
      return false;
  }
}

/**
 * CR 603.2c: the creatures of a declaration an `attackBatch` trigger counts (all of them when it names no filter). CR 508.1b, 506.3 (Frontier Warmonger): with
 * `attackingYourOpponents`, only those declared as attacking an opponent of `controller` as a player or a planeswalker an opponent controls. CR 508.1 (Frontline Medic): with
 * `includesSource`, none unless the permanent with the ability (`source`) is among them, as it counts too.
 */
function attackBatchMembers(
  state: GameState,
  trigger: Extract<Trigger, { kind: 'attackBatch' }>,
  occ: Pick<Occurrence, 'attackers' | 'attackersAt'>,
  controller: SeatId,
  source: ObjectId,
  ctx: SelectContext,
): ObjectId[] {
  const attackers = occ.attackers ?? [];
  const opponents = trigger.attackingYourOpponents === true ? opponentsOf(state, controller) : [];
  const members = attackers.filter((id, i) => {
    if (trigger.attackingYourOpponents === true) {
      const at = occ.attackersAt?.[i];
      if (at === undefined || at === null || !opponents.includes(at)) return false;
    }
    if (trigger.what === undefined) return true;
    const creature = objectOrLki(state, id);
    return creature !== null && matchesFilter(state, creature, trigger.what, ctx);
  });
  return trigger.includesSource === true && !members.includes(source) ? [] : members;
}

/** The battlefield as it was before the events happened, by undoing their zone changes. */
function battlefieldBefore(state: GameState, events: readonly GameEvent[]): ObjectId[] {
  let members: ObjectId[] = [...state.battlefield];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e?.kind === 'zoneChanged') {
      if (e.toZone === 'battlefield') members = members.filter((m) => m !== e.to);
      // D-277 (CR 712.21): a melded permanent that left is one permanent, though two events say where its cards went.
      if (e.fromZone === 'battlefield' && e.component !== true) members.push(e.from);
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

/**
 * Whether no card the filter of `trigger` names was put into the graveyard of `seat` before these events this turn (CR 603.2: "for the first time each turn"). `state` already holds
 * every entry of these events (`TurnLog.graveyardEntries`), so the ones before them are the log less the cards of these events that went into a graveyard. Only card types are
 * kept for an earlier entry, which is all a filter of this trigger reads (`validateCard`).
 */
function firstGraveyardEntryOfTurn(
  state: GameState,
  trigger: Extract<Trigger, { kind: 'putIntoGraveyard' }>,
  events: readonly GameEvent[],
  seat: SeatId,
): boolean {
  const inEvents = events.filter(
    (e) =>
      e.kind === 'zoneChanged' &&
      e.toZone === 'graveyard' &&
      e.fromZone !== 'graveyard' &&
      e.card !== null,
  ).length;
  const log = state.turnLog.graveyardEntries;
  const types = trigger.filter?.types;
  const notTypes = trigger.filter?.notTypes;
  return !log
    .slice(0, Math.max(0, log.length - inEvents))
    .some(
      (entry) =>
        entry.seat === seat &&
        (types === undefined || types.every((t) => entry.types.includes(t))) &&
        (notTypes === undefined || !notTypes.some((t) => entry.types.includes(t))),
    );
}

/** The cards (as the objects they became) that left the graveyard of `seat` for another zone in these events (CR 400.7, 603.2c; D-232). */
function cardsThatLeftGraveyard(
  state: GameState,
  trigger: Extract<Trigger, { kind: 'leftGraveyard' }>,
  events: readonly GameEvent[],
  candidate: Candidate,
  only: ObjectId | undefined,
): ObjectId[] {
  return events.flatMap((e) =>
    e.kind === 'zoneChanged' && (only === undefined || e.from === only)
      ? occurrences(state, trigger, e, null).flatMap((occ) =>
          matches(state, trigger, occ, candidate) ? [e.to] : [],
        )
      : [],
  );
}

/**
 * The cards (as the objects they became in the graveyard) that the batch `putIntoGraveyard` trigger `trigger` names in these events (CR 603.2c, 404.1): each `zoneChanged` event
 * it matches (the cards of its controller's graveyard, from the library or from anywhere, that the filter names), in the order the cards were put there.
 */
function putIntoGraveyardCards(
  state: GameState,
  trigger: Extract<Trigger, { kind: 'putIntoGraveyard' }>,
  events: readonly GameEvent[],
  candidate: Candidate,
  lore: { readonly before: number; readonly after: number } | null,
): ObjectId[] {
  return events.flatMap((e) =>
    occurrences(state, trigger, e, lore).flatMap((occ) =>
      occ.subject !== null && matches(state, trigger, occ, candidate) ? [occ.subject] : [],
    ),
  );
}

/**
 * The cards (as the objects they became) that the batch `discarded` trigger `trigger` names in these events (CR 603.2c, 701.9a; Lorehold group 1): each `discarded` event it
 * matches (whose discard, `another`, the filter), in the order the cards were discarded.
 */
function discardedCards(
  state: GameState,
  trigger: Extract<Trigger, { kind: 'discarded' }>,
  events: readonly GameEvent[],
  candidate: Candidate,
  lore: { readonly before: number; readonly after: number } | null,
): ObjectId[] {
  return events.flatMap((e) =>
    occurrences(state, trigger, e, lore).flatMap((occ) =>
      occ.subject !== null && matches(state, trigger, occ, candidate) ? [occ.subject] : [],
    ),
  );
}

/**
 * The permanents (as the objects they became) that the batch `entersBatch` trigger `trigger` names in these events (CR 603.2c, 603.6a; Twilight Diviner): each permanent that entered
 * in them that the filter (and `fromGraveyard`) names, in the order they entered, for "a copy of one of them".
 */
function enteredBatchCards(
  state: GameState,
  trigger: Extract<Trigger, { kind: 'entersBatch' }>,
  events: readonly GameEvent[],
  candidate: Candidate,
): ObjectId[] {
  return events.flatMap((e) =>
    occurrences(state, trigger, e, null).flatMap((occ) =>
      occ.subject !== null && matches(state, trigger, occ, candidate) ? [occ.subject] : [],
    ),
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
    if (leavesBattlefield(event)) {
      beforeDepartures ??= [...members];
    } else beforeDepartures = null;
    if (event.kind === 'zoneChanged') {
      if (event.fromZone === 'battlefield') members = members.filter((m) => m !== event.from);
      if (event.toZone === 'battlefield') {
        // CR 603.6a (D-272): one event puts several permanents onto the battlefield, and every one of them is checked for the triggers of all.
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
    // CR 603.6c: the card that was just put into a graveyard, for its own "When ~ is put into a graveyard from anywhere".
    const graveyardEntry =
      event.kind === 'zoneChanged' && event.toZone === 'graveyard' && event.fromZone !== 'graveyard'
        ? event.to
        : null;
    const pool = [
      ...new Set([
        ...members,
        ...(beforeDepartures ?? []),
        ...(castObject === null ? [] : [castObject]),
        ...(cycledObject === null ? [] : [cycledObject]),
        ...(graveyardEntry === null ? [] : [graveyardEntry]),
        ...yard,
      ]),
    ].sort(byAge);
    for (const id of pool) {
      const candidate = candidateOf(id);
      if (!candidate) continue;
      for (const { index, ability } of candidate.triggered) {
        // A graveyard ability looking back at a death must already have been in that zone.
        if (
          ability.functionsIn === 'graveyard' &&
          LOOK_BACK.has(ability.trigger.kind) &&
          events.some((e, entryIndex) => {
            if (e.kind !== 'zoneChanged' || e.to !== id || e.toZone !== 'graveyard') return false;
            const departed =
              event.kind === 'died'
                ? event.object
                : event.kind === 'zoneChanged'
                  ? event.from
                  : event.kind === 'sacrificed'
                    ? event.permanent
                    : null;
            const together = departed === null ? undefined : state.lki[departed]?.departedTogether;
            return (
              entryIndex >= eventIndex || departed === e.from || together?.includes(e.from) === true
            );
          })
        )
          continue;
        const lookBack = LOOK_BACK.has(ability.trigger.kind);
        const fromStack = ability.trigger.kind === 'castSpell' && ability.trigger.self === true;
        const checked = lookBack ? (beforeDepartures ?? members) : members;
        // A `self` cast trigger is found on the spell itself, on the stack, and nowhere else.
        if (ability.trigger.kind === 'cycled' ? id !== cycledObject : false) continue;
        // The card put into a graveyard has its own entry trigger in any zone it works from; the others look at the battlefield (or the graveyard).
        const selfEntry = isSelfGraveyardEntry(ability.trigger);
        if (selfEntry ? id !== graveyardEntry : false) continue;
        if (
          fromStack
            ? id !== castObject
            : ability.trigger.kind !== 'cycled' &&
              !selfEntry &&
              !checked.includes(id) &&
              !yard.includes(id)
        ) {
          continue;
        }
        // CR 603.2c (Lorehold group 1): "Whenever you discard one or more nonland cards": every card of these events the trigger names, for "exile one of them".
        // The same for "Whenever one or more cards are put into your graveyard from your library": "those cards" (`cardTypesAmongTriggerCards`).
        const discardedBatch =
          ability.trigger.kind === 'discarded' && ability.trigger.batch === true
            ? discardedCards(state, ability.trigger, events, candidate, lore)
            : ability.trigger.kind === 'putIntoGraveyard' && ability.trigger.batch === true
              ? putIntoGraveyardCards(state, ability.trigger, events, candidate, lore)
              : ability.trigger.kind === 'entersBatch'
                ? enteredBatchCards(state, ability.trigger, events, candidate)
                : null;
        for (const occ of occurrences(state, ability.trigger, event, lore, {
          events,
          index: eventIndex,
        })) {
          if (!matches(state, ability.trigger, occ, candidate)) continue;
          // CR 709.5h: "When you unlock this door" is an ability of one half: it triggers when that half is unlocked and not when the other one is.
          if (
            ability.trigger.kind === 'doorUnlocked' &&
            !isAbilityOfDoor(state, id, ability, occ.door)
          ) {
            continue;
          }
          if (
            ability.trigger.kind === 'putIntoGraveyard' &&
            ability.trigger.firstTimeEachTurn === true &&
            !firstGraveyardEntryOfTurn(state, ability.trigger, events, candidate.controller)
          ) {
            continue;
          }
          if (
            (ability.trigger.kind === 'discarded' && ability.trigger.batch === true) ||
            ability.trigger.kind === 'diesBatch' ||
            ability.trigger.kind === 'entersBatch' ||
            (ability.trigger.kind === 'becomesTapped' && ability.trigger.batch === true) ||
            // CR 603.2c: "Whenever one or more opponents lose life": one trigger for the losses of these events, however many players lost life.
            (ability.trigger.kind === 'lifeLost' && ability.trigger.batch === true) ||
            (ability.trigger.kind === 'leftGraveyard' && ability.trigger.each !== true) ||
            ability.trigger.kind === 'exiledFromLibraryOrGraveyard' ||
            (ability.trigger.kind === 'putIntoGraveyard' && ability.trigger.batch === true)
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
              ...(occ.attackedAt === undefined ? {} : { triggerAttackedAt: occ.attackedAt }),
              ...(occ.attacked === undefined ? {} : { triggerAttacked: occ.attacked }),
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
          // CR 603.3d, 701.22 (D-513): "tap up to X target nonland permanents, where X is the number of cards looked at": fixed as the ability triggers.
          const fixed = withTriggerAmount(state, ability, occ.damage ?? 0, {
            controller: candidate.controller,
            source: id,
          });
          if (fixed === null) continue;
          found.push({
            source: id,
            controller: candidate.controller,
            abilityIndex: index,
            ability: fixed,
            subject: occ.subject,
            ...eventPlayer(ability, occ),
            ...(occ.damage === undefined ? {} : { damage: occ.damage }),
            // CR 508.1 (issue 81, The Ur-Sphinx): "that many" is the creatures of the declaration the batch trigger counted.
            ...(ability.trigger.kind === 'attackBatch' && occ.attackers !== undefined
              ? {
                  damage: attackBatchMembers(
                    state,
                    ability.trigger,
                    occ,
                    candidate.controller,
                    id,
                    { controller: candidate.controller, source: id },
                  ).length,
                }
              : {}),
            ...(occ.targetCount === undefined ? {} : { targetCount: occ.targetCount }),
            // CR 702.25a: "the blocking creature" is the creature this occurrence is about.
            ...(occ.blocker === undefined ? {} : { cards: [occ.blocker] }),
            ...(occ.chapter === undefined ? {} : { chapter: occ.chapter }),
            ...(occ.attacked === undefined ? {} : { attacked: occ.attacked }),
            // CR 603.2c: "those creatures" of a batch that counts only the creatures attacking an opponent are those, not every creature declared.
            ...(occ.attackers === undefined || ability.trigger.kind !== 'attackBatch'
              ? {}
              : {
                  attackers:
                    ability.trigger.attackingYourOpponents === true
                      ? attackBatchMembers(state, ability.trigger, occ, candidate.controller, id, {
                          controller: candidate.controller,
                          source: id,
                        })
                      : occ.attackers,
                }),
            ...(occ.attackedAt === undefined ? {} : { attackedAt: occ.attackedAt }),
            ...(occ.votes === undefined ? {} : { votes: occ.votes }),
            // D-232: "become a copy of an artifact or creature card from among those cards": every card of the player that left the graveyard in these events.
            ...(ability.trigger.kind === 'leftGraveyard'
              ? {
                  cards: cardsThatLeftGraveyard(
                    state,
                    ability.trigger,
                    events,
                    candidate,
                    ability.trigger.each === true ? occ.card : undefined,
                  ),
                }
              : {}),
            ...(discardedBatch === null ? {} : { cards: discardedBatch }),
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
  const everyDamage = events.flatMap((e) =>
    e.kind === 'damageDealt' && e.to.kind === 'player' && e.amount > 0
      ? [{ source: e.source, seat: e.to.seat, amount: e.amount, combat: e.combat === true }]
      : [],
  );
  const damage = everyDamage.filter((d) => d.combat);
  if (everyDamage.length === 0) return [];
  const found: PendingTrigger[] = [];
  for (const id of members) {
    const candidate = candidateOf(id);
    if (!candidate) continue;
    for (const { index, ability } of candidate.triggered) {
      const trigger = ability.trigger;
      if (trigger.kind === 'damageBatch') {
        found.push(
          ...damageBatchTriggers(state, everyDamage, id, index, ability, trigger, candidate),
        );
        continue;
      }
      if (trigger.kind !== 'combatDamageBatch' || damage.length === 0) continue;
      if (trigger.to === 'opponents') {
        found.push(
          ...opponentsCombatBatchTriggers(
            state,
            events,
            damage,
            id,
            index,
            ability,
            trigger,
            candidate,
          ),
        );
        continue;
      }
      const seats = [...new Set(damage.map((d) => d.seat))];
      for (const seat of seats) {
        if (trigger.to === 'opponent' && seat === candidate.controller) continue;
        if (trigger.to === 'you' && seat !== candidate.controller) continue;
        // CR 725.2: "while you're the monarch" is true as the damage is dealt, which is before the monarch moves to the player who dealt it.
        if (trigger.whileMonarch === true) {
          const moved = events.find((e) => e.kind === 'monarchChanged');
          const monarchThen = moved?.kind === 'monarchChanged' ? moved.from : state.monarch;
          if (monarchThen !== candidate.controller) continue;
        }
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
        // "that damage" (issue 103, CR 603.2c, 510.2): all the combat damage the sources the trigger names dealt to that player in these events.
        const dealt = damage
          .filter((d) => d.seat === seat && sources.includes(d.source))
          .reduce((sum, d) => sum + d.amount, 0);
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
          cards: sources,
          ...(readsTriggerDamage(ability) ? { damage: dealt } : {}),
        });
      }
    }
  }
  return found;
}

/**
 * Issue 508 (Mindblade Render, CR 510.2, 603.2c): "whenever your opponents are dealt combat damage, if any of that damage was dealt by a Warrior": once for the whole event, not once for
 * each opponent. All combat damage is dealt at once (CR 510.2) and the official ruling of the card says the ability "triggers only once, regardless of how many opponents were dealt
 * damage, how much damage they were dealt, or how many Warriors dealt damage". The sources are any player's: a Warrior of one opponent that damages another opponent counts. The
 * damage the controller of the ability is dealt is not part of it (they are not their own opponent). `damage` is all the damage those sources dealt to the opponents.
 */
function opponentsCombatBatchTriggers(
  state: GameState,
  events: readonly GameEvent[],
  damage: readonly { readonly source: ObjectId; readonly seat: SeatId; readonly amount: number }[],
  id: ObjectId,
  index: number,
  ability: TriggeredAbility,
  trigger: Extract<Trigger, { kind: 'combatDamageBatch' }>,
  candidate: Candidate,
): PendingTrigger[] {
  // CR 725.2: "while you're the monarch" is true as the damage is dealt, before the monarch moves to the player who dealt it.
  if (trigger.whileMonarch === true) {
    const moved = events.find((e) => e.kind === 'monarchChanged');
    const monarchThen = moved?.kind === 'monarchChanged' ? moved.from : state.monarch;
    if (monarchThen !== candidate.controller) return [];
  }
  const toOpponents = damage.filter((d) => d.seat !== candidate.controller);
  const sources = [...new Set(toOpponents.map((d) => d.source))].filter((source) => {
    const obj = objectOrLki(state, source);
    return (
      obj !== null &&
      matchesFilter(state, obj, trigger.what, {
        controller: candidate.controller,
        source: candidate.id,
      })
    );
  });
  if (sources.length < (trigger.atLeast ?? 1)) return [];
  const [first] = toOpponents;
  if (first === undefined) return [];
  const context = { controller: candidate.controller, source: id };
  if (
    (ability.interveningIf !== undefined &&
      !evaluateCondition(state, ability.interveningIf, context)) ||
    (ability.triggerCondition !== undefined &&
      !evaluateCondition(state, ability.triggerCondition, context))
  ) {
    return [];
  }
  const dealt = toOpponents
    .filter((d) => sources.includes(d.source))
    .reduce((sum, d) => sum + d.amount, 0);
  return [
    {
      source: id,
      controller: candidate.controller,
      abilityIndex: index,
      ability,
      subject: null,
      player: first.seat,
      cards: sources,
      ...(readsTriggerDamage(ability) ? { damage: dealt } : {}),
    },
  ];
}

/**
 * CR 120.2, 603.2c (Francisco, Malcolm): the triggers of one `damageBatch` ability for the damage of any kind that players were dealt in one run of events. The sources are the
 * permanents the trigger's filter names, read as they are or as they last were, "you" in the filter being the controller of the ability; at least `atLeast` different ones must
 * have damaged the same player. `to: 'player'` triggers once for each player damaged, `to: 'opponents'` once for the run, counting the opponents damaged (`damage` of the trigger).
 */
function damageBatchTriggers(
  state: GameState,
  damage: readonly { readonly source: ObjectId; readonly seat: SeatId; readonly amount: number }[],
  id: ObjectId,
  index: number,
  ability: TriggeredAbility,
  trigger: Extract<Trigger, { kind: 'damageBatch' }>,
  candidate: Candidate,
): PendingTrigger[] {
  const seats: SeatId[] = [];
  const sourcesOf = new Map<SeatId, ObjectId[]>();
  for (const seat of new Set(damage.map((d) => d.seat))) {
    if (trigger.to === 'opponents' && seat === candidate.controller) continue;
    const sources = [...new Set(damage.filter((d) => d.seat === seat).map((d) => d.source))].filter(
      (source) => {
        const obj = objectOrLki(state, source);
        return (
          obj !== null &&
          matchesFilter(state, obj, trigger.what, { controller: candidate.controller, source: id })
        );
      },
    );
    if (sources.length < (trigger.atLeast ?? 1)) continue;
    seats.push(seat);
    sourcesOf.set(seat, sources);
  }
  const base = {
    source: id,
    controller: candidate.controller,
    abilityIndex: index,
    ability,
    subject: null,
  };
  const conditionContext = (seat: SeatId) => ({
    controller: candidate.controller,
    source: id,
    triggerPlayer: seat,
  });
  if (trigger.to === 'opponents') {
    const [first] = seats;
    if (first === undefined) return [];
    return [{ ...base, player: first, damage: seats.length, damaged: seats }];
  }
  return seats.flatMap((seat) => {
    if (
      ability.interveningIf !== undefined &&
      !evaluateCondition(state, ability.interveningIf, conditionContext(seat))
    ) {
      return [];
    }
    if (
      ability.triggerCondition !== undefined &&
      !evaluateCondition(state, ability.triggerCondition, conditionContext(seat))
    ) {
      return [];
    }
    return [{ ...base, player: seat, cards: sourcesOf.get(seat) ?? [] }];
  });
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
    // CR 603.7, 603.2c (Forth Eorlingas!): a delayed ability of the one-or-more kind is found as the batch triggers of a permanent are, once for each player damaged in one run of events.
    if (trigger.kind === 'combatDamageBatch') {
      found.push(
        ...batchTriggers(state, events, [delayed.source], () => ({
          ...candidate,
          triggered: [{ index: -1, ability: delayed.ability }],
        })),
      );
      remaining.push(delayed);
      continue;
    }
    // `delayedCopy`: the ability may wait for any of several events; the first one that happens is the one.
    const matched = [trigger, ...(delayed.also ?? [])]
      .flatMap((each) =>
        events.flatMap((event) =>
          occurrences(state, each, event, null)
            .filter(
              (occ) =>
                (delayed.watched === undefined || occ.subject === delayed.watched) &&
                // Issue 144: "deals combat damage to that player this turn": only damage dealt to the player the ability was made for.
                (delayed.damagedPlayer === undefined ||
                  (occ.damaged?.kind === 'player' && occ.damaged.seat === delayed.damagedPlayer)) &&
                // Issue 159: "When you cast it this turn": only a spell cast from that card.
                (delayed.watchedCard === undefined ||
                  (occ.subject !== null &&
                    state.objects[occ.subject]?.card === delayed.watchedCard)) &&
                matches(state, each, occ, candidate),
            )
            .map((occ) => ({ occ, index: events.indexOf(event) })),
        ),
      )
      .sort((a, b) => a.index - b.index)
      .map(({ occ }) => occ);
    if (matched.length === 0) {
      remaining.push(delayed);
      continue;
    }
    for (const occurrence of delayed.repeat === true ? matched : matched.slice(0, 1)) {
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
    if (delayed.repeat === true) remaining.push(delayed);
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

/**
 * CR 122.6 (Lasting Tarfire: "if you put a counter on a creature this turn"): records, in the turn log, every counter a player put on a permanent in these events, with the card
 * types the permanent has as it got them. A counter no player put (`counterAdded` with no `by`) and a permanent that is gone are not recorded.
 */
function recordCountersPut(state: GameState, events: readonly GameEvent[]): GameState {
  // CR 122.6 (Wakka): every counter put on a permanent, by anyone or by no player, for "if a counter was put on this creature this turn".
  const putOn = events.flatMap((e) =>
    e.kind === 'counterAdded' && e.count >= 1 && state.objects[e.object]?.zone === 'battlefield'
      ? [{ object: e.object, counter: e.counter }]
      : [],
  );
  const logged: GameState =
    putOn.length === 0
      ? state
      : {
          ...state,
          turnLog: {
            ...state.turnLog,
            countersPutOn: [...(state.turnLog.countersPutOn ?? []), ...putOn],
          },
        };
  const put = events.flatMap((e) => {
    if (e.kind !== 'counterAdded' || e.by === undefined || e.count < 1) return [];
    const obj = state.objects[e.object];
    if (obj === undefined || obj.zone !== 'battlefield') return [];
    return [{ seat: e.by, counter: e.counter, types: [...derive(state, obj).types] }];
  });
  if (put.length === 0) return logged;
  return {
    ...logged,
    turnLog: { ...logged.turnLog, countersPut: [...(logged.turnLog.countersPut ?? []), ...put] },
  };
}

/** Adds the triggers the events cause to the pending list (CR 603.2, 603.3). */
export function collectTriggers(recorded: GameState, events: readonly GameEvent[]): GameState {
  const input = recordCountersPut(recorded, events);
  const limited = limitOncePerTurn(input, findTriggers(input, events));
  // CR 702.179d: the inherent speed ability, which belongs to no object; its once-each-turn count is in the turn log.
  const speeding = findSpeedTriggers(limited.state, events);
  const state = speeding.state;
  const speed = speeding.found;
  // D-220 (CR 603.2d): "If a triggered ability of ... triggers, that ability triggers an additional time."
  const own = [...withDoubledTriggers(state, limited.found, events)];
  const delayed = findDelayedTriggers(state, events);
  // CR 725.2 (D-127): the monarch's two inherent abilities, which belong to no object.
  const monarch = [
    ...findMonarchTriggers(state, events),
    // CR 726.2 (the initiative) and CR 309.4c (the room abilities of a dungeon): inherent abilities too.
    ...findInitiativeTriggers(state, events),
    ...findDungeonTriggers(events),
  ];
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
    speed.length === 0 &&
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
      ...speed,
      ...later,
      ...stateful,
    ],
    delayedTriggers: delayed.remaining,
  };
}
