/**
 * Saga cards (CR 714): lore counters and chapter abilities.
 *
 * A chapter ability is a triggered ability with the trigger `{ kind: 'chapter', from, to }`
 * (CR 714.2). What the rest of the engine does for a Saga:
 * - It enters with a lore counter on it (CR 714.3a, a replacement effect), through the same path as
 *   "enters with counters" (`enters.ts`, zones.ts, tokens.ts), so the counter is part of entering.
 * - As its controller's precombat main phase begins, that player puts a lore counter on each Saga
 *   they control with one or more chapter abilities (CR 714.3c); `addLoreCounters` is that
 *   turn-based action, run by `flow.ts`. It does not use the stack.
 * - A chapter ability triggers when lore counters are put on the Saga and their number was less than
 *   N and became at least N (CR 714.2b); `chaptersReached` reads that off the events (triggers.ts).
 * - It is sacrificed once its lore counters reach its final chapter number, unless it is the source of
 *   a chapter ability that has triggered and not yet left the stack (CR 714.4, 704.5s); `sagaIsDone`
 *   is that state-based action's test (sba.ts).
 *
 * Read ahead (CR 702.155, D-151): the Saga chooses its first chapter as it enters (`enters.ts`) and the turn it entered only the chapter its lore
 * counters say can trigger (`readAheadBlocks`).
 *
 * Not yet: abilities that add or remove lore counters beyond the ordinary counter effects; see docs/ROADMAP.md.
 */
import type { Ability } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import { patchObject } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { blocks, counterBlockers } from './counter-prevention';
import { objectOrLki } from './source-info';

/** The name of the counters a Saga uses (CR 714.3). */
export const LORE = 'lore';

/** Whether the subtypes make a permanent a Saga (CR 714.1). */
export function isSaga(subtypes: readonly string[]): boolean {
  return subtypes.includes('Saga');
}

/**
 * A Saga's final chapter number: the greatest chapter number among its chapter abilities, or 0 when
 * it has none (CR 714.2d). Read from the abilities the permanent has now, so a Saga that lost its
 * abilities has none and is never sacrificed for its chapters.
 */
export function finalChapterOf(abilities: readonly Ability[]): number {
  let final = 0;
  for (const a of abilities) {
    if (a.kind === 'triggered' && a.trigger.kind === 'chapter') {
      final = Math.max(final, a.trigger.to);
    }
  }
  return final;
}

/**
 * CR 714.3c: as the active player's precombat main phase begins, they put a lore counter on each
 * Saga they control that has one or more chapter abilities, in timestamp order. The events go to
 * the trigger scan like any other counter being added.
 */
export function addLoreCounters(
  input: GameState,
  abilitiesOf: (obj: GameObject) => { subtypes: readonly string[]; abilities: readonly Ability[] },
): { state: GameState; events: GameEvent[] } {
  let state = input;
  const events: GameEvent[] = [];
  const sagas = input.battlefield
    .map((id) => input.objects[id])
    .filter(
      (o): o is GameObject => o !== undefined && controllerOf(state, o) === input.turn.activeSeat,
    )
    .sort((a, b) => a.timestamp - b.timestamp);
  const blockers = counterBlockers(input);
  for (const obj of sagas) {
    const d = abilitiesOf(obj);
    if (!isSaga(d.subtypes) || finalChapterOf(d.abilities) === 0) continue;
    // D-380 (CR 122.6, 101.2): a Saga that can't have lore counters gets none, so no chapter ability triggers.
    if (blocks(input, blockers, obj, LORE)) continue;
    state = patchObject(state, obj.id, {
      counters: { ...obj.counters, [LORE]: (obj.counters[LORE] ?? 0) + 1 },
    });
    events.push({ kind: 'counterAdded', object: obj.id, counter: LORE, count: 1 });
  }
  return { state, events };
}

/**
 * The lore counter numbers a `counterAdded` event of `events` took the object from and to: the
 * counters it had just before the event, and just after it (CR 714.2b). The state holds the count
 * after the whole batch, so the counters added or removed by this event and the later ones in the
 * batch are taken off to find the count before. Null for any other event.
 */
export function loreChange(
  state: GameState,
  events: readonly GameEvent[],
  index: number,
): { readonly before: number; readonly after: number } | null {
  const event = events[index];
  if (event?.kind !== 'counterAdded' || event.counter !== LORE) return null;
  let later = 0;
  for (const e of events.slice(index)) {
    if ((e.kind === 'counterAdded' || e.kind === 'counterRemoved') && e.counter === LORE) {
      if (e.object === event.object) later += e.kind === 'counterAdded' ? e.count : -e.count;
    }
  }
  const now = objectOrLki(state, event.object)?.counters[LORE] ?? 0;
  return { before: now - later, after: now - later + event.count };
}

/** The chapter numbers a change from `before` to `after` lore counters reaches within `from..to`. */
export function chaptersReached(
  change: { readonly before: number; readonly after: number },
  from: number,
  to: number,
): number[] {
  const reached: number[] = [];
  for (let n = Math.max(from, change.before + 1); n <= Math.min(to, change.after); n += 1) {
    reached.push(n);
  }
  return reached;
}

/**
 * CR 702.155a (D-151): "Chapter abilities of this Saga can't trigger the turn it entered the battlefield unless it has exactly the number of
 * lore counters on it specified in the chapter symbol of that ability." True when the Saga has read ahead, entered this turn, and its lore
 * counters are not `chapter`.
 */
export function readAheadBlocks(
  state: GameState,
  saga: ObjectId,
  chapter: number,
  abilities: readonly Ability[],
): boolean {
  const obj = state.objects[saga];
  if (obj === undefined || !state.turnLog.entered.some((e) => e.object === saga)) return false;
  if (!hasReadAhead(abilities)) return false;
  return (obj.counters[LORE] ?? 0) !== chapter;
}

/** Whether these abilities include Read ahead (CR 702.155, D-151). */
export function hasReadAhead(abilities: readonly Ability[]): boolean {
  return abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'readAhead');
}

/** Whether the Saga is the source of a chapter ability that has triggered and not left the stack. */
function hasChapterAbilityWaiting(state: GameState, saga: GameObject): boolean {
  // Waiting to go on the stack: in the list, or in the queue of a seat whose targets are being chosen.
  const waiting = [...state.pendingTriggers, ...(state.triggering?.queue ?? [])];
  if (waiting.some((t) => t.source === saga.id && t.ability.trigger.kind === 'chapter')) {
    return true;
  }
  return state.stack.some((id) => {
    const data = state.objects[id]?.stack;
    return (
      data?.kind === 'ability' &&
      data.source === saga.id &&
      data.ability?.kind === 'triggered' &&
      data.ability.trigger.kind === 'chapter'
    );
  });
}

/**
 * CR 714.4, 704.5s: a Saga with one or more chapter abilities whose lore counters are at least its
 * final chapter number, and that is not the source of a chapter ability that has triggered but not
 * yet left the stack, is sacrificed by its controller.
 */
export function sagaIsDone(
  state: GameState,
  saga: GameObject,
  derived: { subtypes: readonly string[]; abilities: readonly Ability[] },
): boolean {
  if (!isSaga(derived.subtypes)) return false;
  const final = finalChapterOf(derived.abilities);
  if (final === 0 || (saga.counters[LORE] ?? 0) < final) return false;
  return !hasChapterAbilityWaiting(state, saga);
}
