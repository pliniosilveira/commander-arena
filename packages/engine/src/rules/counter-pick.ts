/**
 * "Remove any number of counters from among permanents on the battlefield", "Remove up to three counters from target permanent" and "Move a counter from target permanent you
 * control onto a second target permanent" (CR 122.1, 122.5, 608.2d; Eventide's Shadow, Glissa Sunslayer, Nesting Grounds): the controller chooses which counters, so a kind of counter
 * and the permanent it comes off are an answer of theirs as the effect resolves, not a choice made when the spell or ability goes on the stack.
 *
 * One counter at a time, as `moveCountersOnto` does: a `chooseOption` decision (purpose `counterPick`) lists every counter that may be taken (the permanent and the kind: `counterPicks`
 * names them, parallel to the options) and, when the effect takes "any number" or "up to", a last option that stops. The question is asked again after each counter while another
 * may still be taken. It is not asked when there is nothing to choose between: a move with one kind of counter that can go, or removals that must take the only counter left.
 *
 * Removing is not putting, so nothing here is held back by a "can't have counters" effect (CR 122.6 reads counters put on an object). Moving is removing one counter and putting it on the
 * second object (CR 122.5): the move is not possible when the two are the same permanent, the first has no counter of the kind, or the second can't have it, and then nothing happens.
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { patchObject } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { controllerOf } from './control';
import { counterRemovalLocked } from './counter-lock';
import { counterBlocked } from './counter-prevention';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type CounterPick = Extract<Instruction, { kind: 'counterPick' }>;

/** The last option of a question that may stop: no more counters. */
export const COUNTER_PICK_STOP = 'Done';

/** One counter that may be taken: the permanent, the kind and how many of the kind it has. */
export interface CounterPickOption {
  readonly object: ObjectId;
  readonly counter: string;
  readonly count: number;
}

/** The counters that may be taken now (CR 122.1): every kind on every permanent of the list still on the battlefield; for a move, only kinds the second permanent can have. */
export function counterPickOptions(state: GameState, ins: CounterPick): CounterPickOption[] {
  const out: CounterPickOption[] = [];
  const to = ins.to === null ? null : state.objects[ins.to];
  if (ins.mode === 'move' && (to === undefined || to === null || to.zone !== 'battlefield')) {
    return out;
  }
  for (const id of ins.objects) {
    const obj = state.objects[id];
    // CR 122.1: counters stay on a card in exile, so a removal may take them from there (Mari, the Killing Quill); a move is between permanents.
    if (obj === undefined) continue;
    if (obj.zone !== 'battlefield' && !(ins.mode === 'remove' && obj.zone === 'exile')) continue;
    if (ins.mode === 'move' && id === ins.to) continue;
    for (const [counter, count] of Object.entries(obj.counters)) {
      if (count <= 0) continue;
      if (ins.counterKind !== undefined && counter !== ins.counterKind) continue;
      // CR 122.1d (Fear of Sleep Paralysis): a counter that can't be removed can't be taken or moved.
      if (counterRemovalLocked(state, obj, counter)) continue;
      if (ins.mode === 'move' && to != null && counterBlocked(state, to, counter)) continue;
      out.push({ object: id, counter, count });
    }
  }
  return out;
}

/**
 * The words of each option, in order: "+1/+1 counter on Grizzly Bears (yours)", "charge counter on Giant Spider (opponent's)", told apart by a number and how many counters the
 * permanent has when two read alike (two permanents of one name that have the same kind of counter).
 */
export function counterPickLabels(
  state: GameState,
  seat: SeatId,
  picks: readonly CounterPickOption[],
): string[] {
  const base = picks.map((p) => {
    const obj = state.objects[p.object];
    const name = sourceInfo(state, p.object)?.name ?? 'a permanent';
    const whose = obj !== undefined && controllerOf(state, obj) === seat ? 'yours' : "opponent's";
    return `${p.counter} counter on ${name} (${whose})`;
  });
  const seen = new Map<string, number>();
  return base.map((label, i) => {
    const total = base.filter((b) => b === label).length;
    if (total === 1) return label;
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    return `${label} #${n}, ${picks[i]?.count ?? 0} on it`;
  });
}

