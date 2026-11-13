/**
 * Which cards in a view print `*` for power or toughness (D-109): the engine's `ObjectView.power` and
 * `toughness` are the derived numbers, in every zone, and carry nothing of what defines them. The host
 * holds the state, so it reads each visible card's face and sends the page a note for the ones whose
 * face prints `*`: which of the two is `*` and the words of the ability that defines it (CR 604.3).
 * Only objects the viewer can see get a note, so nothing hidden is named.
 */
import type { GameState, GameView, ObjectId, ObjectView } from '@commander-arena/engine';
import type { DefinedPtNote } from './protocol';
import { definedByTitle } from './pt-text';

function viewObjects(view: GameView): readonly ObjectView[] {
  const out: ObjectView[] = [...view.battlefield, ...view.stack, ...view.exile];
  for (const seat of view.seats) out.push(...(seat.hand ?? []), ...seat.graveyard, ...seat.command);
  out.push(...(view.pendingCards ?? []));
  return out;
}

/** The note for one object, or null when its face prints no `*` (or it is a token or an ability). */
function noteOf(state: GameState, id: ObjectId): DefinedPtNote | null {
  const obj = state.objects[id];
  // CR 708.2 (D-312): a face-down permanent has no printed power and toughness to word; its card is nobody's to read.
  if (obj?.faceDown !== undefined) return null;
  const card = obj?.card === null || obj === undefined ? undefined : state.cards[obj.card];
  const face =
    card === undefined ? undefined : state.definitions[card.definition]?.faces?.[obj?.face ?? 0];
  if (face === undefined) return null;
  const power = face.power === '*';
  const toughness = face.toughness === '*';
  if (!power && !toughness) return null;
  const defined = face.abilities.find(
    (a) => a.kind === 'static' && a.static.kind === 'characteristicPt',
  );
  const effect =
    defined?.kind === 'static' && defined.static.kind === 'characteristicPt'
      ? defined.static
      : null;
  // A `*` with no ability is 0 (CR 208.2a): the number says so, and there is nothing to word.
  const text =
    effect === null
      ? 'Power or toughness shown as * with no ability that defines it: it is 0'
      : definedByTitle(effect.power, effect.toughness);
  return { power, toughness, text };
}

/** The notes for every visible object whose face prints `*`, by object id. Empty for most games. */
export function definedPtNotes(
  state: GameState,
  view: GameView,
): Readonly<Record<string, DefinedPtNote>> {
  const notes: Record<string, DefinedPtNote> = {};
  for (const o of viewObjects(view)) {
    if (o.isToken || o.abilitySource !== undefined) continue;
    const note = noteOf(state, o.id);
    if (note !== null) notes[o.id] = note;
  }
  return notes;
}
