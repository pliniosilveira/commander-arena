/**
 * Putting triggered abilities on the stack (CR 603.3, 603.3a, 603.3b).
 *
 * Once an ability has triggered, its controller puts it on the stack as an object that is not a
 * card the next time a player would receive priority (CR 603.3). When several triggered abilities
 * wait, each player in APNAP order puts theirs on the stack in any order they choose (CR 603.3b,
 * 101.4), so the active player's go on first and the last player's resolve first.
 *
 * A player who controls several triggers that are not identical chooses their order with an
 * `orderTriggers` decision. Triggers are identical (A18) when they are the same ability of the same
 * source, or abilities of that source with the same text (two instances of prowess, CR 702.108b):
 * an effect that does not read which event triggered it cannot tell them apart, so their order
 * cannot matter (Exalted of several permanents too: it never reads its source). An ability that reads the triggering object (`triggerSubject`: Ward, a copying
 * trigger) adds that object to the identity, so the same ability triggered by two different
 * spells is two groups and its player orders them.
 *
 * A triggered ability with targets (CR 603.3d, 115.1d) has them chosen as it goes on the stack, by
 * its controller, with a `targets` decision whose source is the ability's own stack object (the
 * same decision as a spell's, with no cancel). When no choice is needed (a slot with no legal target
 * that may stay empty, or exactly as many legal targets as it must have) the engine chooses. When a
 * slot needs more targets than are legal the ability is removed (`abilityRemoved`) and never goes on
 * the stack. While a decision waits, `GameState.triggering` holds the seat's remaining triggers, in
 * the order chosen; the answer puts them on the stack, then goes on with the other seats and
 * priority. The chosen targets "become the target" (`becameTarget`); abilities that triggers (Ward)
 * go on the stack in the next round (`PendingTrigger.deferred`), after the ones already waiting.
 *
 * The two-part process of CR 603.3b (abilities whose condition is "another ability triggers" go
 * first) is not needed until such an ability exists.
 */
import type { ObjectId, SeatId } from '../ids';
import type { ChosenTarget } from '../state/chosen';
import type { NewDecision, TargetChoiceSpec, TriggerChoice } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { patchObject, seatsInOrder } from '../state/ops';
import type { GameState, PendingTrigger } from '../state/types';
import { pushAbilityObject } from './ability-object';
import { becameTargetEvents } from './becomes-target';
import { controllerOf } from './control';
import { crimeEvents } from './crime';
import { EXALTED_ABILITY, EXTORT_ABILITY } from './derive-keywords';
import { INHERENT_TEXT, inherentName } from './inherent';
import {
  chosenModeSpecs,
  legalModeSets,
  modalOfAbility,
  modesDecision,
  printedOrder,
  specModes,
  withModesChosen,
} from './modes';
import { sourceInfo } from './source-info';
import { targetAnswerError, targetChoiceSpecs } from './target-choice';
import {
  readsTriggerAttacked,
  readsTriggerDamage,
  readsTriggerPlayer,
  readsTriggerSubject,
} from './trigger-subject';
import { collectTriggers } from './triggers';

/**
 * Abilities whose effect never reads the permanent they sit on, so triggers of different permanents for one
 * event are interchangeable and need no ordering (A18): Exalted (D-110) and Extort (D-120).
 */
const SOURCE_FREE_JSON: ReadonlySet<string> = new Set([
  JSON.stringify(EXALTED_ABILITY),
  JSON.stringify(EXTORT_ABILITY),
]);

export interface PutResult {
  readonly state: GameState;
  readonly events: GameEvent[];
  /** Set when a player must order their triggers first; `state` still holds those triggers. */
  readonly decision: NewDecision | null;
}

/** Waiting triggers of one seat grouped into identical ones, in order of first appearance. */
export function groupIdentical(triggers: readonly PendingTrigger[]): PendingTrigger[][] {
  const groups = new Map<string, PendingTrigger[]>();
  for (const t of triggers) {
    // An effect that reads the triggering object (Ward's targeting spell) is not interchangeable
    // with the same ability triggered by another object, so the subject joins the identity.
    const subject =
      (readsTriggerSubject(t.ability) ? `${t.subject}#` : '') +
      (readsTriggerPlayer(t.ability) ? `p${t.player}#` : '') +
      (readsTriggerDamage(t.ability) ? `d${t.damage}#` : '') +
      (readsTriggerAttacked(t.ability) ? `a${(t.attacked ?? []).join(',')}#` : '') +
      // D-177: a reflexive ability reads the permanents its resolution sacrificed.
      (t.sacrificedBefore === undefined ? '' : `s${t.sacrificedBefore.join(',')}#`) +
      (t.thisWayBefore === undefined ? '' : `w${JSON.stringify(t.thisWayBefore)}#`) +
      (t.cards === undefined ? '' : `c${t.cards.join(',')}#`);
    // Exalted (D-110) reads only the attacking creature, never the permanent with the keyword, and Extort
    // (D-120) only its controller: triggers of different permanents for one event are interchangeable (A18).
    const written = JSON.stringify(t.ability);
    const source = SOURCE_FREE_JSON.has(written) ? '' : t.source;
    const key = `${source}#${subject}${written}`;
    const group = groups.get(key);
    if (group) group.push(t);
    else groups.set(key, [t]);
  }
  return [...groups.values()];
}

