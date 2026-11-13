/**
 * The "as long as" of a static ability (D-133, CR 611.3a): whether a condition holds for the permanent that has the ability,
 * read while `derive` is working out the characteristics of some permanent. So it reads only what no effect of layer 7
 * changes (CR 613.8): counts through `typeViewOf` (types, subtypes, colors, controller, tapped status and zone after layers
 * 1, 4 and 5, as the static amounts of D-115 do), the controller's life total, commanders, designations and the source's own
 * type line and tapped status. Nothing here may import `derive`: it depends on this file.
 *
 * `validateCard` allows a static ability only the conditions this file reads (`ast/validate-static-condition.ts`); any other
 * kind never holds here.
 */
import type { Condition, PlayerSelector } from '../ast/types';
import type { SeatId } from '../ids';
import { opponentsOf, seatsInOrder } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import {
  cardsInGraveyardHolds,
  cardsInLibraryHolds,
  controlsCommander,
  enteredThisTurnHolds,
  lifeGainedThisTurnHolds,
  lifeTotalHolds,
  playerDealtDamageHolds,
} from './condition-reads';
import { controllerOf } from './control';
import { countForSource } from './derive-count';
import { typeViewOf } from './derive-view';
import { designationHolders } from './designations';
import { matchesFilterWith } from './filter-match';
import { partnerOf } from './pairing';

/** The players a static ability's condition names (`validateCard`: you, each player, each opponent, this permanent's controller or owner). */
function playersOf(state: GameState, selector: PlayerSelector, source: GameObject): SeatId[] {
  switch (selector.kind) {
    case 'you':
      return [controllerOf(state, source)];
    case 'eachPlayer':
      return seatsInOrder(state, controllerOf(state, source));
    case 'eachOpponent':
      return opponentsOf(state, controllerOf(state, source));
    case 'all':
      return selector.of.flatMap((member) => playersOf(state, member, source));
    case 'controllerOf':
    case 'ownerOf': {
      // D-139: the controller or owner of this permanent, or of the permanent it is attached to ("unless that player is the monarch").
      const host =
        selector.of.kind === 'attached'
          ? source.attachedTo === null
            ? undefined
            : state.objects[source.attachedTo]
          : source;
      if (host === undefined) return [];
      return [selector.kind === 'controllerOf' ? controllerOf(state, host) : host.owner];
    }
    default:
      return [];
  }
}

/** Whether `condition` holds for `source`, the permanent whose static ability it conditions. */
export function staticConditionHolds(
  state: GameState,
  condition: Condition,
  source: GameObject,
): boolean {
  switch (condition.kind) {
    case 'controlsAtLeast':
      // "You control": the source's controller's permanents on the battlefield, `other` leaving out the source.
      return (
        countForSource(
          state,
          { ...condition.filter, zone: 'battlefield', controller: 'you' },
          source,
        ) >= condition.count
      );
    case 'yourTurn': // D-206 (CR 611.3a): the active player is the controller of the permanent, which no layer changes
      return state.turn.activeSeat === controllerOf(state, source);
    case 'controlCommander':
      return controlsCommander(state, controllerOf(state, source), condition);
    case 'lifeTotal':
      return lifeTotalHolds(state, controllerOf(state, source), condition);
    case 'chosenOption': // D-151: what the permanent chose as it entered, which no layer changes
      return source.chosen?.option === condition.option;
    case 'enteredThisTurn': // D-151: the turn log, which no layer changes
      return enteredThisTurnHolds(state, controllerOf(state, source), condition);
    case 'playerDealtDamage':
      return playerDealtDamageHolds(state, controllerOf(state, source), condition);
    case 'lifeGainedThisTurn': // D-252: the turn log, which no layer changes
      return lifeGainedThisTurnHolds(state, controllerOf(state, source), condition);
    case 'cardsInGraveyard': // D-229: the number of cards in a zone, which no layer changes
      return cardsInGraveyardHolds(state, controllerOf(state, source), condition.compare);
    case 'cardsInLibrary': // D-331: the number of cards in a zone, which no layer changes
      return cardsInLibraryHolds(state, controllerOf(state, source), condition.compare);
    case 'thisMatches':
      return matchesFilterWith(
        state,
        source,
        () => typeViewOf(state, source),
        { ...condition.filter, zone: source.zone },
        { controller: controllerOf(state, source), source: source.id },
      );
    case 'objectMatches': {
      // D-179: "as long as this Equipment is attached to a creature": the permanent the source is attached to, against the filter (read as a
      // permanent, so what it is after layers 1, 4 and 5). Only `attached` is read (`validateCard`).
      if (condition.of.kind !== 'attached' || source.attachedTo === null) return false;
      const host = state.objects[source.attachedTo];
      return (
        host !== undefined &&
        matchesFilterWith(
          state,
          host,
          () => typeViewOf(state, host),
          { ...condition.filter, zone: 'battlefield' },
          { controller: controllerOf(state, source), source: source.id },
        )
      );
    }
    case 'paired': // CR 702.95b (D-286): the pair, which no layer changes (`rules/pairing.ts` reads no characteristic)
      return partnerOf(state, source) !== null;
    case 'playerHasDesignation': {
      const holders = designationHolders(state, condition.designation);
      return playersOf(state, condition.player, source).some((seat) => holders.includes(seat));
    }
    case 'and':
      return condition.terms.every((t) => staticConditionHolds(state, t, source));
    case 'or':
      return condition.terms.some((t) => staticConditionHolds(state, t, source));
    case 'not':
      return !staticConditionHolds(state, condition.term, source);
    default:
      return false;
  }
}
