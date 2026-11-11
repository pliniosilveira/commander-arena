import { CREATURE_TYPES, type ObjectView, type StepId } from '@commander-arena/engine';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const CREATURE_TYPE_SET: ReadonlySet<string> = new Set(CREATURE_TYPES);

/** What a changeling's subtypes read as: its list holds every creature type (CR 702.73a, 205.3m). */
export const EVERY_CREATURE_TYPE = 'Every creature type';

/**
 * True when the subtypes hold every creature type of CR 205.3m: a changeling (CR 702.73a) in any zone.
 * A changeling that a later effect gave other types in layer 4 ("becomes a Frog") has fewer and is
 * not this: it reads as the types it has.
 */
export function hasEveryCreatureType(o: Pick<ObjectView, 'subtypes'>): boolean {
  if (o.subtypes.length < CREATURE_TYPES.length) return false;
  const have = new Set<string>(o.subtypes);
  return CREATURE_TYPES.every((t) => have.has(t));
}

/**
 * The subtypes to print: all of them, except that a changeling's roughly 300 creature types are
 * never listed. They read "Every creature type", after any subtype that is not a creature type
 * (an Equipment changeling).
 */
export function subtypeWords(o: Pick<ObjectView, 'subtypes'>): string[] {
  if (!hasEveryCreatureType(o)) return [...o.subtypes];
  return [...o.subtypes.filter((t) => !CREATURE_TYPE_SET.has(t)), EVERY_CREATURE_TYPE];
}

/** "Legendary Creature — Dog Soldier", as printed on a card; "Creature — Every creature type". */
export function typeLine(o: Pick<ObjectView, 'supertypes' | 'types' | 'subtypes'>): string {
  const left = [...o.supertypes, ...o.types].map(cap).join(' ');
  const subtypes = subtypeWords(o);
  return subtypes.length > 0 ? `${left} — ${subtypes.join(' ')}` : left;
}

/**
 * "kicked" for a spell kicked once (Kicker, or Multikicker paid once), "kicked 3 times" for
 * Multikicker (CR 702.33c); null when it was not kicked. From `ObjectView.kicked` and `kicks`.
 */
export function kickedWords(o: Pick<ObjectView, 'kicked' | 'kicks'>): string | null {
  if (o.kicks !== undefined && o.kicks > 1) return `kicked ${o.kicks} times`;
  return o.kicked === true || o.kicks !== undefined ? 'kicked' : null;
}

/** "replicated 2 times" for a spell whose replicate cost was paid (CR 702.56a, D-129); null when it was not. */
export function replicatedWords(o: Pick<ObjectView, 'replicated'>): string | null {
  if (o.replicated === undefined || o.replicated < 1) return null;
  return o.replicated === 1 ? 'replicated once' : `replicated ${o.replicated} times`;
}

export const STEP_LABELS: Readonly<Record<StepId, string>> = {
  untap: 'Untap',
  upkeep: 'Upkeep',
  draw: 'Draw',
  precombatMain: 'Main 1',
  beginningOfCombat: 'Begin combat',
  declareAttackers: 'Attackers',
  declareBlockers: 'Blockers',
  firstStrikeDamage: 'First strike',
  combatDamage: 'Damage',
  endOfCombat: 'End combat',
  postcombatMain: 'Main 2',
  end: 'End step',
  cleanup: 'Cleanup',
};
