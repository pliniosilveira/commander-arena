/**
 * Clicking a land that was tapped for mana, while its mana is unspent, takes the tap back (issue 19):
 * the same as Undo, so it is offered only for the permanents `untappableSources` (store.ts) names. A
 * permanent the decision already makes clickable keeps its own click.
 */
import type { ObjectId } from '@commander-arena/engine';
import type { Interaction } from '../interaction';

export function withManaUntap(
  base: Interaction,
  sources: ReadonlySet<ObjectId>,
  untap: (source: ObjectId) => void,
): Interaction {
  const extra = [...sources].filter((id) => !base.clickable.has(id));
  if (extra.length === 0) return base;
  return {
    ...base,
    clickable: new Set([...base.clickable, ...extra]),
    onObject: (id) => {
      if (extra.includes(id)) untap(id);
      else base.onObject(id);
    },
    badge: (id) => (extra.includes(id) ? 'Untap' : base.badge(id)),
  };
}
