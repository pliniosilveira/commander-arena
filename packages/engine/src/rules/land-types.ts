/**
 * Setting a land's basic land type (CR 305.6, 305.7, D-1402): "Target land becomes a Swamp until end of turn." (Zombie Trailblazer).
 *
 * - An object with the land card type and a basic land type has the intrinsic ability "{T}: Add [mana symbol]" (CR 305.6), whether or not its text box says so.
 *   A land the card prints with its types has it as a mana ability of its definition; one that gains the type from an effect gets it here.
 * - If an effect sets a land's subtype to one or more of the basic land types (a `setTypes` of `subtypes` that all are basic land types, not additive), the land
 *   no longer has its old land types, loses all abilities generated from its rules text, and gains the mana ability of each new basic land type (CR 305.7).
 *   It does not remove abilities other effects gave the land (CR 305.7: layer 6 grants come after), and it adds or removes no card type or supertype.
 * - A land that gains basic land types in addition to its own keeps its types and rules text and gains the mana abilities of the new types (CR 305.7).
 *
 * Layer 4 (`derive-layers.ts` `applyTypeLayer`) does the types; this file says what the abilities become, for `derive.ts` (layer 6), and which
 * permanents lose the abilities of their rules text, for `lost-abilities.ts` (their static abilities go, CR 305.7).
 */
import type { Ability } from '../ast/types';
import { BASIC_LAND_TYPES, type CardType, type Subtype } from '../characteristics';
import type { ObjectId } from '../ids';
import type { ContinuousEffect } from '../state/types';

/** Whether every subtype of the list is a basic land type (CR 305.6); an empty list is not. */
export function areBasicLandTypes(subtypes: readonly Subtype[] | undefined): boolean {
  return (
    subtypes !== undefined &&
    subtypes.length > 0 &&
    subtypes.every((s) => Object.hasOwn(BASIC_LAND_TYPES, s))
  );
}

/** CR 305.7: an effect that sets a land's subtype to basic land types and does not add to what the land has. */
export function setsBasicLandTypes(effect: ContinuousEffect): boolean {
  return (
    effect.change.kind === 'setTypes' &&
    effect.change.remove === undefined &&
    effect.change.additive !== true &&
    areBasicLandTypes(effect.change.subtypes)
  );
}

/** The objects the continuous effects set to basic land types (CR 305.7), by id. */
export function landTypeSetIds(effects: readonly ContinuousEffect[]): ReadonlySet<ObjectId> {
  const ids = new Set<ObjectId>();
  for (const e of effects) if (setsBasicLandTypes(e)) for (const id of e.objects) ids.add(id);
  return ids;
}

/**
 * The intrinsic mana abilities of CR 305.6 for the basic land types of `subtypes`, in the order they are listed: "{T}: Add {B}" for Swamp. Nothing for an object
 * that is not a land.
 */
export function intrinsicManaAbilities(
  types: readonly CardType[],
  subtypes: readonly Subtype[],
): Ability[] {
  if (!types.includes('land')) return [];
  const out: Ability[] = [];
  for (const subtype of subtypes) {
    const color = Object.hasOwn(BASIC_LAND_TYPES, subtype) ? BASIC_LAND_TYPES[subtype] : undefined;
    if (color === undefined) continue;
    out.push({
      kind: 'mana',
      cost: [{ kind: 'tap' }],
      production: { kind: 'fixed', mana: [color] },
    });
  }
  return out;
}

/** What CR 305.7 does to the abilities of one land. */
export interface LandTypeAbilities {
  /** The land lost all abilities generated from its rules text (an effect set its basic land types). */
  readonly dropsRulesText: boolean;
  /** The intrinsic mana abilities it gains, to be added after the abilities it keeps. */
  readonly gained: readonly Ability[];
}

const NOTHING: LandTypeAbilities = { dropsRulesText: false, gained: [] };

/**
 * The effect of CR 305.6 and 305.7 on a land whose type line was `printed` and is `now` after layer 4. `setsTypes` is whether one of the continuous effects on it set
 * its basic land types (`landTypeSetIds`). A land whose types were set has the intrinsic ability of every basic land type it has now; a land that only gained types has
 * the ones of the types it did not print.
 */
export function landTypeAbilities(
  printed: { readonly types: readonly CardType[]; readonly subtypes: readonly Subtype[] },
  now: { readonly types: readonly CardType[]; readonly subtypes: readonly Subtype[] },
  setsTypes: boolean,
): LandTypeAbilities {
  // CR 305.6: the land card type is needed, as it is now (an effect can take it away too).
  if (!now.types.includes('land')) return NOTHING;
  if (setsTypes && printed.types.includes('land')) {
    return { dropsRulesText: true, gained: intrinsicManaAbilities(now.types, now.subtypes) };
  }
  const added = now.subtypes.filter((s) => !printed.subtypes.includes(s));
  if (added.length === 0) return NOTHING;
  const gained = intrinsicManaAbilities(now.types, added);
  return gained.length === 0 ? NOTHING : { dropsRulesText: false, gained };
}