/** The ability becomes an object on the stack with only its text (CR 603.3). */
function pushTrigger(
  state: GameState,
  trigger: PendingTrigger,
  targets: readonly ChosenTarget[] = [],
  modes: readonly number[] = [],
): { state: GameState; id: ObjectId; event: GameEvent } {
  const { state: next, id } = pushAbilityObject(state, {
    controller: trigger.controller,
    source: trigger.source,
    ...(trigger.inherent === undefined ? {} : { inherent: trigger.inherent }),
    abilityIndex: trigger.abilityIndex,
    ability: trigger.ability,
    ...(trigger.subject !== null && readsTriggerSubject(trigger.ability)
      ? { subject: trigger.subject }
      : {}),
    ...(trigger.player !== undefined && readsTriggerPlayer(trigger.ability)
      ? { player: trigger.player }
      : {}),
    ...(trigger.damage !== undefined && readsTriggerDamage(trigger.ability)
      ? { damage: trigger.damage }
      : {}),
    ...(trigger.attacked !== undefined && readsTriggerAttacked(trigger.ability)
      ? { attacked: trigger.attacked }
      : {}),
    ...(trigger.chapter === undefined ? {} : { chapter: trigger.chapter }),
    ...(trigger.sacrificedBefore === undefined
      ? {}
      : { sacrificedBefore: trigger.sacrificedBefore }),
    ...(trigger.thisWayBefore === undefined ? {} : { thisWayBefore: trigger.thisWayBefore }),
    ...(trigger.cards === undefined ? {} : { cards: trigger.cards }),
    ...(targets.length === 0 ? {} : { targets }),
    ...(modes.length === 0 ? {} : { modes }),
  });
  // D-151: "choose one that hasn't been chosen this turn" reads the modes this permanent chose.
  const logged = trigger.source === null ? next : withModesChosen(next, trigger.source, modes);
  return {
    // A new object on the stack: earlier passes in succession no longer count (CR 117.4).
    state: { ...logged, turn: { ...logged.turn, passedInSuccession: [] } },
    id,
    event: {
      kind: 'abilityTriggered',
      seat: trigger.controller,
      // An ability with no source (the monarch's, CR 725.2) names its own stack object, as `StackData` reads it.
      source: trigger.source ?? id,
      abilityIndex: trigger.abilityIndex,
      stackObject: id,
      ...(trigger.chapter === undefined ? {} : { chapter: trigger.chapter }),
    },
  };
}

/**
 * CR 601.2c, 603.3d: the objects and players chosen as targets "become the target" as they are
 * chosen. What that triggers (Ward) is noted at once but waits for the next round: it triggered
 * during the process, so it goes on the stack after the abilities already waiting (CR 603.3b).
 */
function targetsChosen(
  state: GameState,
  stackObject: ObjectId,
  seat: SeatId,
): { state: GameState; events: GameEvent[] } {
  // CR 700.13 (D-464): putting a triggered ability on the stack with such a target is committing a crime too.
  const events = [
    ...becameTargetEvents(state, stackObject, seat),
    ...crimeEvents(state, stackObject, seat),
  ];
  const before = state.pendingTriggers.length;
  const collected = collectTriggers(state, events);
  return {
    state: {
      ...collected,
      pendingTriggers: collected.pendingTriggers.map((t, i) =>
        i < before ? t : { ...t, deferred: true as const },
      ),
    },
    events,
  };
}

/** The `modesChosen` event of a modal ability whose only legal choice the engine made (none for another). */
function modesEvents(seat: SeatId, source: ObjectId, modes: readonly number[]): GameEvent[] {
  return modes.length === 0 ? [] : [{ kind: 'modesChosen', seat, source, modes, automatic: true }];
}

