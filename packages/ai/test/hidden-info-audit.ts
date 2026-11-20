// Pure helpers of the hidden-information audit (`hidden-info.test.ts`), kept apart so that `hidden-info-audit.test.ts`
// can prove them on small inputs without playing a seeded game.
import type { GameState, ObjectId, SeatId } from '@commander-arena/engine';
import { getView } from '@commander-arena/engine';

/**
 * Every string found in the AST of the abilities of the objects on the stack. CR 113.7a: an ability on the stack
 * exists independently of its source and its text is public, so a land type in a filter ("search your library for a
 * Plains card") is no leak of a card named Plains in a hidden zone. Only the stack's abilities are read.
 */
export function quotedStringsOfStack(
  stack: readonly string[],
  abilityOf: (id: string) => unknown,
): Set<string> {
  const found = new Set<string>();
  const walk = (node: unknown): void => {
    if (typeof node === 'string') found.add(node);
    else if (Array.isArray(node)) for (const item of node) walk(item);
    else if (typeof node === 'object' && node !== null)
      for (const v of Object.values(node)) walk(v);
  };
  for (const id of stack) walk(abilityOf(id));
  return found;
}

/** What `poolOfOtherSeat` reads of a state. */
export interface PoolState {
  readonly objects: Record<
    string,
    {
      readonly card: string | null;
      readonly owner?: number;
      readonly faceDown?: unknown;
      readonly foretold?: boolean;
    }
  >;
  readonly battlefield: readonly string[];
  readonly phased?: readonly string[] | undefined;
  readonly exile: readonly string[];
  readonly seats: readonly {
    readonly id: number;
    readonly hand: readonly string[];
    readonly library: readonly string[];
  }[];
}

/**
 * The sorted card ids that the determinization of D-312 (CR 708.5, `redealCards`) deals again as one pool for the
 * other seat `seat`: its hand and library, its face-down permanents that the viewer does not control (the viewer
 * cannot know the card behind one) and its foretold cards in exile. Only this pool as a whole keeps its multiset.
 * `viewerControls(id)` says whether the viewer controls the permanent.
 */
export function poolOfOtherSeat(
  state: PoolState,
  seat: number,
  viewerControls: (id: string) => boolean,
): string[] {
  const s = state.seats.find((x) => x.id === seat);
  if (s === undefined) throw new Error(`no seat ${seat}`);
  const ids: string[] = [
    ...s.hand,
    ...s.library,
    ...[...state.battlefield, ...(state.phased ?? [])].filter((id) => {
      const o = state.objects[id];
      return o?.faceDown !== undefined && o.owner === seat && !viewerControls(id);
    }),
    ...state.exile.filter((id) => {
      const o = state.objects[id];
      return o?.foretold === true && o.owner === seat;
    }),
  ];
  return ids.map((id) => state.objects[id]?.card ?? '(none)').sort();
}

/** `poolOfOtherSeat` on a real game state, as seen by `viewer` (who controls what is what the view says). */
export function poolOfSeatIn(state: GameState, seat: SeatId, viewer: SeatId): string[] {
  const view = getView(state, viewer);
  const controlled = new Set(
    [...view.battlefield, ...(view.phasedOut ?? [])]
      .filter((o) => o.controller === viewer)
      .map((o) => o.id),
  );
  const flat: PoolState = {
    objects: Object.fromEntries(
      Object.entries(state.objects).map(([id, o]) => [
        id,
        {
          card: o.card,
          owner: o.owner,
          faceDown: o.faceDown,
          foretold: o.foretoldTurn !== undefined,
        },
      ]),
    ),
    battlefield: state.battlefield,
    phased: state.phased,
    exile: state.exile,
    seats: state.seats,
  };
  return poolOfOtherSeat(flat, seat, (id) => controlled.has(id as ObjectId));
}
