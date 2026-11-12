/**
 * Turn structure and priority passing (CR 500-514, 117, 405.5).
 *
 * The engine always waits on one decision. This module is what runs between decisions: turn-based
 * actions, giving priority, resolving the stack when everyone passes, ending steps and phases, and
 * the cleanup step with its "another cleanup step" repeat (CR 514.3a).
 *
 * Combat: with no attacker declared the declare blockers and combat
 * damage steps are skipped (CR 508.8) and the other combat steps still give priority (CR 508.2, 511.1).
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import {
  allocateTimestamp,
  getObject,
  getSeat,
  patchObject,
  patchSeat,
  seatsInOrder,
} from '../state/ops';
import type { GameState, PhaseId, StepId } from '../state/types';
import { EMPTY_TURN_LOG } from '../state/types';
import { endCombat } from './combat';
import { beginCombatStep, nextCombatStep } from './combat-flow';
import { expireEndOfTurnEffects, expireEndStepEffects, expireTurnStartEffects } from './continuous';
import { controllerOf } from './control';
import { derive } from './derive';
import { drawCard } from './effect-support';
import { discardOne } from './madness';
import { emptyManaPools } from './mana-engine';
import { miracleOffer, miracleQuestion, revealMiracleEvents } from './miracle';
import { phaseInFor } from './phasing';
import { grantPriority, type Outcome } from './priority';
import { hasOptionalUntap, hasRestriction } from './restrictions';
import { addLoreCounters } from './saga';
import { setPending } from './set-pending';
import { settle } from './settle';
import { resolveTop } from './stack';
import { hasNoMaximumHandSize, keepsDamage } from './statics';
import { collectTriggers } from './triggers';
import { untapPermanent } from './untap';
import { untapForOthers } from './untap-others';

/** Steps in order. Declare blockers and combat damage are skipped without attackers (CR 508.8). */
const STEP_ORDER: readonly StepId[] = [
  'untap',
  'upkeep',
  'draw',
  'precombatMain',
  'beginningOfCombat',
  'declareAttackers',
  'endOfCombat',
  'postcombatMain',
  'end',
  'cleanup',
];

/** The step that ends each phase but the ending one (CR 500.1): what is left of it is done when this step ends, and an added phase may follow (CR 500.8). */
const PHASE_LAST_STEP: readonly StepId[] = [
  'draw',
  'precombatMain',
  'endOfCombat',
  'postcombatMain',
];

/** The first step of the phase that follows each phase of the turn's own sequence (CR 500.1), for the turn to go on after added phases. */
const FIRST_STEP_AFTER: Record<PhaseId, StepId> = {
  beginning: 'precombatMain',
  precombatMain: 'beginningOfCombat',
  combat: 'postcombatMain',
  postcombatMain: 'end',
  ending: 'end',
};

const PHASE_OF: Record<StepId, PhaseId> = {
  untap: 'beginning',
  upkeep: 'beginning',
  draw: 'beginning',
  precombatMain: 'precombatMain',
  beginningOfCombat: 'combat',
  declareAttackers: 'combat',
  declareBlockers: 'combat',
  firstStrikeDamage: 'combat',
  combatDamage: 'combat',
  endOfCombat: 'combat',
  postcombatMain: 'postcombatMain',
  end: 'ending',
  cleanup: 'ending',
};

function join(a: Outcome, b: Outcome): Outcome {
  return { state: b.state, events: [...a.events, ...b.events] };
}

