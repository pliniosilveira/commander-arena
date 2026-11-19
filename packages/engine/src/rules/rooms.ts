/**
 * The unlocked designations of a Room, applied to its copiable values (CR 709.5, 709.5a to 709.5d). A split card with a shared type line has two halves; on the battlefield a
 * half that is locked (the permanent lacks its "unlocked" designation, `GameObject.unlockedDoors`) gives the permanent no name, no mana cost and no rules text (the two static
 * abilities of CR 709.5). The halves are part of the copiable values (`CopiableValues.doors`, CR 709.5b), so a copy of a Room has both and is locked or unlocked by its own
 * designations. Pure: it reads no state, so `rules/copiable.ts` can use it.
 */
import { COLORS, type Color } from '../characteristics';
import type { CopiableValues } from '../state/types';

/**
 * The values of a Room permanent whose halves `unlocked` names (indexes into `values.doors`): the name, mana cost, colors, text and abilities of the unlocked halves, joined in
 * the order of the halves; the type line is the shared one. A value with no halves is not a Room and is returned as it is.
 */
export function applyDoors(values: CopiableValues, unlocked: readonly number[]): CopiableValues {
  const doors = values.doors;
  if (doors === undefined) return values;
  const up = doors.filter((_, index) => unlocked.includes(index));
  const costs = up.map((d) => d.characteristics.manaCost);
  // CR 709.5: with neither half unlocked the permanent has no mana cost, so its mana value is 0 (CR 202.3).
  const manaCost = costs.every((c) => c === null) ? null : costs.flatMap((c) => c ?? []);
  const present = new Set<Color>(up.flatMap((d) => d.characteristics.colors));
  return {
    ...values,
    characteristics: {
      ...values.characteristics,
      name: up.map((d) => d.characteristics.name).join(' // '),
      manaCost,
      colors: COLORS.filter((c) => present.has(c)),
      oracleText: up.map((d) => d.characteristics.oracleText).join('\n'),
    },
    abilities: up.flatMap((d) => d.abilities),
  };
}
