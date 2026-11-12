/**
 * "If a triggered ability of a Shaman or another Wizard you control triggers, that ability triggers an additional time." and "If a triggered ability of
 * equipped creature triggers, that ability triggers an additional time." (D-220, CR 603.2d): the static abilities `doubleTriggers` of the permanents on the
 * battlefield. Each one whose subject is the source of a triggered ability that has triggered makes it trigger once more: an exact copy of the pending
 * trigger (the same event, so the same subject, player and damage; the targets of each are chosen as it goes on the stack, CR 603.3d). Two such permanents make
 * three triggers. Only the triggered abilities of permanents (an ability with an index among the abilities of its source): not a delayed ability, the
 * monarch's, the Ring's, a reflexive one or a state trigger.
 */
import { LOOK_BACK_TRIGGER_KINDS } from '../ast/features';
import type { StaticSubject } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import type { GameObject, GameState, PendingTrigger } from '../state/types';
import { controllerOf } from './control';
import { copiableValues } from './copiable';
import { derive } from './derive';
import { matchesFilter } from './select';
import { objectOrLki } from './source-info';

interface Doubler {
  readonly id: ObjectId;
  readonly controller: number;
  readonly subjects: readonly StaticSubject[];
}

/** The permanents on the battlefield with a `doubleTriggers` ability, as `derive` has them now. Empty for nearly every game (a cheap check first). */
function doublersOf(state: GameState): readonly Doubler[] {
  const out: Doubler[] = [];
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined) continue;
    const mayHave = copiableValues(state, obj).abilities.some(
      (a) => a.kind === 'static' && a.static.kind === 'doubleTriggers',
    );
    if (!mayHave) continue;
    const subjects = derive(state, obj).abilities.flatMap((a) =>
      a.kind === 'static' && a.static.kind === 'doubleTriggers' ? [a.static.subject] : [],
    );
    if (subjects.length > 0) out.push({ id, controller: controllerOf(state, obj), subjects });
  }
  return out;
}

function names(
  state: GameState,
  source: GameObject,
  doubler: Doubler,
  subject: StaticSubject,
): boolean {
  if (subject.kind === 'attached') {
    return state.objects[doubler.id]?.attachedTo === source.id;
  }
  if (subject.kind !== 'filter') return false;
  if (subject.other === true && source.id === doubler.id) return false;
  return matchesFilter(
    state,
    source,
    { ...subject.filter, zone: 'battlefield' },
    { controller: doubler.controller, source: doubler.id },
  );
}

/**
 * The permanents that left the battlefield in `events` and had a `doubleTriggers` ability as they left, from their last-known information (CR 603.10a):
 * a "leaves the battlefield" or "dies" ability looks back in time, and so does the doubling of it (a Wizard that dies together with the permanent that
 * doubles it still has its ability triggered an additional time).
 */
function departedDoublers(state: GameState, events: readonly GameEvent[]): readonly Doubler[] {
  const out: Doubler[] = [];
  for (const event of events) {
    // D-277 (CR 712.21): one melded permanent leaves; the second card's event is not another permanent.
    if (
      event.kind !== 'zoneChanged' ||
      event.fromZone !== 'battlefield' ||
      event.component === true
    )
      continue;
    const known = state.lki[event.from];
    if (known === undefined) continue;
    const subjects = known.abilities.flatMap((a) =>
      a.kind === 'static' && a.static.kind === 'doubleTriggers' ? [a.static.subject] : [],
    );
    if (subjects.length > 0) {
      out.push({ id: event.from, controller: known.object.controller, subjects }); // stored controller: frozen with the effective one as it left
    }
  }
  return out;
}

/**
 * The triggers found, with one more copy of each for every permanent whose `doubleTriggers` names its source (CR 603.2d). `events` are the events they were
 * found from: for an ability that looks back in time the permanents that left in them count too.
 */
export function withDoubledTriggers(
  state: GameState,
  found: readonly PendingTrigger[],
  events: readonly GameEvent[] = [],
): readonly PendingTrigger[] {
  if (found.length === 0) return found;
  const present = doublersOf(state);
  const departed = departedDoublers(state, events);
  if (present.length === 0 && departed.length === 0) return found;
  const out: PendingTrigger[] = [];
  for (const trigger of found) {
    out.push(trigger);
    const source = trigger.source === null ? null : objectOrLki(state, trigger.source);
    if (source === null || trigger.abilityIndex < 0 || trigger.ability.kind !== 'triggered') {
      continue;
    }
    const lookBack = LOOK_BACK_TRIGGER_KINDS.includes(trigger.ability.trigger.kind);
    const doublers = lookBack ? [...present, ...departed] : present;
    for (const doubler of doublers) {
      if (doubler.subjects.some((subject) => names(state, source, doubler, subject))) {
        out.push(trigger);
      }
    }
  }
  return out;
}