/** Whether the choices need no decision: no legal target and none needed, or exactly as many as needed. */
function isForced(choices: readonly TargetChoiceSpec[]): boolean {
  return choices.every(
    (c) => c.legal.length === 0 || (c.min === c.max && c.min === c.legal.length),
  );
}

/**
 * Puts the head of the interrupted seat's queue on the stack, then the rest, until a trigger needs
 * a target decision (returned) or the queue is empty (CR 603.3b, 603.3d). The queue is
 * `state.triggering.queue`; the caller has taken those triggers off the waiting list.
 */
function runQueue(input: GameState): PutResult {
  let state = input;
  const events: GameEvent[] = [];
  for (let guard = 0; guard < 10_000; guard += 1) {
    const ctx = state.triggering;
    const trigger = ctx?.queue[0];
    if (ctx === null || trigger === undefined) break;
    state = { ...state, triggering: { ...ctx, queue: ctx.queue.slice(1), awaiting: null } };
    if (trigger.source === null) {
      // An inherent ability of the monarch (CR 725.2) has no modes and no targets: it goes on the stack as it is.
      const pushed = pushTrigger(state, trigger);
      state = pushed.state;
      events.push(pushed.event);
      continue;
    }
    // CR 603.3c, 700.2b (D-114): a modal ability's modes are chosen as it goes on the stack, before the
    // targets of the modes chosen. A mode with no legal target cannot be chosen; with no legal choice at
    // all the ability is removed.
    const select = {
      controller: trigger.controller,
      source: trigger.source,
      ...(trigger.player === undefined ? {} : { triggerPlayer: trigger.player }),
      ...(trigger.damage === undefined ? {} : { triggerDamage: trigger.damage }),
    };
    const modal = modalOfAbility(trigger.ability);
    let modes: readonly number[] = [];
    if (modal !== null) {
      const sets = legalModeSets(state, modal, select);
      const only = sets[0];
      if (only === undefined) {
        events.push({
          kind: 'abilityRemoved',
          seat: trigger.controller,
          source: trigger.source,
          abilityIndex: trigger.abilityIndex,
          reason: 'noLegalModes',
          ...(trigger.chapter === undefined ? {} : { chapter: trigger.chapter }),
        });
        continue;
      }
      if (sets.length > 1) {
        // The ability goes on the stack first, as with targets; the answer chooses its modes.
        const pushed = pushTrigger(state, trigger);
        events.push(pushed.event);
        const waiting = state.triggering;
        return {
          state: {
            ...pushed.state,
            triggering: {
              seat: trigger.controller,
              queue: waiting?.queue ?? [],
              awaiting: pushed.id,
            },
          },
          events,
          decision: modesDecision(
            state,
            trigger.controller,
            pushed.id,
            trigger.source,
            'trigger',
            modal,
            sets,
            select,
          ),
        };
      }
      modes = only;
    }
    const entries =
      modal === null
        ? (trigger.ability.targets ?? []).map((spec) => ({ spec, mode: -1 }))
        : chosenModeSpecs(modal, modes);
    const specs = entries.map((e) => e.spec);
    if (specs.length === 0) {
      const pushed = pushTrigger(state, trigger, [], modes);
      state = pushed.state;
      events.push(pushed.event, ...modesEvents(trigger.controller, pushed.id, modes));
      continue;
    }
    // CR 603.3d: the controller chooses as the ability goes on the stack, like casting (CR 601.2c).
    // The source may have left the battlefield (CR 603.10a); `trigger.controller` is who controlled it.
    const choices = targetChoiceSpecs(
      state,
      specs,
      select,
      modal === null ? undefined : specModes(modal, modes),
    );
    if (choices.some((c) => c.legal.length < c.min)) {
      // CR 603.3d: a required choice with no legal choice: the ability is simply removed.
      events.push({
        kind: 'abilityRemoved',
        seat: trigger.controller,
        source: trigger.source,
        abilityIndex: trigger.abilityIndex,
        reason: 'noLegalTargets',
        ...(trigger.chapter === undefined ? {} : { chapter: trigger.chapter }),
      });
      continue;
    }
    if (isForced(choices)) {
      const chosen = choices.flatMap((c) => c.legal);
      const pushed = pushTrigger(state, trigger, chosen, modes);
      events.push(pushed.event, ...modesEvents(trigger.controller, pushed.id, modes));
      const named = targetsChosen(pushed.state, pushed.id, trigger.controller);
      state = named.state;
      events.push(...named.events);
      continue;
    }
    const pushed = pushTrigger(state, trigger, [], modes);
    events.push(pushed.event, ...modesEvents(trigger.controller, pushed.id, modes));
    const waiting = state.triggering;
    state = {
      ...pushed.state,
      triggering: { seat: trigger.controller, queue: waiting?.queue ?? [], awaiting: pushed.id },
    };
    return {
      state,
      events,
      decision: {
        kind: 'targets',
        seat: trigger.controller,
        source: pushed.id,
        specs: choices,
        forTrigger: true,
      },
    };
  }
  return { state: { ...state, triggering: null }, events, decision: null };
}

