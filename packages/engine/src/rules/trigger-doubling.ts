/**
 * "If a triggered ability of a Shaman or another Wizard you control triggers, that ability triggers an additional time." and "If a triggered ability of
 * equipped creature triggers, that ability triggers an additional time." (D-220, CR 603.2d): the static abilities `doubleTriggers` of the permanents on the
 * battlefield. Each one whose subject is the source of a triggered ability that has triggered makes it trigger once more: an exact copy of the pending
 * trigger (the same event, so the same subject, player and damage; the targets of each are chosen as it goes on the stack, CR 603.3d). Two such permanents make
 * three triggers. Only the triggered abilities of permanents (an ability with an index among the abilities of its source): not a delayed ability, the
 * monarch's, the Ring's, a reflexive one or a state trigger.
 *
 * With a `cause` (D-980, "If you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you control to trigger, that ability
 * triggers an additional time", CR 603.2d) only the triggers the event named causes count: the ability is a `castSpell` ability (it triggered on the cast of a
 * spell, or on the copy of one when it says "or copy"), the player who cast or copied is the controller of the doubler, and the spell is one the cause's filter
 * names. A trigger the spell brings about another way (a permanent becoming its target, a creature spell entering) has another event and is not doubled.
 */
import { LOOK_BACK_TRIGGER_KINDS } from '../ast/features';
import type { Ability, StaticEffect, StaticSubject } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import type { GameObject, GameState, PendingTrigger } from '../state/types';
import { controllerOf } from './control';
import { copiableValues } from './copiable';
import { derive } from './derive';
import { matchesFilter } from './select';
import { objectOrLki } from './source-info';

type DoubleTriggers = Extract<StaticEffect, { kind: 'doubleTriggers' }>;

/** One `doubleTriggers` ability: whose triggers it names, and the cause that must have triggered them when it has one. */
interface Doubling {
  readonly subject: StaticSubject;
  readonly cause: DoubleTriggers['cause'];
}

interface Doubler {
  readonly id: ObjectId;
  readonly controller: number;
  readonly doublings: readonly Doubling[];
}

function doublingsOf(abilities: readonly Ability[]): readonly Doubling[] {
  return abilities.flatMap((a) =>
    a.kind === 'static' && a.static.kind === 'doubleTriggers'
      ? [{ subject: a.static.subject, cause: a.static.cause }]
      : [],
  );
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
    const doublings = doublingsOf(derive(state, obj).abilities);
    if (doublings.length > 0) out.push({ id, controller: controllerOf(state, obj), doublings });
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
 * Whether the event that made `trigger` trigger is the one `cause` names (CR 603.2d): a cast trigger (`castSpell`) of a spell, or of a copy put onto the stack, that the
 * controller of the doubler cast or copied ("you casting or copying") and that the cause's filter names, read as the spell is on the stack or last was (CR 113.7a).
 */
function causedBy(
  state: GameState,
  trigger: PendingTrigger,
  doubler: Doubler,
  cause: NonNullable<DoubleTriggers['cause']>,
): boolean {
  if (trigger.ability.kind !== 'triggered' || trigger.ability.trigger.kind !== 'castSpell') {
    return false;
  }
  if (trigger.player !== doubler.controller || trigger.subject === null) return false;
  const spell = objectOrLki(state, trigger.subject);
  if (spell === null) return false;
  return matchesFilter(state, spell, cause.spell, {
    controller: doubler.controller,
    source: doubler.id,
  });
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
    const doublings = doublingsOf(known.abilities);
    if (doublings.length > 0) {
      out.push({ id: event.from, controller: known.object.controller, doublings }); // stored controller: frozen with the effective one as it left
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
      const doubles = doubler.doublings.some(
        ({ subject, cause }) =>
          names(state, source, doubler, subject) &&
          (cause === undefined || causedBy(state, trigger, doubler, cause)),
      );
      if (doubles) out.push(trigger);
    }
  }
  return out;
}
