/**
 * A permanent that enters as a copy of an Aura (Mirrormade copying an Aura on the battlefield; CR 303.4f, 303.4g, 614.12, 707.9). The card that enters is not an Aura itself, so no
 * spell target names what it enchants: its controller chooses a permanent its enchant ability, as the copy has it, allows, before it enters, and it enters attached to it (an
 * Aura spell's own target is chosen as the spell is cast, `stack.ts`). With no legal permanent it does not enter: it stays where it is, and a spell is put into its owner's
 * graveyard instead (CR 303.4g). Nothing is targeted, so hexproof and shroud do not matter, and protection from a quality of the Aura as it would be does (CR 303.4c, 702.16).
 * An Aura that enchants players is not offered a player, as for any Aura that enters by an effect: it stays (`docs/ROADMAP.md`).
 */

import type { ObjectId, SeatId } from '../ids';
import type { GameState } from '../state/types';
import { derive } from './derive';
import type { CopyRule } from './enters-copy';
import { becomeCopyAsItEnters } from './enters-copy';
import { hasProtectionFrom } from './protection';
import { matchesFilter } from './select';

/**
 * The permanents the object `entering` could enchant as it enters as a copy of `copied` (CR 303.4f), oldest first, or null when the copy is not an Aura. Empty when the Aura enchants
 * players (not built) or nothing can be enchanted by it (CR 303.4g). `entering` is the object as it is now, not on the battlefield; the copy is made on a scratch state to read what
 * it would be.
 */
export function copyAuraHosts(
  state: GameState,
  entering: ObjectId,
  rule: CopyRule,
  copied: ObjectId,
  seat: SeatId,
): ObjectId[] | null {
  const hypothetical = becomeCopyAsItEnters(state, entering, rule, copied, seat).state;
  const object = hypothetical.objects[entering];
  if (object === undefined) return null;
  const view = derive(hypothetical, object);
  if (!view.types.includes('enchantment') || !view.subtypes.includes('Aura')) return null;
  const enchant = view.abilities.find((a) => a.kind === 'keyword' && a.keyword.kind === 'enchant');
  if (enchant?.kind !== 'keyword' || enchant.keyword.kind !== 'enchant') return null;
  if (enchant.keyword.player === true) return [];
  const { filter } = enchant.keyword;
  return hypothetical.battlefield.filter((id) => {
    const host = hypothetical.objects[id];
    return (
      host !== undefined &&
      id !== entering &&
      matchesFilter(
        hypothetical,
        host,
        { ...filter, zone: 'battlefield' },
        { controller: seat, source: entering },
      ) &&
      !hasProtectionFrom(hypothetical, host, entering)
    );
  });
}