/** Takes `ordered` off the waiting list and puts them on the stack in that order (CR 603.3b, 603.3d). */
function putSeatTriggers(
  input: GameState,
  seat: SeatId,
  ordered: readonly PendingTrigger[],
): PutResult {
  return runQueue({
    ...input,
    pendingTriggers: input.pendingTriggers.filter((p) => !ordered.includes(p)),
    triggering: { seat, queue: ordered, awaiting: null },
  });
}

function triggerChoice(state: GameState, group: readonly PendingTrigger[]): TriggerChoice {
  const first = group[0] as PendingTrigger;
  const info =
    first.source === null
      ? {
          name: inherentName(first.inherent ?? 'monarchDraw'),
          oracleText: INHERENT_TEXT[first.inherent ?? 'monarchDraw'],
        }
      : sourceInfo(state, first.source);
  return {
    source: first.source,
    sourceName: info?.name ?? '',
    sourceOracleText: info?.oracleText ?? '',
    abilityIndex: first.abilityIndex,
    count: group.length,
    ...(first.chapter === undefined ? {} : { chapter: first.chapter }),
    ...(first.ability.kind === 'triggered' ? { trigger: first.ability.trigger } : {}),
  };
}

/** The triggers that triggered during the process join the waiting ones for the next round. */
function endRound(state: GameState): GameState {
  if (!state.pendingTriggers.some((t) => t.deferred === true)) return state;
  return {
    ...state,
    pendingTriggers: state.pendingTriggers.map((t) => {
      const { deferred: _deferred, ...rest } = t;
      return rest;
    }),
  };
}

/**
 * Puts every waiting trigger on the stack, active player first (CR 603.3b). Stops at the first
 * player who must order several different triggers (an `orderTriggers` decision) or who must choose
 * targets for one (a `targets` decision, CR 603.3d), and returns that decision; the rest stay
 * waiting, or in `GameState.triggering` for the seat that was interrupted, which this resumes first.
 */
export function putTriggersOnStack(input: GameState): PutResult {
  let state = input;
  const events: GameEvent[] = [];
  if (state.triggering !== null) {
    const resumed = runQueue(state);
    state = resumed.state;
    events.push(...resumed.events);
    if (resumed.decision) return { state, events, decision: resumed.decision };
  }
  for (const seat of seatsInOrder(state, state.turn.activeSeat)) {
    const mine = state.pendingTriggers.filter((t) => t.controller === seat && t.deferred !== true);
    if (mine.length === 0) continue;
    const groups = groupIdentical(mine);
    if (groups.length > 1) {
      return {
        state,
        events,
        decision: {
          kind: 'orderTriggers',
          seat,
          triggers: groups.map((g) => triggerChoice(state, g)),
        },
      };
    }
    const r = putSeatTriggers(state, seat, mine);
    state = r.state;
    events.push(...r.events);
    if (r.decision) return { state, events, decision: r.decision };
  }
  return { state: endRound(state), events, decision: null };
}

/** Whether `order` is a permutation of 0..n-1 (the answer to an orderTriggers decision). */
export function isPermutation(order: readonly number[], n: number): boolean {
  return (
    order.length === n &&
    new Set(order).size === n &&
    order.every((i) => Number.isInteger(i) && i >= 0 && i < n)
  );
}

/**
 * Answers an orderTriggers decision: puts the seat's triggers on the stack in the chosen order
 * (each group stays together), then goes on with the other players' triggers. The caller gives
 * priority afterwards.
 */
export function answerTriggerOrder(
  state: GameState,
  seat: SeatId,
  order: readonly number[],
): PutResult | null {
  const mine = state.pendingTriggers.filter((t) => t.controller === seat && t.deferred !== true);
  const groups = groupIdentical(mine);
  if (!isPermutation(order, groups.length)) return null;
  const ordered = order.flatMap((i) => groups[i] ?? []);
  const first = putSeatTriggers({ ...state, pending: null }, seat, ordered);
  if (first.decision) return first;
  const rest = putTriggersOnStack(first.state);
  return { state: rest.state, events: [...first.events, ...rest.events], decision: rest.decision };
}

