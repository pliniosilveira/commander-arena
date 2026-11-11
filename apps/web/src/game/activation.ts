/**
 * Which objects on the stack are activated abilities. The view marks any ability on the stack with
 * its source (`ObjectView.abilitySource`) but does not say whether it was triggered or activated,
 * so the page reads it from the log: an `abilityActivated` event names its stack object.
 */
import type { ObjectId } from '@commander-arena/engine';
import type { LogEntry } from './protocol';

export function activatedStackIds(log: readonly LogEntry[]): ReadonlySet<ObjectId> {
  const ids = new Set<ObjectId>();
  for (const entry of log) if (entry.activation !== undefined) ids.add(entry.activation);
  return ids;
}

/** "Activated ability" or "Triggered ability": the type line of an ability on the stack. */
export function abilityTypeLine(activated: boolean): string {
  return activated ? 'Activated ability' : 'Triggered ability';
}
