/**
 * Mana (CR 106). The pool holds typed mana objects with a spend restriction (SPEC 17.1 A5,
 * D-005). Mana empties at the end of each step and phase (CR 106.4, 500.4).
 */
import type { Color } from '../characteristics';
import type { ObjectId } from '../ids';

export type ManaColor = Color | 'C';

/**
 * A mana symbol in a cost, as written between braces (CR 107.4): "W", "U", "B", "R", "G", "C",
 * a generic number "2", "X", hybrid "W/U", monocolored hybrid "2/W", Phyrexian "W/P", snow "S".
 * Costs that are not mana (tap, untap, life, sacrifice, ...) are modelled as Cost, not here.
 */
export type ManaSymbol = string;

export type ManaRestriction =
  /** May be spent only on spells of these types (for example Treasure has none; a Cave has land). */
  | { readonly kind: 'spellTypes'; readonly types: readonly string[] }
  /** May be spent only on activated abilities. */
  | { readonly kind: 'abilitiesOnly' }
  /**
   * May be spent only on spells (never on abilities) that match (CR 106.6; D-149: "Spend this mana only to cast an Angel spell"): the spell
   * has at least one of the card types listed (when `types` is given) and at least one of the subtypes listed (when `subtypes` is given).
   */
  | {
      readonly kind: 'spellMatch';
      readonly types?: readonly string[];
      readonly subtypes?: readonly string[];
      /**
       * D-151: "Spend this mana only to cast Dragon spells or activate abilities of Dragons": the mana may also pay for an activated ability of a permanent that
       * has at least one of the card types listed (when `types` is given) and at least one of the subtypes listed (when `subtypes` is given).
       */
      readonly alsoAbilities?: true;
    };

/**
 * What mana does when it is spent (D-151): "If that mana is spent on a Dragon creature spell, it gains haste until end of turn". The mana carries it
 * from the ability that made it; if mana with it is spent on a spell that matches, the spell, if it becomes a permanent, has haste until end of turn.
 */
export interface ManaRider {
  /**
   * `haste`: the spell's permanent has haste until end of turn. `scry`: its controller scries `count` (a triggered ability of `source`, group 4 of the Vraska deck).
   * `copy` (D-328): a triggered ability of `source` copies the spell (`newTargets`: whether its controller may choose new targets for the copy).
   */
  readonly kind: 'haste' | 'scry' | 'copy';
  readonly types?: readonly string[];
  /** D-328: "a red instant or sorcery spell": the spell has one of these colors (`W`, `U`, `B`, `R`, `G`). */
  readonly colors?: readonly string[];
  /** The copy rider (D-328): "you may choose new targets for the copy" (`may`) or "copy that spell" (`no`). */
  readonly newTargets?: 'may' | 'no';
  readonly subtypes?: readonly string[];
  /** "...a creature spell that shares a creature type with your commander": the spell has a creature type one of the caster's commanders has (CR 903.3). */
  readonly sharesTypeWithCommander?: true;
  /** "...to cast your commander" (D-229): the spell is a card its caster designated as a commander (CR 903.3). */
  readonly commander?: true;
  /** The scry rider: how many (D-229: `commanderCasts`, X is the times the commander cast has been cast from the command zone), and the permanent whose ability it is. */
  readonly count?: number;
  readonly countCommanderCasts?: true;
  readonly source?: ObjectId;
}

export interface ManaObject {
  readonly color: ManaColor;
  readonly snow: boolean;
  /** The permanent or spell that produced it; needed for "mana from a Treasure" style effects. */
  readonly source: ObjectId;
  readonly restriction: ManaRestriction | null;
  /** What it does when spent (D-151). Absent for most mana. */
  readonly rider?: ManaRider;
  /**
   * The card types of the permanent that made it, as they were when it was made (D-183: "mana from an artifact source spent to cast it"; a
   * Treasure is sacrificed to make its mana, so the permanent is gone when the mana is spent). Absent when unknown (mana a test adds).
   */
  readonly sourceTypes?: readonly string[];
}

/** A parsed mana cost: how many of each colored symbol, generic, and the special symbols. */
export interface ManaCost {
  readonly generic: number;
  readonly x: number;
  readonly colored: Readonly<Record<ManaColor, number>>;
  readonly snow: number;
  /** Hybrid symbols, each a set of alternatives. "2/W" is { generic: 2 } or "W". */
  readonly hybrid: readonly (readonly HybridOption[])[];
  readonly phyrexian: readonly Color[];
}

export type HybridOption = { readonly color: ManaColor } | { readonly generic: number };

export const EMPTY_MANA_COST: ManaCost = {
  generic: 0,
  x: 0,
  colored: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
  snow: 0,
  hybrid: [],
  phyrexian: [],
};