/** Removes `count` counters of a kind from a permanent: the state and the event. */
function takeCounter(state: GameState, id: ObjectId, counter: string): GameState {
  const obj = state.objects[id];
  if (obj === undefined) return state;
  const left = (obj.counters[counter] ?? 0) - 1;
  const { [counter]: _gone, ...rest } = obj.counters;
  return patchObject(state, id, {
    counters: left > 0 ? { ...obj.counters, [counter]: left } : rest,
  });
}

/** Runs `counterPick` for the controller of the ability. */
export function runCounterPick(
  state: GameState,
  res: ResolutionContext,
  ins: CounterPick,
): StepOutcome {
  const finish = (): StepOutcome => ({
    ...done(state),
    // CR 608.2c: "the number of counters removed this way" and "if you do" read what was taken (a move takes one and puts it on: that is not a removal count).
    ...(ins.mode === 'remove' && ins.removed > 0
      ? { thisWay: { countersRemoved: ins.removed }, performed: 1 }
      : ins.mode === 'move' && ins.removed > 0
        ? { performed: 1 }
        : {}),
  });
  if (ins.left !== null && ins.left <= 0) return finish();
  const picks = counterPickOptions(state, ins);
  if (picks.length === 0) return finish();
  const mayStop = (ins.mode === 'remove' && ins.required !== true) || ins.anyNumber === true;
  if (ins.chosen === null) {
    // A move takes exactly one counter: with only one that can go, there is nothing to ask.
    const only = !mayStop && picks.length === 1 ? picks[0] : undefined;
    if (only === undefined) {
      const labels = counterPickLabels(state, res.controller, picks);
      const info = sourceInfo(state, res.source);
      return {
        state,
        events: [],
        front: [],
        needs: {
          kind: 'chooseOption',
          seat: res.controller,
          purpose: 'counterPick',
          options: mayStop ? [...labels, COUNTER_PICK_STOP] : labels,
          counterPicks: picks,
          source: res.object,
          sourceName: info?.name ?? '',
          sourceOracleText: info?.oracleText ?? '',
        },
      };
    }
    return takeOne(state, res, ins, only);
  }
  if (ins.chosen === COUNTER_PICK_STOP) return finish();
  const labels = counterPickLabels(state, res.controller, picks);
  const index = labels.indexOf(ins.chosen);
  const pick = picks[index];
  // An answer that no longer names a counter that can be taken (it cannot happen between the question and its answer): the player takes no more.
  if (pick === undefined) return finish();
  return takeOne(state, res, ins, pick);
}

/** Takes the one counter the player picked, and comes round again while the effect may take more. */
function takeOne(
  state: GameState,
  res: ResolutionContext,
  ins: CounterPick,
  pick: CounterPickOption,
): StepOutcome {
  const events: GameEvent[] = [
    { kind: 'counterRemoved', object: pick.object, counter: pick.counter, count: 1 },
  ];
  let next = takeCounter(state, pick.object, pick.counter);
  if (ins.mode === 'move' && ins.to !== null) {
    const to = next.objects[ins.to];
    if (to === undefined) return done(state);
    next = patchObject(next, ins.to, {
      counters: { ...to.counters, [pick.counter]: (to.counters[pick.counter] ?? 0) + 1 },
    });
    events.push({
      kind: 'counterAdded',
      object: ins.to,
      counter: pick.counter,
      count: 1,
      by: res.controller,
    });
  }
  const again: CounterPick = {
    ...ins,
    left: ins.left === null ? null : ins.left - 1,
    removed: ins.removed + 1,
    chosen: null,
  };
  return done(next, events, [again]);
}