/** Begins a new turn for `seat` (CR 500.1). */
export function startTurn(state: GameState, seat: SeatId): Outcome {
  const [stamp, s1] = allocateTimestamp(state);
  // CR 702.30a (D-127): the start of the seat's previous turn is kept for "since the beginning of your last upkeep".
  let next = patchSeat(s1, seat, {
    turnStartTimestamp: stamp,
    previousTurnStartTimestamp: getSeat(s1, seat).turnStartTimestamp,
    // D-149: "your first, second, or third turn of the game".
    turnsTaken: getSeat(s1, seat).turnsTaken + 1,
  });
  // CR 121.1: "each turn" counts of draws start over for every player (the `drawn` trigger's `nth`, D-111),
  // and so does the life each player lost (Spectacle, CR 702.137a, D-124) and the count of spells each cast (Storm,
  // CR 702.40a, D-129).
  for (const s of next.seats) {
    next = patchSeat(next, s.id, {
      landsPlayedThisTurn: 0,
      cardsDrawnThisTurn: 0,
      spellsCastThisTurn: 0,
      lifeLostThisTurn: 0,
    });
  }
  next = {
    ...next,
    // D-139: "once each turn" and "this turn" start over.
    turnLog: EMPTY_TURN_LOG,
    turn: {
      number: state.turn.number + 1,
      activeSeat: seat,
      phase: 'beginning',
      step: 'untap',
      prioritySeat: null,
      passedInSuccession: [],
      extraLandDrops: 0,
    },
  };
  // CR 500.1, 611.2a (D-179): "until your next turn" ends as that turn begins.
  const expired = expireTurnStartEffects(next, seat);
  next = expired.state;
  const events: GameEvent[] = [
    { kind: 'turnBegan', seat, turn: next.turn.number },
    ...expired.events,
  ];
  return join({ state: next, events }, beginStep(next, 'untap'));
}

/** Starts a step: its turn-based actions, then priority if the step gives it (CR 500.2). */
export function beginStep(input: GameState, step: StepId): Outcome {
  const active = input.turn.activeSeat;
  let state: GameState = {
    ...input,
    turn: {
      ...input.turn,
      step,
      phase: PHASE_OF[step],
      passedInSuccession: [],
      prioritySeat: null,
    },
  };
  const events: GameEvent[] = [{ kind: 'stepBegan', step, seat: active }];

  switch (step) {
    case 'untap': {
      // CR 702.26a (D-234): the permanents that phased out under the active player's control phase in first, before anything untaps.
      state = phaseInFor(state, active);
      // CR 502.3: the active player untaps all their permanents, except the ones an effect keeps
      // from untapping ("doesn't untap during your untap step", D-094). No one receives priority
      // (CR 502.4).
      // CR 502.3 (D-125): a permanent that its controller may choose not to untap waits for that choice.
      const optional: ObjectId[] = [];
      for (const id of state.battlefield) {
        const obj = getObject(state, id);
        if (
          controllerOf(state, obj) !== active ||
          !obj.tapped ||
          hasRestriction(state, obj, 'doesntUntap')
        ) {
          continue;
        }
        if (hasOptionalUntap(state, obj)) {
          optional.push(id);
          continue;
        }
        // CR 122.1d (D-145): a stun counter is removed instead of untapping.
        const r = untapPermanent(state, id);
        state = r.state;
        events.push(...r.events);
      }
      // CR 502.3, 611.3 (D-229): "Untap all creatures you control during each other player's untap step", together with the active player's own.
      const others = untapForOthers(state, active);
      state = others.state;
      events.push(...others.events);
      const first = optional[0];
      if (first !== undefined) {
        return {
          state: setPending(state, {
            kind: 'choosePermanent',
            seat: active,
            source: first,
            purpose: 'untap',
            min: 0,
            max: optional.length,
            legal: optional,
          }),
          events,
        };
      }
      // CR 502.4, 603.2 (D-206): no player receives priority in the untap step, so what triggers in it ("whenever this becomes untapped") waits and goes on the
      // stack in the upkeep, the first step with priority. The permanents just untapped are noted now: these events are not scanned again.
      state = collectTriggers(state, events);
      return join({ state, events }, endStep(state));
    }
    case 'draw': {
      // CR 504.1; CR 103.8a: in a two-player game the starting player skips the draw of their first turn.
      const skip = state.seats.length === 2 && state.turn.number === 1;
      if (!skip) {
        const r = drawCard(state, active);
        // CR 903.9b: a commander on top of the library asks its owner first. The turn-based action
        // waits for the answer (`resumeDrawStep`); no priority is given in the meantime.
        // What triggered so far (the step beginning) is noted now: these events are not scanned again.
        if (r.kind === 'needsDecision') {
          return { state: setPending(collectTriggers(state, events), r.decision), events };
        }
        state = r.state;
        events.push(...r.events);
        // CR 702.94a (D-274): a card with miracle drawn as the first card of the turn may be revealed as it is drawn. The step waits for
        // the answer (`answerMiracleDraw`); the triggers so far (the step beginning, the draw) are noted now, as for the commander above.
        const offer = miracleOffer(state, active, r.events);
        if (offer !== null) {
          return {
            state: setPending(
              collectTriggers(state, events),
              miracleQuestion(state, active, offer),
            ),
            events,
          };
        }
      }
      break;
    }
    case 'precombatMain': {
      // CR 714.3c: the active player puts a lore counter on each Saga they control with chapter
      // abilities. A turn-based action, so no stack; the chapters it reaches trigger below.
      const lore = addLoreCounters(state, (obj) => derive(state, obj));
      state = lore.state;
      events.push(...lore.events);
      break;
    }
    case 'end':
      // D-151: "until your next end step": the permission ends as that step begins (nothing it allows can be done in it).
      {
        const expired = expireEndStepEffects(state);
        state = expired.state;
        events.push(...expired.events);
      }
      break;
    case 'cleanup':
      return join({ state, events }, runCleanup(state));
    default:
      break;
  }
  // Combat steps have their own turn-based actions (CR 508.1, 509.1, 510.1).
  const combat = beginCombatStep(state, step, events);
  if (combat) return join({ state, events }, combat);
  // CR 603.2b: abilities that trigger at the beginning of the step go on the stack first.
  return join({ state, events }, grantPriority(state, active, events));
}

