/**
 * The words of Umbra armor and of its question (CR 702.89a, 616.1; D-1241, D-1242, the Danitha deck, group 4). Composed from the AST and the engine's decision, never from
 * the Oracle text. Pure.
 */
import type { DestroyReplacementChoice } from '@commander-arena/engine';

/** The ability of an Aura: "If enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura." (CR 702.89a). */
export function umbraArmorWording(): string {
  return 'Umbra armor: if enchanted permanent would be destroyed, instead remove all damage from it and destroy this Aura';
}

/** The log line: "Grizzly Bears is not destroyed: Umbra armor removes all damage from it and Hyena Umbra is destroyed instead." */
export function umbraArmorUsedText(creature: string, aura: string): string {
  return `${creature} is not destroyed: Umbra armor removes all damage from it and ${aura} is destroyed instead.`;
}

/** "Grizzly Bears would be destroyed. Several effects apply. Choose which to apply first." (CR 616.1): the question of the player who controls the permanent. */
export function destroyReplacementPrompt(creature: string): string {
  return `${creature} would be destroyed. Several effects apply. Choose which to apply first.`;
}

/** The line under a button: what this effect does if it goes first, "Then: Hyena Umbra is destroyed" or "Then: it is tapped and removed from combat". */
export function destroyReplacementThen(outcome: DestroyReplacementChoice['outcome']): string {
  return outcome.aura === null
    ? 'Then: it is tapped, removed from combat and its damage is removed'
    : `Then: its damage is removed and ${outcome.aura} is destroyed`;
}
