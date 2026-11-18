/**
 * The cards the viewer may cast or play from exile right now, shared by the strip at the left of the
 * battlefield (`ExilePlayStrip`) and by `OtherZonesStrip`, which must not list them a second time among
 * the status chips. Exile is shared; the cards the viewer may cast or play from there are those the
 * engine lists, which include a card of another player that an effect let the viewer play (D-187,
 * CR 406.3: "You may look at and play those cards").
 */
import type { GameView, ObjectId, ObjectView, PriorityDecision } from '@commander-arena/engine';
import { exileCastObjects } from '../decisions/layouts';
import { objectIndex } from '../decisions/lookup';

export interface ExilePlayable {
  readonly cards: readonly ObjectView[];
  readonly exile: ReadonlySet<ObjectId>;
  readonly priority: PriorityDecision | null;
  readonly index: ReturnType<typeof objectIndex>;
}

export function exilePlayable(view: GameView, clickable: ReadonlySet<ObjectId>): ExilePlayable {
  const pending = view.pending;
  const priority = pending?.kind === 'priority' ? pending : null;
  const index = objectIndex(view);
  const exile = priority === null ? new Set<ObjectId>() : exileCastObjects(priority, index);
  const cards = view.exile.filter((o) => exile.has(o.id) && clickable.has(o.id));
  return { cards, exile, priority, index };
}
