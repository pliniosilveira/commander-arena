/**
 * orderTriggers (CR 603.3b). The engine's answer lists indices in the order the abilities are put
 * on the stack: the first goes on first and so resolves last. The page shows the order the
 * player cares about instead, the order of resolution, top first like the stack panel. This file
 * keeps that "resolution order" and converts it into the engine's order when the answer is sent.
 */
import type { OrderTriggersDecision } from '@commander-arena/engine';

/** Indices into `decision.triggers`, in the order the abilities will resolve. */
export type ResolveOrder = readonly number[];

/**
 * The engine's default order (the order they go on the stack) as a resolution order: the last one
 * put on the stack resolves first.
 */
export function defaultResolveOrder(
  decision: Pick<OrderTriggersDecision, 'triggers'>,
): ResolveOrder {
  return decision.triggers.map((_, i) => i).reverse();
}

/** Moves the entry at `position` one place up (-1) or down (+1); stays put at the ends. */
export function moveTrigger(order: ResolveOrder, position: number, step: -1 | 1): ResolveOrder {
  const target = position + step;
  const a = order[position];
  const b = order[target];
  if (a === undefined || b === undefined) return order;
  return order.map((value, i) => (i === position ? b : i === target ? a : value));
}

/** The `orderTriggers` answer for a resolution order: put the last-resolving one on the stack first. */
export function engineOrder(order: ResolveOrder): readonly number[] {
  return [...order].reverse();
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

/** "Resolves first", "Resolves second", ..., "Resolves last" for the final row of a list. */
export function resolvesLabel(position: number, total: number): string {
  if (position === total - 1 && total > 1) return 'Resolves last';
  return `Resolves ${ORDINALS[position] ?? `no. ${position + 1}`}`;
}
