/** Helpers shared by the layout tests (split, Adventure, double-faced). */
import type { ObjectView } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';

/** The view of an object, wherever the viewing seat can see it. */
export function viewOf(g: ScenarioGame, card: string, seat: 0 | 1 = 0): ObjectView {
  const v = g.view(seat);
  const id = g.id(card);
  const all = [
    ...v.battlefield,
    ...v.stack,
    ...v.exile,
    ...v.seats.flatMap((s) => [...(s.hand ?? []), ...s.graveyard, ...s.command]),
  ];
  const found = all.find((o) => o.id === id);
  if (found === undefined) throw new Error(`${card} is not in the view`);
  return found;
}
