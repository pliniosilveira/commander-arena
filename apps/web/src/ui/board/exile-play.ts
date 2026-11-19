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
  /** For a Hideaway card: the permanent whose ability plays it, which a click on the tile uses (CR 702.75a). */
  readonly via: ReadonlyMap<ObjectId, ObjectId>;
  readonly exile: ReadonlySet<ObjectId>;
  readonly priority: PriorityDecision | null;
  readonly index: ReturnType<typeof objectIndex>;
}

/** True when an ability's AST plays "the exiled card" of a linked ability (Hideaway, CR 702.75a, D-145). */
function playsLinkedExile(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(playsLinkedExile);
  if (node === null || typeof node !== 'object') return false;
  const rec = node as Record<string, unknown>;
  const objects = rec.objects as { kind?: unknown } | undefined;
  if (rec.kind === 'castFree' && objects?.kind === 'linkedExile') return true;
  return Object.values(rec).some(playsLinkedExile);
}

export function exilePlayable(view: GameView, clickable: ReadonlySet<ObjectId>): ExilePlayable {
  const pending = view.pending;
  const priority = pending?.kind === 'priority' ? pending : null;
  const index = objectIndex(view);
  const exile = priority === null ? new Set<ObjectId>() : exileCastObjects(priority, index);
  const via = new Map<ObjectId, ObjectId>();
  if (priority !== null) {
    // A Hideaway card is played by an activated ability of the permanent that exiled it, not by a cast option of its own.
    for (const o of view.exile) {
      const source = o.hideawaySource === undefined ? undefined : index.get(o.hideawaySource);
      if (source === undefined || !clickable.has(source.id)) continue;
      const usable = priority.options.some(
        (p) =>
          p.kind === 'activate' &&
          p.object === source.id &&
          playsLinkedExile(
            source.activated?.find((a) => a.abilityIndex === p.abilityIndex)?.ability,
          ),
      );
      if (usable) via.set(o.id, source.id);
    }
  }
  const cards = view.exile.filter((o) => via.has(o.id) || (exile.has(o.id) && clickable.has(o.id)));
  return { cards, exile, via, priority, index };
}
