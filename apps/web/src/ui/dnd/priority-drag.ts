/**
 * What can be dragged at priority (CR 117) and what a drop does:
 *
 * - A hand or command-zone card goes to the battlefield or the stack: the click's cast or play. A
 *   card with several faces to cast or play (split, Adventure, modal double-faced) has the same
 *   two zones, and the drop opens the face chooser like the click does.
 * - A graveyard card the engine offers with flashback (CR 702.34a) goes there too, and casts with
 *   its `alternative`; the zone is worded "Flashback {cost}".
 * - An Equipment (CR 702.6a) goes onto a creature: start Equip, then answer its target.
 * - An Aura card (CR 303.4a) goes onto a permanent it may enchant: cast it, then answer the
 *   `enchant` slot. Only those permanents are zones; when none can be read from the view the Aura
 *   falls back to the plain cast zones and the engine's target question is answered by clicking.
 *
 * The pair "start, then answer the target" is run by `attach-flow.ts`; this file only says which
 * zones exist and which action starts it. Every action is one the click path sends too.
 */
import type {
  Action,
  ObjectId,
  ObjectView,
  PriorityDecision,
  PriorityOption,
  SeatId,
} from '@commander-arena/engine';
import { castAction, castLabel } from '../decisions/flashback';
import { castPlayOptions } from '../decisions/layouts';
import { type Index, nameOf } from '../decisions/lookup';
import { enchantFilter, equipFilter, hostCandidates } from './hosts';
import type { DragSource, DragSpec, DropResult, DropTarget, DropZone } from './types';

type CastOption = Extract<PriorityOption, { kind: 'castSpell' }>;

export interface Gesture {
  readonly spec: DragSpec;
  /** What dropping on `target` does; only the spec's zones get here. */
  drop(target: DropTarget): DropResult;
}

const NONE: DropResult = { kind: 'none' };

/** The battlefield and the stack: where a cast or a play is dropped. */
function playZones(label: string): readonly DropZone[] {
  return [
    { target: { kind: 'battlefield' }, label },
    { target: { kind: 'stack' }, label },
  ];
}

function hostZones(verb: string, hosts: readonly ObjectView[]): readonly DropZone[] {
  return hosts.map((h) => ({ target: { kind: 'object', id: h.id }, label: `${verb} ${h.name}` }));
}

const onBattlefield = (index: Index): ObjectView[] =>
  [...index.values()].filter((o) => o.zone === 'battlefield');

/** An Equipment's equip option: the drop on a creature starts it and the flow answers the target. */
function equipGesture(
  pending: PriorityDecision,
  index: Index,
  viewer: SeatId,
  id: ObjectId,
): Gesture | null {
  const card = index.get(id);
  for (const o of pending.options) {
    if (o.kind !== 'activate' || o.object !== id) continue;
    const filter = equipFilter(card, o.abilityIndex);
    if (filter === null) continue;
    const skip = card?.attachedTo === undefined ? [id] : [id, card.attachedTo];
    const hosts = hostCandidates(onBattlefield(index), filter, viewer, skip);
    if (hosts.length === 0) return null;
    const start: Action = { kind: 'activate', object: id, abilityIndex: o.abilityIndex };
    return {
      spec: { zones: hostZones('Equip', hosts) },
      drop: (t) => (t.kind === 'object' ? { kind: 'attach', start, host: t.id } : NONE),
    };
  }
  return null;
}

/** An Aura in hand: cast onto a permanent it may enchant. */
function auraGesture(
  option: CastOption,
  index: Index,
  viewer: SeatId,
  id: ObjectId,
): Gesture | null {
  const card = index.get(id);
  if (option.alternative !== undefined || card?.subtypes.includes('Aura') !== true) return null;
  const hosts = hostCandidates(onBattlefield(index), enchantFilter(card), viewer, [id]);
  if (hosts.length === 0) return null;
  const start = castAction(option);
  return {
    spec: { zones: hostZones('Enchant', hosts) },
    drop: (t) => (t.kind === 'object' ? { kind: 'attach', start, host: t.id } : NONE),
  };
}

/** The gesture for dragging `id` at priority, or null when it may not be dragged. */
export function priorityGesture(
  pending: PriorityDecision,
  index: Index,
  viewer: SeatId,
  id: ObjectId,
  source: DragSource,
): Gesture | null {
  if (source === 'permanent') return equipGesture(pending, index, viewer, id);
  const name = nameOf(index, id);
  const options = castPlayOptions(pending, id);
  if (options.length > 1) {
    // Which face is the click's question (the chooser), so the drop asks it too.
    const verb = options.some((o) => o.kind === 'castSpell') ? 'Cast' : 'Play';
    return { spec: { zones: playZones(`${verb} ${name}`) }, drop: () => ({ kind: 'click' }) };
  }
  // The same order `clickOutcome` uses: a spell first, then a land.
  const cast = pending.options.find(
    (o): o is CastOption => o.kind === 'castSpell' && o.object === id,
  );
  const play = pending.options.some((o) => o.kind === 'playLand' && o.object === id);
  if (cast === undefined && !play) return null;
  if (cast !== undefined) {
    const aura = auraGesture(cast, index, viewer, id);
    if (aura !== null) return aura;
  }
  if (cast?.alternative === 'flashback') {
    // The click would open a menu for a card with several options; the drop casts this one.
    const action = castAction(cast);
    return {
      spec: { zones: playZones(castLabel(cast, index.get(id), name)) },
      drop: () => ({ kind: 'act', action }),
    };
  }
  return {
    spec: { zones: playZones(cast === undefined ? `Play ${name}` : `Cast ${name}`) },
    drop: () => ({ kind: 'click' }),
  };
}
