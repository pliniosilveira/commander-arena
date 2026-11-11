/**
 * Card layouts with more than one face (CR 709, 712, 715): which faces can be cast or played, the
 * characteristics a card has in each zone, and the face a double-faced permanent transforms to.
 *
 *   split (CR 709)          either half is cast (CR 709.3); on the stack only that half exists
 *                           (CR 709.3b); in every other zone the card has both halves combined
 *                           (CR 709.4): both names, the combined mana cost, every type and ability.
 *   adventure (CR 715)      faces[0] is the card, faces[1] its Adventure. The Adventure exists only
 *                           on the stack (CR 715.3b, 715.4); everywhere else, and for a card cast
 *                           normally, the card has faces[0] only.
 *   modal_dfc (CR 712.3)    either face is cast or played as a land (CR 712.11b, 712.12); only the
 *                           front face exists outside the stack and the battlefield (CR 712.8a); the
 *                           face cast stays up on the battlefield (CR 712.13).
 *   transform (CR 712.2)    only the front face is cast (CR 712.11); it enters front face up (CR
 *                           712.13, 712.14) and `transform` flips it on the battlefield (CR 701.27).
 *
 * `GameObject.face` holds which face is up for a spell on the stack and a permanent on the
 * battlefield; it is 0 everywhere else, so a card that changes zone is its front face again.
 */

import type { CardDefinition, CardFace } from '../cards/definition';
import type { CardType } from '../characteristics';
import { COLORS, type Color, type Subtype, type Supertype } from '../characteristics';
import { definitionOf } from '../state/ops';
import type { CopiableValues, GameObject, GameState } from '../state/types';

/** The faces a player may choose to cast (or play as a land), as indexes into `def.faces`. */
export function castableFaces(def: CardDefinition): readonly number[] {
  switch (def.layout) {
    case 'split':
    case 'adventure':
    case 'modal_dfc':
      return def.faces.map((_, index) => index);
    default:
      return [0];
  }
}

/** Whether a player chooses a face when casting or playing the card (the options carry `face`). */
export function choosesFace(def: CardDefinition): boolean {
  return castableFaces(def).length > 1;
}

/** Whether `def` is a double-faced card that can transform (CR 712.9): not split, not adventure. */
export function isDoubleFaced(def: CardDefinition): boolean {
  return (def.layout === 'transform' || def.layout === 'modal_dfc') && def.faces.length === 2;
}

/** The object as if it were being cast (or played) with `face` up: the stack face, CR 712.11c. */
export function asFace(obj: GameObject, face: number): GameObject {
  return { ...obj, zone: 'stack', face };
}

function union<T>(lists: readonly (readonly T[])[]): T[] {
  return [...new Set(lists.flat())];
}

function orderedColors(faces: readonly CardFace[]): Color[] {
  const present = new Set<Color>(faces.flatMap((f) => f.colors));
  return COLORS.filter((c) => present.has(c));
}

/**
 * The values of a split card outside the stack (CR 709.4): `Name A // Name B`, the combined mana
 * cost (CR 709.4b: the mana value is the sum, the colors are those of both halves), every card
 * type and subtype of either half (CR 709.4c) and every ability. Spell halves have no power,
 * toughness, loyalty or defense.
 */
export function combinedValues(def: CardDefinition): CopiableValues {
  const faces = def.faces;
  const costs = faces.map((f) => f.manaCost);
  const manaCost = costs.every((c) => c === null) ? null : costs.flatMap((c) => c ?? []);
  return {
    characteristics: {
      name: faces.map((f) => f.name).join(' // '),
      manaCost,
      supertypes: union<Supertype>(faces.map((f) => f.supertypes)),
      types: union<CardType>(faces.map((f) => f.types)),
      subtypes: union<Subtype>(faces.map((f) => f.subtypes)),
      colors: orderedColors(faces),
      power: null,
      toughness: null,
      loyalty: null,
      defense: null,
      oracleText: faces.map((f) => f.oracleText).join('\n//\n'),
    },
    abilities: faces.flatMap((f) => f.abilities),
  };
}

/** Whether the object, in this zone, has the combined characteristics of a split card. */
export function hasCombinedFaces(def: CardDefinition, obj: GameObject): boolean {
  return def.layout === 'split' && obj.zone !== 'stack';
}

/**
 * The face of a double-faced permanent after it transforms (CR 701.27a), or null when nothing
 * happens: the card is not double-faced (CR 712.9), or the face it would turn to is an instant or
 * sorcery face (CR 712.10, 701.27d).
 */
export function transformedFace(def: CardDefinition, current: number): number | null {
  if (!isDoubleFaced(def)) return null;
  const next = current === 0 ? 1 : 0;
  const face = def.faces[next];
  if (face === undefined) return null;
  return face.types.includes('instant') || face.types.includes('sorcery') ? null : next;
}

/**
 * For the back face of a nonmodal double-faced permanent: the mana cost its mana value is calculated
 * from, which is the front face's (CR 712.8e, 202.3b). Null when the rule does not apply.
 */
export function backFaceManaCost(
  def: CardDefinition,
  obj: GameObject,
): { readonly manaCost: readonly string[] | null } | null {
  if (def.layout !== 'transform' || obj.face !== 1 || obj.zone === 'stack') return null;
  const front = def.faces[0];
  return front === undefined ? null : { manaCost: front.manaCost };
}

/** Whether the object is a spell on the stack that was cast as an Adventure (CR 715.3b). */
export function isAdventureSpell(state: GameState, obj: GameObject): boolean {
  if (obj.card === null || obj.zone !== 'stack' || obj.stack?.kind !== 'spell') return false;
  return definitionOf(state, obj.card).layout === 'adventure' && obj.face === 1;
}
