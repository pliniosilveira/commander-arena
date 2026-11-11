/**
 * A target slot of two zones (D-931, CR 115.1): "up to three other target creatures from the battlefield and/or creature cards from graveyards". The engine runs
 * such a slot only for `exile`, which moves each target from the zone it is in; every other effect would have to say what it does to a card in a graveyard, so a
 * slot of this kind that any other effect names is refused here, never guessed.
 */
import type { Effect, TargetSpec } from './types';
import { type AstIssue, issue } from './validate-base';

/** How many `{ kind: 'target', id }` references the effect holds that are not the `objects` of an `exile` of that same slot. */
function strayReferences(node: unknown, id: string): number {
  if (Array.isArray(node)) return node.reduce((n: number, x) => n + strayReferences(x, id), 0);
  if (node === null || typeof node !== 'object') return 0;
  const o = node as Record<string, unknown>;
  if (o.kind === 'target' && o.id === id) return 1;
  const objects = o.objects as Record<string, unknown> | null | undefined;
  const exiled =
    o.kind === 'exile' &&
    typeof objects === 'object' &&
    objects !== null &&
    objects.kind === 'target' &&
    objects.id === id;
  let count = 0;
  for (const [key, value] of Object.entries(o)) {
    if (exiled && key === 'objects') continue;
    count += strayReferences(value, id);
  }
  return count;
}

export function checkCrossZoneSlots(
  specs: readonly TargetSpec[] | undefined,
  effect: Effect | undefined,
  modal: boolean,
  path: string,
  out: AstIssue[],
): void {
  for (const [i, spec] of (specs ?? []).entries()) {
    if (spec?.what?.kind !== 'objectOrGraveyardCard') continue;
    if (modal || strayReferences(effect ?? null, spec.id) > 0) {
      issue(
        out,
        `${path}.targets[${i}]`,
        'a target of two zones (the battlefield and graveyards) is read only by exile, in an ability with no modes: another effect names it',
      );
    }
  }
}