/**
 * The draw of the draw step (CR 504.1) was waiting for its owner's answer to CR 903.9b (the card on
 * top of the library is a commander): `moveToCommandZone` puts it into the command zone instead of
 * the hand, `declineCommandZone` draws it. Then the step goes on: triggers, then priority.
 */
export function resumeDrawStep(input: GameState, toCommandZone: boolean): Outcome {
  const state: GameState = { ...input, pending: null };
  const active = state.turn.activeSeat;
  const r = drawCard(state, active, toCommandZone);
  // With the answer given the draw cannot ask again; if it ever did, it would be asked, not lost.
  if (r.kind === 'needsDecision') return { state: setPending(state, r.decision), events: [] };
  // CR 702.94a (D-274): a commander with miracle drawn after all is a card drawn, and may be revealed as it is drawn.
  const offer = miracleOffer(r.state, active, r.events);
  if (offer !== null) {
    return {
      state: setPending(
        collectTriggers(r.state, [...r.events]),
        miracleQuestion(r.state, active, offer),
      ),
      events: r.events,
    };
  }
  return join({ state: r.state, events: r.events }, grantPriority(r.state, active, r.events));
}

/**
 * The draw of the draw step (CR 504.1) drew a card with miracle as the first card of the turn, and its owner answered whether to reveal it
 * (CR 702.94a, D-274): accepting reveals it (the trigger goes on the stack with the step's other triggers), declining reveals nothing. Then
 * the step goes on: triggers, then priority.
 */
export function answerMiracleDraw(input: GameState, card: ObjectId, reveal: boolean): Outcome {
  const state: GameState = { ...input, pending: null };
  const active = state.turn.activeSeat;
  const events: GameEvent[] = reveal ? revealMiracleEvents(state, active, card) : [];
  return join({ state, events }, grantPriority(state, active, events));
}

/**
 * The answer to the untap question of CR 502.3 (D-125): the chosen permanents untap, simultaneously, and the step
 * ends (no priority, CR 502.4). Null when the answer names a permanent that is not on offer or names one twice.
 */
