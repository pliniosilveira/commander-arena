/**
 * The v2 diagnostics of a dropped ability in plain words (SPEC A30, D-064), so a player can tell a
 * grammar gap from an engine gap. Pure strings, tested without a DOM. The meaning is in the words,
 * never in a color.
 */
import type { UnparsedAbility } from '@commander-arena/cards';
import { type FeatureRef, splitFeatureRef } from '@commander-arena/engine';

/** A `FeatureRef` as "<dimension>: <value>", for example `effect:createToken` -> "effect: createToken". */
export function formatFeature(ref: FeatureRef): string {
  const { dimension, value } = splitFeatureRef(ref);
  return `${dimension}: ${value}`;
}

/**
 * The headline of one diagnostic, or null for a schema 1 ability that carries no `reason` (a
 * cached report from before diagnostics v2); the caller then shows the schema 1 details only.
 */
export function reasonStatement(u: UnparsedAbility): string | null {
  switch (u.reason) {
    case 'unrecognised':
      return 'The grammar does not read this wording yet.';
    case 'notRunnable': {
      const needs = u.needs ?? [];
      return needs.length > 0
        ? `The grammar reads this, but the engine cannot run it yet: needs ${needs.map(formatFeature).join(', ')}.`
        : 'The grammar reads this, but the engine cannot run it yet.';
    }
    case 'unboundReference':
      return u.reference !== undefined && u.reference !== ''
        ? `The grammar could not tell what '${u.reference}' refers to.`
        : 'The grammar could not tell what a reference in this ability refers to.';
    default:
      return null;
  }
}

/** Secondary detail lines: the slot being read and the rules that matched before the stop. */
export function reasonDetails(u: UnparsedAbility): readonly string[] {
  const lines: string[] = [];
  if (u.slot !== undefined) lines.push(`Kind of phrase being read: ${u.slot}.`);
  if (u.recognised !== undefined && u.recognised.length > 0) {
    lines.push(`Rules that matched before it stopped: ${u.recognised.join(', ')}.`);
  }
  return lines;
}
