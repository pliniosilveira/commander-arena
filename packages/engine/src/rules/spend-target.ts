/**
 * What mana is about to be spent on when it pays for a spell (CR 601.2h, 106.6): the spell's card types and subtypes, its mana value and whether its mana cost has an {X}
 * (what a restriction like "Spend this mana only to cast spells with mana value 5 or greater or spells with {X} in their mana costs" reads), and whether mana of any
 * type may pay for it (CR 609.4b).
 */
import type { SpendTarget } from '../mana';
import type { GameObject, GameState } from '../state/types';
import { derive } from './derive';
import { manaValueOfCost } from './mana-value';
import { xSymbolCount } from './x-value';

export function spellSpendTarget(
  state: GameState,
  spell: GameObject,
  anyType: boolean,
  /** Issue 144 (CR 609.4b): mana can be spent as though it were mana of any color: left out, what the spell on the stack says. */
  anyColor: boolean = spell.stack?.anyManaColor === true,
  /** CR 601.2a: the zone the spell is cast from, when it is not on the stack yet. */
  castFrom: string | undefined = spell.stack?.castFrom,
): Extract<SpendTarget, { types: readonly string[] }> {
  const derived = derive(state, spell);
  return {
    types: derived.types,
    subtypes: derived.subtypes,
    // CR 202.3e: an {X} counts as the value announced while the spell is on the stack, 0 in a hand.
    manaValue: manaValueOfCost(derived.manaCost, spell),
    // CR 107.3: an {X} in the mana cost, whatever value X has.
    hasX: derived.manaCost !== null && xSymbolCount(derived.manaCost) > 0,
    // CR 105.2a: the colors of the spell, which a "monocolored spells" restriction reads.
    colors: derived.colors,
    // CR 601.2a, 106.6: the zone the spell is cast from, which a "from your graveyard" restriction reads.
    ...(castFrom === undefined ? {} : { castFrom }),
    ...(anyType ? { anyType: true as const } : {}),
    ...(anyColor ? { anyColor: true as const } : {}),
  };
}