export function answerUntapChoice(input: GameState, chosen: readonly ObjectId[]): Outcome | null {
  const d = input.pending;
  if (d?.kind !== 'choosePermanent' || d.purpose !== 'untap') return null;
  if (new Set(chosen).size !== chosen.length || chosen.some((id) => !d.legal.includes(id))) {
    return null;
  }
  let state: GameState = { ...input, pending: null };
  const events: GameEvent[] = [];
  for (const id of d.legal.filter((l) => chosen.includes(l))) {
    const r = untapPermanent(state, id);
    state = r.state;
    events.push(...r.events);
  }
  // CR 502.4 (D-206): as for the untap step, what the permanents that untapped triggered waits for the upkeep.
  state = collectTriggers(state, events);
  return join({ state, events }, endStep(state));
}

/** Ends the current step: mana empties (CR 500.5), then the next step or turn begins. */
export function endStep(input: GameState): Outcome {
  const emptied = emptyManaPools(input);
  let state = emptied.state;
  const events = emptied.events;
  const step = state.turn.step;
  if (step === 'cleanup') {
    // Priority was given during cleanup, so another cleanup step begins (CR 514.3a).
    return join({ state, events }, beginStep(state, 'cleanup'));
  }
  // The combat phase ends with its end step: everything is removed from combat (CR 511.3).
  if (step === 'endOfCombat') state = endCombat(state);
  // CR 500.8 (D-151, D-187): when a phase ends, the phase an effect added directly after it begins; an added phase that ends is followed by the next
  // one added, or else by the phase of the turn's own sequence that comes after the one the added phases follow.
  if (PHASE_LAST_STEP.includes(step)) {
    const added = state.turn.addedPhases ?? [];
    const [next, ...rest] = added;
    if (next !== undefined) {
      const { addedPhases: _taken, ...turn } = state.turn;
      state = {
        ...state,
        turn: {
          ...turn,
          ...(rest.length === 0 ? {} : { addedPhases: rest }),
          addedAfter: next.after,
        },
        // CR 603.7 (D-187): "at the beginning of that combat": triggers as the beginning of combat step of this phase begins.
        delayedTriggers:
          next.atBeginning === undefined
            ? state.delayedTriggers
            : [
                ...state.delayedTriggers,
                {
                  source: next.atBeginning.source,
                  controller: next.atBeginning.controller,
                  ability: {
                    kind: 'triggered',
                    trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
                    effect: next.atBeginning.effect,
                  },
                },
              ],
      };
      return join({ state, events }, beginStep(state, 'beginningOfCombat'));
    }
    const resumeAfter = state.turn.addedAfter;
    if (resumeAfter !== undefined) {
      const { addedAfter: _done, ...turn } = state.turn;
      state = { ...state, turn };
      return join({ state, events }, beginStep(state, FIRST_STEP_AFTER[resumeAfter]));
    }
  }
  const nextStep = nextCombatStep(state, step) ?? STEP_ORDER[STEP_ORDER.indexOf(step) + 1];
  if (nextStep === undefined) throw new Error(`No step after ${step}`);
  return join({ state, events }, beginStep(state, nextStep));
}

/** CR 514 (Cleanup Step). */
export function runCleanup(input: GameState): Outcome {
  const active = input.turn.activeSeat;
  const seat = getSeat(input, active);
  // CR 514.1: discard down to maximum hand size, unless a permanent says there is none (CR 402.2).
  const max = seat.handSizeMax ?? input.settings.maxHandSize;
  const excess = hasNoMaximumHandSize(input, active) ? 0 : seat.hand.length - max;
  if (excess > 0) {
    return {
      state: setPending(input, { kind: 'discard', seat: active, count: excess, hand: seat.hand }),
      events: [],
    };
  }
  return afterDiscard(input);
}

