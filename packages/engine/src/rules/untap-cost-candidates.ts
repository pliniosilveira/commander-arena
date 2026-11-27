/**
 * The permanents a cost "Untap two tapped creatures you control" may untap (CR 701.26b, 118.3, 601.2h; `rules/activate-untap.ts`).
 */
import type { ObjectFilter } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameState } from '../state/types';
import { counterRemovalLockedById } from './counter-lock';
import { canTapForMana, hasCost, manaAbilitiesOf } from './mana-abilities';
import { controlledCandidates } from './sacrifice';
import { STUN_COUNTER } from './untap';

/** The permanents `seat` may untap for "untap N tapped <filter> you control" (CR 701.26b): the tapped ones it controls that match. */
export function untapCandidates(
  state: GameState,
  seat: SeatId,
  source: ObjectId | null,
  filter: ObjectFilter,
): ObjectId[] {
  // CR 122.1d, 701.26b (Fear of Sleep Paralysis): a permanent whose stun counter can't be removed can't be untapped.
  return controlledCandidates(state, seat, source, { ...filter, tapped: true }).filter(
    (id) => !counterRemovalLockedById(state, id, STUN_COUNTER),
  );
}

/**
 * CR 601.2h: the costs are paid in the order the player likes, and the untap cost is paid after the mana, so a permanent that the mana of the cost can tap (it has a mana ability
 * with {T} it can use now) becomes a permanent to untap. At most one for each mana symbol of the cost. The legal-action code counts them next to the permanents that are tapped
 * already, so an ability whose untapping depends on tapping a creature for its mana is offered.
 */
export function untappableByMana(
  state: GameState,
  seat: SeatId,
  source: ObjectId | null,
  filter: ObjectFilter,
  manaSymbols: number,
): number {
  if (manaSymbols === 0) return 0;
  const untapped = controlledCandidates(state, seat, source, { ...filter, tapped: false });
  let found = 0;
  for (const id of untapped) {
    const obj = state.objects[id];
    if (obj === undefined || !canTapForMana(state, obj, seat)) continue;
    if (manaAbilitiesOf(state, obj).some(({ ability }) => hasCost(ability, 'tap'))) found += 1;
  }
  return Math.min(found, manaSymbols);
}
