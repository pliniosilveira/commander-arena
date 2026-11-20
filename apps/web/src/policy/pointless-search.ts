/**
 * Questions the game answers for the player, with Full Control off, when the answer cannot matter
 * to what they find: "Partner with [name]" (CR 702.124j: when it enters, target player may search
 * their library for a card named [name]) while the named card is the player's own commander and is
 * in plain sight outside their library. A deck holds its commander once, so the search cannot find
 * it. The game then targets the player and declines the search.
 *
 * It is a preference about when to ask, like the auto-pass policy (`should-stop.ts`): a pure
 * function of the human's view, and the answers are sent as ordinary actions. Declining also means
 * the library is not shuffled, and the other player is not made to search: a player who wants either
 * turns Full Control on, and is asked both questions.
 */
import type { Action, GameView, ObjectId, ObjectView } from '@commander-arena/engine';

/** The name a resolving or triggering "may search your library for a card named X" ability looks for, or null. */
function namedSearch(view: GameView, source: ObjectId): string | null {
  const effect = view.stack.find((o) => o.id === source)?.ability?.effect;
  if (effect === undefined || effect.kind !== 'search' || effect.optional !== true) return null;
  if (effect.player === undefined || effect.player.kind !== 'target') return null;
  const named = effect.filter.named;
  return typeof named === 'string' ? named : null;
}

/** Whether a commander the viewer owns, with that name, is where every player sees it is not in a library. */
function ownCommanderInSight(view: GameView, name: string): boolean {
  const mine = view.seats[view.viewer];
  const inSight: readonly ObjectView[] = [
    ...view.battlefield,
    ...view.stack,
    ...view.exile,
    ...(mine?.command ?? []),
    ...(mine?.graveyard ?? []),
    ...(mine?.hand ?? []),
  ];
  return inSight.some(
    (o) =>
      o.isCommander &&
      o.owner === view.viewer &&
      o.faceDown !== true &&
      (o.name === name || o.faces?.[0]?.name === name),
  );
}

/** The answer to send for the pending decision without asking, or null when the player is asked. */
export function pointlessSearchAnswer(view: GameView, fullControl: boolean): Action | null {
  const d = view.pending;
  if (fullControl || d === null || d.seat !== view.viewer) return null;
  if (d.kind === 'targets') {
    const spec = d.specs[0];
    if (d.forTrigger !== true || d.specs.length !== 1 || spec === undefined) return null;
    if (spec.min !== 1 || spec.max !== 1) return null;
    const name = namedSearch(view, d.source);
    if (name === null || !ownCommanderInSight(view, name)) return null;
    const self = spec.legal.find((t) => t.kind === 'player' && t.seat === view.viewer);
    return self === undefined ? null : { kind: 'chooseTargets', targets: [self] };
  }
  if (d.kind === 'confirmOptional' && d.purpose === 'search') {
    const name = namedSearch(view, d.source);
    return name !== null && ownCommanderInSight(view, name) ? { kind: 'declineOptional' } : null;
  }
  return null;
}
