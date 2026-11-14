import type { TokenDefinition } from '../ast/types';
import type { SeatId } from '../ids';
import type { GameObject } from '../state/types';

/**
 * A token with `definition` as it would be on the battlefield under `seat`'s control, which is not there: what the rules that read an entering
 * permanent need (riot given by another permanent, D-185, CR 614.12). It has no id of its own in the game (`id` is a placeholder).
 */
export function hypotheticalToken(seat: SeatId, definition: TokenDefinition): GameObject {
  const { abilities, ...characteristics } = definition;
  return {
    id: 'o-1',
    card: null,
    zone: 'battlefield',
    zoneOwner: null,
    owner: seat,
    controller: seat,
    face: 0,
    tapped: false,
    counters: {},
    damage: 0,
    damagedByDeathtouch: false,
    timestamp: Number.MAX_SAFE_INTEGER,
    token: { characteristics, abilities },
    attachedTo: null,
    protector: null,
    stack: null,
  };
}