/** CR 514.2 and 514.3, run once the discard (if any) is done. */
export function afterDiscard(input: GameState, prior: readonly GameEvent[] = []): Outcome {
  let state: GameState = { ...input, pending: null };
  // CR 514.2: all damage marked on permanents is removed (and "until end of turn" effects end). D-192: not on a permanent whose static ability
  // says damage isn't removed from it during cleanup steps (it keeps what a source with deathtouch dealt it too, which goes with the damage).
  for (const id of state.battlefield) {
    const obj = getObject(state, id);
    if ((obj.damage !== 0 || obj.damagedByDeathtouch) && !keepsDamage(state, obj)) {
      state = patchObject(state, id, { damage: 0, damagedByDeathtouch: false });
    }
  }
  const expired = expireEndOfTurnEffects(state);
  state = expired.state;
  // CR 514.3a: if state-based actions or triggers need handling, players get priority and another
  // cleanup step follows. Otherwise the turn ends (CR 514.3).
  const settled = settle(state, [...prior, ...expired.events]);
  if (settled.state.result || settled.paused) {
    return { state: settled.state, events: [...expired.events, ...settled.events] };
  }
  if (settled.performed || settled.decision) {
    const granted = grantPriority(settled.state, settled.state.turn.activeSeat);
    return {
      state: granted.state,
      events: [...expired.events, ...settled.events, ...granted.events],
    };
  }
  return join(
    { state: settled.state, events: [...expired.events, ...settled.events] },
    startNextTurn(settled.state),
  );
}

function startNextTurn(state: GameState): Outcome {
  const order = seatsInOrder(state, (state.turn.activeSeat + 1) % state.seats.length);
  const next = order[0];
  if (next === undefined) return { state, events: [] };
  return startTurn(state, next);
}

/** The seat holding priority passes (CR 117.3d, 117.4). */
export function passPriority(input: GameState, seat: SeatId): Outcome {
  const alive = seatsInOrder(input, seat);
  const passed = [...input.turn.passedInSuccession, seat];
  const events: GameEvent[] = [{ kind: 'priorityPassed', seat }];
  const state: GameState = {
    ...input,
    pending: null,
    turn: { ...input.turn, passedInSuccession: passed },
  };
  const everyonePassed = alive.every((s) => passed.includes(s));
  if (!everyonePassed) {
    // The next seat in turn order who has not passed receives priority (CR 117.3d).
    const next = alive.find((s) => s !== seat && !passed.includes(s)) ?? alive[0];
    if (next === undefined) return { state, events };
    return join({ state, events }, grantPriority(state, next));
  }
  if (state.stack.length > 0) {
    // CR 405.5 / 117.4: the top object resolves, then the active player gets priority (CR 117.3b).
    const resolved = resolveTop(state);
    if (resolved.paused) return { state: resolved.state, events: [...events, ...resolved.events] };
    return join(
      { state: resolved.state, events: [...events, ...resolved.events] },
      afterResolution(resolved.state, resolved.events),
    );
  }
  return join({ state, events }, endStep(state));
}

/** After a resolution the active player receives priority (CR 117.3b). */
export function afterResolution(state: GameState, prior: readonly GameEvent[] = []): Outcome {
  const cleared: GameState = {
    ...state,
    turn: { ...state.turn, passedInSuccession: [] },
  };
  return grantPriority(cleared, cleared.turn.activeSeat, prior);
}

/** CR 514.1: the chosen cards are discarded, then cleanup continues. */
export function discardCards(
  state: GameState,
  seat: SeatId,
  objects: readonly ObjectId[],
): Outcome {
  let next = state;
  const events: GameEvent[] = [];
  for (const id of objects) {
    const discarded = discardOne(next, seat, id); // CR 702.35a: madness exiles it instead
    if (discarded === null) throw new Error('A discard asked for a decision');
    next = discarded.state;
    events.push(...discarded.events);
  }
  return join({ state: next, events }, afterDiscard(next, events));
}
