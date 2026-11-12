/**
 * A target slot of two zones (D-931, CR 115.1): "up to three other target creatures from the battlefield and/or creature cards from graveyards". The engine runs
 * such a slot only for `exile`, which moves each target from the zone it is in; every other effect would have to say what it does to a card in a graveyard, so a
 * slot of this kind that any other effect names is refused here, never guessed.
 */
import type { Ability, Effect } from './types';
import { type AstIssue, issue } from './validate-base';
import { filterSome } from './validate-parts';

type Triggered = Extract<Ability, { kind: 'triggered' }>;

/**
 * Whether the source of this triggered ability is on the battlefield when it is put on the stack and its targets are chosen, so that "other" (the source is not one of
 * the targets, CR 115.1, 115.2) leaves out the source from the battlefield half and the source cannot be a card of a graveyard. True for a permanent entering ("when this
 * enters"), an attack, and the steps of the turn; false for a trigger the source leaves the battlefield for ("dies", "leaves the battlefield": look-back triggers,
 * CR 603.10a, where the source is a card in a graveyard or another zone by then), for any other trigger, and for an ability that works from the graveyard.
 */
function sourceOnBattlefield(a: Triggered): boolean {
  if ((a as { functionsIn?: unknown }).functionsIn !== undefined) return false;
  const t = a.trigger;
  switch (t?.kind) {
    case 'entersBattlefield':
      return 'kind' in t.what && t.what.kind === 'this';
    case 'attacks':
    case 'upkeep':
    case 'endStep':
    case 'step':
      return true;
    default:
      return false;
  }
}

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
  ability: Triggered,
  effect: Effect | undefined,
  modal: boolean,
  path: string,
  out: AstIssue[],
): void {
  for (const [i, spec] of (ability.targets ?? []).entries()) {
    if (spec?.what?.kind !== 'objectOrGraveyardCard') continue;
    // "Other" is read for the battlefield half only (the card half has no `other`). If the source can be a card of a graveyard when the targets are chosen, that card
    // is a legal target the text excludes: refused, never guessed.
    if (
      spec.what.filter !== undefined &&
      filterSome(spec.what.filter, (f) => f.other === true) &&
      !sourceOnBattlefield(ability)
    ) {
      issue(
        out,
        `${path}.targets[${i}]`,
        'a target of two zones that says "other" is read only where the source is on the battlefield as the targets are chosen (enters, attacks, a step): on a dies or leaves trigger the source is a card of a graveyard and would be one of the targets',
      );
    }
    if (modal || strayReferences(effect ?? null, spec.id) > 0) {
      issue(
        out,
        `${path}.targets[${i}]`,
        'a target of two zones (the battlefield and graveyards) is read only by exile, in an ability with no modes: another effect names it',
      );
    }
  }
}
