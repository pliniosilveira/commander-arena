// Shared by the scry, surveil, reorder and put-on-top tests (D-091). All cards are basic lands,
// Grizzly Bears, or SYNTHETIC (see src/cards/fixtures/synthetic-library.ts).
import type { GameEvent, SeatId } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

/** The library cards of the scenarios, top first, each with its own label a to f. */
export const LIBRARY = [
  ['Island', 'a'],
  ['Forest', 'b'],
  ['Plains', 'c'],
  ['Swamp', 'd'],
  ['Mountain', 'e'],
  ['Grizzly Bears', 'f'],
] as const;

/** Seat 0 holds `spell` and mana for it; its library is the first `size` of LIBRARY. */
export function libraryGame(spell: string, size = 5, pool = 'UC') {
  let b = scenario().seat(0).hand(spell).pool(pool);
  for (const [name, label] of LIBRARY.slice(0, size)) b = b.library(name, { label });
  return b.seat(1).library('Llanowar Elves').build();
}

/** Casts the spell and lets it resolve: both players pass once (CR 117.4). */
export function castAndResolve(g: ScenarioGame, spell: string): ScenarioGame {
  g.act(0).cast(spell, { pay: true });
  g.pass();
  return g.pass();
}

/** The names of the cards in a seat's library, top first. */
export function libraryNames(g: ScenarioGame, seat: SeatId = 0): string[] {
  return g.state.seats[seat]?.library.map((id) => cardName(g, id)) ?? [];
}

export function graveyardNames(g: ScenarioGame, seat: SeatId = 0): string[] {
  return g.state.seats[seat]?.graveyard.map((id) => cardName(g, id)) ?? [];
}

export function handNames(g: ScenarioGame, seat: SeatId = 0): string[] {
  return g.state.seats[seat]?.hand.map((id) => cardName(g, id)) ?? [];
}

function cardName(g: ScenarioGame, id: string): string {
  const obj = g.state.objects[id as keyof typeof g.state.objects];
  if (obj?.card == null) return '?';
  const card = g.state.cards[obj.card];
  return card === undefined ? '?' : (g.state.definitions[card.definition]?.name ?? '?');
}

export function arrangeDecision(g: ScenarioGame) {
  const d = g.state.pending;
  if (d?.kind !== 'arrangeCards') throw new Error(`expected arrangeCards, got ${d?.kind}`);
  return d;
}

export const kinds = (events: readonly GameEvent[]): string[] => events.map((e) => e.kind);