/**
 * Answers the `chooseModes` decision of a modal triggered ability being put on the stack (CR 603.3c,
 * 700.2b, D-114): the modes are kept on the ability, then its targets (for the modes chosen) are chosen
 * as for any trigger, then the rest of the queue goes on. Returns the next decision when one is needed,
 * or an error text when the answer is not one of the legal sets. The caller gives priority afterwards.
 */
export function answerTriggerModes(
  state: GameState,
  modes: readonly number[],
): PutResult | { readonly error: string } {
  const ctx = state.triggering;
  const pending = state.pending;
  if (ctx === null || ctx.awaiting === null || pending?.kind !== 'chooseModes') {
    return { error: 'No triggered ability is waiting for modes' };
  }
  const stackObject = ctx.awaiting;
  const obj = state.objects[stackObject];
  const stack = obj?.stack;
  const modal = modalOfAbility(stack?.ability);
  if (!obj || !stack || modal === null)
    return { error: 'The triggered ability is not on the stack' };
  const chosen = printedOrder(modes);
  const select = {
    controller: controllerOf(state, obj),
    source: stack.source,
    ...(stack.triggerPlayer === undefined ? {} : { triggerPlayer: stack.triggerPlayer }),
    ...(stack.triggerDamage === undefined ? {} : { triggerDamage: stack.triggerDamage }),
  };
  const patched = patchObject({ ...state, pending: null }, stackObject, {
    stack: { ...stack, chosenModes: chosen },
  });
  const answered = stack.source === null ? patched : withModesChosen(patched, stack.source, chosen);
  const events: GameEvent[] = [
    {
      kind: 'modesChosen',
      seat: pending.seat,
      source: stackObject,
      modes: chosen,
      automatic: false,
    },
  ];
  const specs = chosenModeSpecs(modal, chosen).map((e) => e.spec);
  const choices = targetChoiceSpecs(answered, specs, select, specModes(modal, chosen));
  if (choices.length > 0 && !isForced(choices)) {
    // The targets of the modes are still to choose: the same decision as any trigger's (CR 603.3d).
    return {
      state: answered,
      events,
      decision: {
        kind: 'targets',
        seat: pending.seat,
        source: stackObject,
        specs: choices,
        forTrigger: true,
      },
    };
  }
  let next: GameState = { ...answered, triggering: { ...ctx, awaiting: null } };
  if (choices.length > 0) {
    // Exactly as many legal targets as needed: the engine chooses them (CR 603.3d).
    const picked = choices.flatMap((c) => c.legal);
    const withTargets = patchObject(next, stackObject, {
      stack: { ...stack, chosenModes: chosen, chosenTargets: picked },
    });
    const named = targetsChosen(withTargets, stackObject, pending.seat);
    next = named.state;
    events.push(...named.events);
  }
  const rest = putTriggersOnStack(next);
  return { state: rest.state, events: [...events, ...rest.events], decision: rest.decision };
}

/**
 * Answers the `targets` decision of a triggered ability being put on the stack (CR 603.3d): the
 * chosen targets become targets (`becameTarget`, CR 601.2c), then the seat's other triggers go on
 * the stack, then the other seats' (CR 603.3b). Returns the next decision when one is needed, or an
 * error text when the answer is not legal. The caller gives priority afterwards.
 */
export function answerTriggerTargets(
  state: GameState,
  chosen: readonly ChosenTarget[],
): PutResult | { readonly error: string } {
  const ctx = state.triggering;
  const pending = state.pending;
  if (ctx === null || ctx.awaiting === null || pending?.kind !== 'targets') {
    return { error: 'No triggered ability is waiting for targets' };
  }
  const refused = targetAnswerError(pending, chosen);
  if (refused !== null) return { error: refused };
  const stackObject = ctx.awaiting;
  const stack = state.objects[stackObject]?.stack;
  if (!stack) return { error: 'The triggered ability is not on the stack' };
  const answered = patchObject({ ...state, pending: null }, stackObject, {
    stack: { ...stack, chosenTargets: chosen },
  });
  const named = targetsChosen(
    { ...answered, triggering: { ...ctx, awaiting: null } },
    stackObject,
    pending.seat,
  );
  const rest = putTriggersOnStack(named.state);
  return {
    state: rest.state,
    events: [...named.events, ...rest.events],
    decision: rest.decision,
  };
}
