/**
 * "Once during each of your turns, you may cast an enchantment spell by paying life equal to its mana value rather than paying its mana cost." (Demon of Fate's Design), "... you may
 * cast a spell from your hand or the top of your library without paying its mana cost." (One with the Multiverse): the static ability `castOnceEachTurn` of a permanent (CR 118.9,
 * 118.9a, 601.2b, 601.2f, 613.1f). In a turn of its controller it gives one spell the alternative cost `lifeForMana` or `free`, listed beside the ordinary cast (`rules/priority.ts`);
 * the spell is cast at the timing of its types with its additional costs (`rules/legality.ts`, `rules/cast-cost.ts`), with X 0 (CR 107.3b), and the permanent whose permission it was is
 * kept on the spell (`StackData.castOnce`) and recorded as used as the spell becomes cast (`TurnLog.oncePerTurnGrants`, `finishCast`). Each permanent has its own use, and a permanent
 * that left the battlefield and came back is a new object (CR 400.7).
 *
 * With `unlimited` ("You may cast spells from your hand without paying their mana costs.", the emblem of Tamiyo, Field Researcher, CR 114.4, 118.9) the permission has no limit: any
 * spell of the hand it matches, in any turn, and no use is recorded (`castOnceUse`). An emblem's ability works from the command zone (`derive-statics.ts`).
 */
import type { ObjectId, SeatId } from '../ids';
import { getSeat } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { type OnceCastSource, onceCastSources } from './derive-statics';
import { isCommanderCardId } from './melded';
import { matchesFilter } from './select';
import { staticConditionHolds } from './static-conditions';

/** Whether `card`, in the zone it is in, is one the permission of `source` reaches. `otherwiseFromLibrary`: another ability lets `seat` cast it from the top of the library. */
function reaches(
  state: GameState,
  seat: SeatId,
  card: GameObject,
  source: OnceCastSource,
  otherwiseFromLibrary: boolean,
): boolean {
  if (card.zone === 'hand') return source.from === undefined || source.from.includes('hand');
  if (card.zone === 'library') {
    if (getSeat(state, seat).library[0] !== card.id) return false;
    // "from ... the top of your library" is itself the permission to cast the card from there; a permission that names no zone needs another one (CR 601.2a, 601.3).
    return source.from === undefined ? otherwiseFromLibrary : source.from.includes('libraryTop');
  }
  // CR 903.8: a commander is cast from the command zone by the rules of the format; a permission that names a zone does not reach it there.
  if (card.zone === 'command') {
    return source.from === undefined && isCommanderCardId(state, card.card);
  }
  return false;
}

/**
 * How narrow a permission is: one with a filter of its own before one for any spell, then one that names fewer zones. When several unused permissions could give the spell the same
 * alternative cost, the narrowest is the one used, so that the wider one is left for another spell (the player has no way to name the permanent here).
 */
function width(source: OnceCastSource): number {
  // A permission with no limit is used first: it leaves every once-a-turn one for another spell.
  if (source.unlimited === true) return -1;
  const any = Object.keys(source.spells).length === 0 ? 1 : 0;
  return any * 10 + (source.from === undefined ? 3 : source.from.length);
}

/** Whether the permission of `source` (an object on the battlefield or an emblem) is one with no limit: a spell cast with it records no use (CR 118.9). */
export function isUnlimitedOnceCast(state: GameState, source: ObjectId): boolean {
  return onceCastSources(state).some((s) => s.object.id === source && s.unlimited === true);
}

/**
 * The permanent whose unused `castOnceEachTurn` permission lets `seat` cast `card` (in its hand, on top of its library or in the command zone) as `spell` (the card as the spell it
 * would be, `castAs`) for `alternative` now, or null: in the seat's own turn only ("during each of your turns"), for a card it owns, by a permanent it controls.
 */
export function onceCastGrant(
  state: GameState,
  seat: SeatId,
  card: GameObject,
  spell: GameObject,
  alternative: 'lifeForMana' | 'free',
  otherwiseFromLibrary: boolean,
): ObjectId | null {
  const sources = onceCastSources(state);
  if (sources.length === 0) return null;
  if (card.card === null || card.owner !== seat) return null;
  if (card.copyOf !== undefined) return null;
  const used = state.turnLog.oncePerTurnGrants ?? [];
  let best: OnceCastSource | null = null;
  for (const source of sources) {
    if (source.alternative !== alternative) continue;
    if (controllerOf(state, source.object) !== seat) continue;
    // "Once during each of your turns" (CR 601.2b): in the seat's own turn, once; a permission with no limit works in any turn, for any number of spells.
    if (
      source.unlimited !== true &&
      (state.turn.activeSeat !== seat || used.includes(source.object.id))
    ) {
      continue;
    }
    if (!reaches(state, seat, card, source, otherwiseFromLibrary)) continue;
    if (
      source.condition !== undefined &&
      !staticConditionHolds(state, source.condition, source.object)
    ) {
      continue;
    }
    if (
      !matchesFilter(
        state,
        spell,
        { ...source.spells, zone: 'stack' },
        { controller: seat, source: source.object.id },
      )
    ) {
      continue;
    }
    if (best === null || width(source) < width(best)) best = source;
  }
  return best?.object.id ?? null;
}
