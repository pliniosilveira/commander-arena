/**
 * The mana pool (CR 106.4) holds typed mana objects with an optional spend restriction
 * (SPEC 17.1 A5; CR 106.6). Helpers here are pure: they return new arrays.
 */
import type { ManaColor, ManaObject, ManaRestriction } from './types';

/** What the mana is about to be spent on: a spell with these types, or an ability. */
export type SpendTarget =
  | {
      readonly types: readonly string[];
      readonly subtypes?: readonly string[];
      /**
       * D-991 (CR 609.4b): "mana of any type can be spent to cast that spell": any mana pays any mana symbol of the spell's cost, colored or colorless. The restriction
       * of the mana itself and the snow of {S} are not about its type and still apply.
       */
      readonly anyType?: true;
    }
  /** An activated ability; with `source` (D-151) the card types and subtypes of the permanent it belongs to. */
  | {
      readonly ability: true;
      readonly source?: { readonly types: readonly string[]; readonly subtypes: readonly string[] };
    };

export function emptyPool(): ManaObject[] {
  return [];
}

/** Add mana to a pool (CR 106.4). Returns a new array; neither input is mutated. */
export function addToPool(pool: readonly ManaObject[], mana: readonly ManaObject[]): ManaObject[] {
  return [...pool, ...mana];
}

/**
 * May mana with this restriction be spent on the target? CR 106.6 (mana spend restrictions).
 * A `spellTypes` restriction is met by a spell with at least one of the listed types and never
 * by an ability; an empty list therefore matches nothing. `abilitiesOnly` is met by abilities
 * only. No restriction always passes.
 */
export function restrictionAllows(
  restriction: ManaRestriction | null,
  target: SpendTarget,
): boolean {
  if (restriction === null) return true;
  const isAbility = 'ability' in target;
  if (restriction.kind === 'abilitiesOnly') return isAbility;
  if (isAbility) {
    // D-151: "... or activate abilities of Dragons": an ability of a permanent that matches the same card types and subtypes.
    if (restriction.kind !== 'spellMatch' || restriction.alsoAbilities !== true) return false;
    const source = 'source' in target ? target.source : undefined;
    return (
      source !== undefined &&
      (restriction.types === undefined ||
        source.types.some((t) => restriction.types?.includes(t) === true)) &&
      (restriction.subtypes === undefined ||
        source.subtypes.some((t) => restriction.subtypes?.includes(t) === true))
    );
  }
  if (restriction.kind === 'spellMatch') {
    // D-149: the spell is of one of the types and of one of the subtypes the restriction names (each only when it names any).
    const subtypes = 'subtypes' in target ? (target.subtypes ?? []) : [];
    return (
      (restriction.types === undefined ||
        target.types.some((t) => restriction.types?.includes(t) === true)) &&
      (restriction.subtypes === undefined ||
        subtypes.some((t) => restriction.subtypes?.includes(t) === true))
    );
  }
  return target.types.some((t) => restriction.types.includes(t));
}

/** Indices of pool mana that may be spent on the target. */
export function usablePoolIndices(pool: readonly ManaObject[], target: SpendTarget): number[] {
  const out: number[] = [];
  pool.forEach((m, i) => {
    if (restrictionAllows(m.restriction, target)) out.push(i);
  });
  return out;
}

/** Pool mana that may be spent on the target. */
export function usableMana(pool: readonly ManaObject[], target: SpendTarget): ManaObject[] {
  return pool.filter((m) => restrictionAllows(m.restriction, target));
}

/** Pool mana that carries a spend restriction (CR 106.6). */
export function restrictedMana(pool: readonly ManaObject[]): ManaObject[] {
  return pool.filter((m) => m.restriction !== null);
}

/** Count of mana per color or colorless in the pool. */
export function poolColorCounts(pool: readonly ManaObject[]): Record<ManaColor, number> {
  const counts: Record<ManaColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const m of pool) counts[m.color] += 1;
  return counts;
}
