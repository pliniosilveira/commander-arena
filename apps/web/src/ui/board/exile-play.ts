/**
 * The cards the viewer may cast or play from another zone right now (exile, their graveyard, the top of their library), listed by the
 * strip at the right of the battlefield (`ExilePlayStrip`); `OtherZonesStrip` reads the exile ones so that it does not list them a second
 * time among the status chips. Exile is shared; the cards the viewer may cast or play from there are those the
 * engine lists, which include a card of another player that an effect let the viewer play (D-187,
 * CR 406.3: "You may look at and play those cards").
 */
import type { GameView, ObjectId, ObjectView, PriorityDecision } from '@commander-arena/engine';
import { graveyardPlayObjects } from '../decisions/flashback';
import { exileCastObjects, libraryBadge } from '../decisions/layouts';
import { objectIndex } from '../decisions/lookup';
import { playableObjects } from '../decisions/priority';

export interface ExilePlayable {
  readonly cards: readonly ObjectView[];
  /** The cards of the viewer's graveyard the decision offers something for (flashback, escape, unearth, D-133). */
  readonly graveyard: readonly ObjectView[];
  /** The top card of the viewer's library when a permanent lets them cast it from there (D-151, CR 601.3): none or one. */
  readonly library: readonly ObjectView[];
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
  const mine = view.seats[view.viewer];
  const usable =
    priority === null ? new Set<ObjectId>() : graveyardPlayObjects(priority, mine?.graveyard ?? []);
  const graveyard = (mine?.graveyard ?? []).filter((o) => usable.has(o.id) && clickable.has(o.id));
  const top = mine?.libraryTop;
  const library =
    priority !== null &&
    top !== undefined &&
    clickable.has(top.id) &&
    libraryBadge(playableObjects(priority), index, top.id) !== null
      ? [top]
      : [];
  return { cards, graveyard, library, exile, via, priority, index };
}
