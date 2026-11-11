/**
 * Drag and drop, the pure part: which zones a dragged card or creature may be dropped on, what each
 * zone is called, and what a drop does. A drop never invents a rule: it ends in the reducers a
 * click uses (`clickOutcome`, `toggleAttacker`, `setAttackTarget`, `clickAttacker`), in the same
 * action a click sends (a flashback cast), or in an action followed by the answer to the target
 * question it raises (Equip and Auras, `attach-flow.ts`). A zone the decision does not offer is
 * simply absent, so an illegal drop cannot be expressed.
 */
import type { ObjectId, PendingDecision, SeatId } from '@commander-arena/engine';
import { type AttackPick, setAttackTarget, toggleAttacker } from '../decisions/attack';
import { clickAttacker } from '../decisions/block';
import { type Index, nameOf, seatLabel } from '../decisions/lookup';
import type { UiState } from '../decisions/ui-state';
import { priorityGesture } from './priority-drag';
import type { DragSource, DragSpec, DropResult, DropTarget, DropZone } from './types';

export type { DragSource, DragSpec, DropResult, DropTarget, DropZone } from './types';

const NONE: DropResult = { kind: 'none' };

/** A stable string for a zone: the DOM carries it as `data-drop-key`. */
export function zoneKey(target: DropTarget): string {
  switch (target.kind) {
    case 'battlefield':
    case 'stack':
      return target.kind;
    case 'seat':
      return `seat:${target.seat}`;
    case 'object':
      return `object:${target.id}`;
  }
}

/** The inverse of `zoneKey`; null for a string no zone produces. */
export function parseZoneKey(key: string): DropTarget | null {
  if (key === 'battlefield' || key === 'stack') return { kind: key };
  const [kind, rest] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  if (kind === 'seat' && /^\d+$/.test(rest)) return { kind: 'seat', seat: Number(rest) };
  if (kind === 'object' && /^o\d+$/.test(rest)) return { kind: 'object', id: rest as ObjectId };
  return null;
}

export function sameTarget(a: DropTarget, b: DropTarget): boolean {
  return zoneKey(a) === zoneKey(b);
}

export function accepts(spec: DragSpec | null, target: DropTarget): boolean {
  return spec?.zones.some((z) => sameTarget(z.target, target)) === true;
}

export function labelFor(spec: DragSpec | null, target: DropTarget): string | null {
  return spec?.zones.find((z) => sameTarget(z.target, target))?.label ?? null;
}

/**
 * The zones the object may be dropped on right now, or null when it may not be dragged at all.
 * `viewer` is the human seat, used only to word the labels.
 */
export function dragSpec(
  pending: PendingDecision,
  ui: UiState,
  index: Index,
  viewer: SeatId,
  id: ObjectId,
  source: DragSource,
): DragSpec | null {
  switch (pending.kind) {
    case 'priority':
      return priorityGesture(pending, index, viewer, id, source)?.spec ?? null;
    case 'declareAttackers': {
      if (source !== 'permanent') return null;
      const candidate = pending.candidates.find((c) => c.attacker === id);
      if (candidate === undefined) return null;
      const name = nameOf(index, id);
      const zones: DropZone[] = candidate.targets.map((t) =>
        t.kind === 'player'
          ? {
              target: { kind: 'seat', seat: t.seat },
              label: `Attack ${seatLabel(t.seat, viewer)}`,
            }
          : {
              target: { kind: 'object', id: t.object },
              label: `Attack ${nameOf(index, t.object)}`,
            },
      );
      if (ui.attacks.some((p) => p.attacker === id) && !pending.mustAttack.includes(id)) {
        zones.push({ target: { kind: 'battlefield' }, label: `Remove ${name} from the attack` });
      }
      return { zones };
    }
    case 'declareBlockers': {
      if (source !== 'permanent') return null;
      const candidate = pending.candidates.find((c) => c.blocker === id);
      if (candidate === undefined) return null;
      return {
        zones: candidate.canBlock.map((attacker) => ({
          target: { kind: 'object', id: attacker },
          label: `Block ${nameOf(index, attacker)}`,
        })),
      };
    }
    default:
      return null;
  }
}

/** What dropping `id` on `target` does. Anything the spec does not offer does nothing. */
export function resolveDrop(
  pending: PendingDecision,
  ui: UiState,
  index: Index,
  viewer: SeatId,
  id: ObjectId,
  source: DragSource,
  target: DropTarget,
): DropResult {
  if (!accepts(dragSpec(pending, ui, index, viewer, id, source), target)) return NONE;
  switch (pending.kind) {
    case 'priority':
      return priorityGesture(pending, index, viewer, id, source)?.drop(target) ?? NONE;
    case 'declareAttackers': {
      const candidates = pending.candidates;
      if (target.kind === 'battlefield') {
        // Back on your own battlefield: the click flow's "take it out of the attack".
        return { kind: 'ui', change: (u) => ({ ...u, attacks: removeAttacker(u.attacks, id) }) };
      }
      const attackTarget =
        target.kind === 'seat'
          ? ({ kind: 'player', seat: target.seat } as const)
          : target.kind === 'object'
            ? ({ kind: 'permanent', object: target.id } as const)
            : null;
      if (attackTarget === null) return NONE;
      return {
        kind: 'ui',
        change: (u) => ({
          ...u,
          attacks: u.attacks.some((p) => p.attacker === id)
            ? setAttackTarget(u.attacks, candidates, id, attackTarget)
            : toggleAttacker(u.attacks, candidates, id, attackTarget, pending.mustAttack),
        }),
      };
    }
    case 'declareBlockers': {
      if (target.kind !== 'object') return NONE;
      const attacker = target.id;
      const candidates = pending.candidates;
      // `clickAttacker` assigns the picked-up blocker, replacing an earlier block by it.
      return {
        kind: 'ui',
        change: (u) => ({
          ...u,
          block: clickAttacker(
            { ...u.block, blocker: id },
            candidates,
            attacker,
            pending.attackers,
          ),
        }),
      };
    }
    default:
      return NONE;
  }
}

function removeAttacker(picks: readonly AttackPick[], id: ObjectId): readonly AttackPick[] {
  return picks.filter((p) => p.attacker !== id);
}
