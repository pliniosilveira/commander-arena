// The name of the card behind an object of a scenario game, for the scenario tests.
import type { ObjectId } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';

/** The definition's name of the object's card, or '?' for an object that is not a card. */
export function nameOf(g: ScenarioGame, id: ObjectId): string {
  const card = g.state.objects[id]?.card;
  const instance = card === null || card === undefined ? undefined : g.state.cards[card];
  return instance === undefined ? '?' : (g.state.definitions[instance.definition]?.name ?? '?');
}
