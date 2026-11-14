/**
 * Checks of the Umbra armor slice (D-1241): the replacement `umbraArmor` ("If enchanted permanent would be destroyed, instead remove all damage marked
 * on it and destroy this Aura", CR 702.89a). `validate.ts` calls into this file for the kinds it does not know itself.
 */
import type { CardFace } from '../cards/definition';
import type { Replacement } from './types';
import { type AstIssue, issue } from './validate-parts';

/** The replacement kind D-1241 adds. True when `r` is it (it has nothing to check but the face it stands on). */
export function checkUmbraReplacement(r: Replacement, _path: string, _out: AstIssue[]): boolean {
  return r?.kind === 'umbraArmor';
}

/** What a face with Umbra armor must be (CR 702.89a: it is a static ability possessed by some Auras; the engine reads it of the Aura it enchants with). */
export function umbraFaceIssues(face: CardFace, path: string, out: AstIssue[]): void {
  const aura = face.types.includes('enchantment') && face.subtypes.includes('Aura');
  face.abilities.forEach((a, i) => {
    if (a?.kind === 'replacement' && a.replacement?.kind === 'umbraArmor' && !aura) {
      issue(
        out,
        `${path}.abilities[${i}].replacement`,
        'Umbra armor is an ability of an Aura: the face must be an enchantment with the subtype Aura (CR 702.89a)',
      );
    }
  });
}
