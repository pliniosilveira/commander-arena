/**
 * What the payment planner (payment.ts) and its helper for mana-cost abilities (costed.ts) share:
 * the demand dimensions of the search and the numeric order of object ids.
 */
import type { ObjectId } from '../ids';
import type { SpendTarget } from './pool';
import type { ManaColor, ManaCost, ManaObject, ManaRestriction } from './types';

// Demand dimensions: the six colors, then snow, then generic.
export const COLOR_DIMS: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C'];
export const SNOW_DIM = 6;
export const GENERIC_DIM = 7;
export const DIMS = 8;
// Activation-cost dimensions of the costed mana abilities in use: the six colors, then generic.
// Only mana from sources and pool without a mana cost can pay them.
export const ACT_BASE = DIMS;
export const ACT_GENERIC = ACT_BASE + COLOR_DIMS.length;
export const TOTAL_DIMS = ACT_GENERIC + 1;
/** Most costed sources considered at once (2^6 subsets); the lowest object ids are kept. */
export const MAX_COSTED = 6;

/** Compare object ids numerically (o2 before o10) without locale-dependent APIs. */
export function compareObjectIds(a: ObjectId, b: ObjectId): number {
  const na = Number(a.slice(1));
  const nb = Number(b.slice(1));
  if (na !== nb) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface PaymentSource {
  readonly object: ObjectId;
  readonly abilityIndex: number;
  /** Each inner array is one possible outcome: Forest [["G"]], Command Tower [["W"],["U"]]. */
  readonly produces: readonly (readonly ManaColor[])[];
  readonly tier: 'land' | 'creature' | 'artifact' | 'sacrifice';
  readonly snow: boolean;
  readonly restriction: ManaRestriction | null;
  /** The card types of the permanent that makes the mana (D-183): the mana it makes carries them. */
  readonly types?: readonly string[];
  /**
   * The mana cost of activating this ability (CR 605.1a), when it has one: only generic and
   * single-color symbols are planned (anything else makes the source unusable here). The cost is
   * paid by the pool or by sources with no mana cost (see the one-level rule above).
   */
  readonly cost?: ManaCost;
  /** The ability does something besides making mana (damage to its controller): a mild penalty. */
  readonly extraEffect?: boolean;
  /**
   * The life its controller loses when it is activated: the life it costs ("{T}, Pay 1 life: Add one
   * mana of any color", CR 119.4, 605.3) and the damage it deals to them (a pain land). A plan never
   * loses more life in all, with the life paid for Phyrexian mana, than `lifeAvailable`.
   */
  readonly lifeLoss?: number;
  /**
   * The mana this source makes can pay generic mana only, never a colored symbol or snow ("tap an untapped
   * artifact rather than pay that generic mana", Improvise, CR 702.126a; a colorless creature's convoke,
   * CR 702.51a; a card exiled for Delve, CR 702.66a; D-120). It also never pays the activation cost of a
   * mana ability.
   */
  readonly genericOnly?: true;
}

export interface PaymentRequest {
  readonly cost: ManaCost;
  /** Value chosen for each {X} in the cost (CR 107.3a). */
  readonly x: number;
  readonly pool: readonly ManaObject[];
  readonly sources: readonly PaymentSource[];
  /**
   * Life the plan may lose: Phyrexian mana (CR 107.4f) and the `lifeLoss` of the sources it taps.
   * A caller that never wants to pay itself to 0 passes the life total minus 1.
   */
  readonly lifeAvailable: number;
  readonly spell: SpendTarget;
  /** Colors to keep available for other plays; a preference only, never a reason to fail. */
  readonly reserve?: readonly ManaColor[];
}
