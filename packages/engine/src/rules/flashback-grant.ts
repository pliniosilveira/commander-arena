/**
 * Flashback that an effect or a permanent gives to the cards of a graveyard, with the cost equal to the card's mana cost (CR 702.34a, 118.9): "Each instant and sorcery card in
 * your graveyard has flashback. The flashback cost is equal to that card's mana cost." (the static ability `grantFlashbackToGraveyardCards`) and "Each instant and sorcery card
 * in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost." (the effect `gainFlashbackFromManaCost`, which leaves a continuous effect
 * that names the cards, CR 611.2c). A card cast for it is cast as a printed flashback is (`CastAlternative` `flashback`): from its owner's graveyard, exiled when it leaves the stack.
 */
import type { Effect } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import { allocateTimestamp, getSeat } from '../state/ops';
import type { ContinuousEffect, GameObject, GameState, ResolutionContext } from '../state/types';
import { controllerOf } from './control';
import { flashbackGrantSources } from './derive-statics';
import { matchesFilter } from './select';
import { staticConditionHolds } from './static-conditions';
import { done, type StepOutcome } from './step-outcome';

/**
 * "Each instant and sorcery card in your graveyard gains flashback until end of turn" (CR 611.2a, 611.2c): one continuous effect that names the cards of the controller's
 * graveyard the filter describes as the effect resolves, until the end of the turn. It does nothing when there are none.
 */
export function runGainFlashbackFromManaCost(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'gainFlashbackFromManaCost' }>,
): StepOutcome {
  const cards = getSeat(state, res.controller).graveyard.filter((id) => {
    const card = state.objects[id];
    return (
      card !== undefined &&
      matchesFilter(
        state,
        card,
        { ...effect.what, zone: 'graveyard' },
        { controller: res.controller, source: res.source },
      )
    );
  });
  if (cards.length === 0) return done(state);
  const [timestamp, stamped] = allocateTimestamp(state);
  const created: ContinuousEffect = {
    id: `ce${timestamp}`,
    timestamp,
    objects: cards,
    until: 'endOfTurn',
    change: { kind: 'flashbackFromManaCost' },
  };
  return done({ ...stamped, continuousEffects: [...stamped.continuousEffects, created] });
}

/**
 * Whether `obj`, a card in the graveyard of `seat` (its owner), has flashback with the cost equal to its mana cost because an effect named it this turn or a permanent `seat`
 * controls gives it (CR 702.34a, 613.1f). The card still needs a mana cost and to be an instant or a sorcery, which `castZone` checks.
 */
export function hasGrantedFlashback(state: GameState, seat: SeatId, obj: GameObject): boolean {
  if (obj.zone !== 'graveyard' || obj.owner !== seat) return false;
  if (
    state.continuousEffects.some(
      (e) => e.change.kind === 'flashbackFromManaCost' && named(e.objects, obj.id),
    )
  ) {
    return true;
  }
  for (const source of flashbackGrantSources(state)) {
    if (controllerOf(state, source.object) !== seat) continue;
    if (
      source.condition !== undefined &&
      !staticConditionHolds(state, source.condition, source.object)
    ) {
      continue;
    }
    if (
      matchesFilter(
        state,
        obj,
        { ...source.what, zone: 'graveyard' },
        { controller: seat, source: source.object.id },
      )
    ) {
      return true;
    }
  }
  return false;
}

function named(objects: readonly ObjectId[], id: ObjectId): boolean {
  return objects.includes(id);
}
