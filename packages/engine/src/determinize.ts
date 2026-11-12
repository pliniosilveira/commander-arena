/**
 * Determinization (SPEC 9, A10, A31, D-161): a sampled copy of the game for the seat that is deciding, in which
 * everything that seat cannot know has been drawn again at random. A search agent plays the copy forward with
 * `applyAction` and so learns nothing the viewer does not already know.
 *
 * What is re-drawn, for the viewer `v` (the rest of the state is copied as it is):
 * - every other seat's hand and library, and its cards in exile that `v` may not look at (foretold, Hideaway:
 *   `isFaceDownTo`): the cards of all those slots are pooled per seat and dealt back into the same slots, so the
 *   counts of every zone are unchanged and the multiset of cards of the pool is too. Because the cards of a deck
 *   are known to the AI (its initial decklist, A31), the pool "decklist minus public cards" is exactly this
 *   multiset, so no decklist input is needed. A foretold slot only receives a card with a foretell cost (the
 *   viewer knows it was foretold, CR 702.143a);
 * - the order of every library, `v`'s own included (CR 401.2: nobody knows it), except what the viewer is looking
 *   at: the top card while a permanent lets them look (CR 401.5), and the cards of their own pending
 *   `chooseCards` or `arrangeCards` decision, whose identity they know (a scry keeps its cards on top);
 * - the seed and the PRNG of the state, and of the snapshot a casting transaction holds, which would otherwise
 *   hand over the real shuffles: they are replaced by values drawn from `rng`.
 *
 * Commander cards (CR 903.3) are public, so they are not pooled; their object stays in its slot. Object ids
 * encode a card's position in the decklist (an object created at setup has the number of its card, see
 * `rules/setup.ts`), so a hidden slot keeps its id and receives another card: the id then says nothing about
 * what the slot held. A library keeps its ids and is only reordered.
 *
 * Not kept: what the viewer learned earlier and the state does not record (a card another player revealed, a
 * card they scried to the top). Pure: the input is not changed and only `rng` is drawn from.
 */
import type { CardId, ObjectId, SeatId } from './ids';
import { createRng, nextInt, nextUint32, shuffle } from './rng/index';
import type { RngState } from './rng/types';
import { isCommanderCardId } from './rules/melded';
import { foretellCostOf } from './rules/special-legality';
import { topCardVisibleTo } from './rules/statics';
import { definitionOf, getObject } from './state/ops';
import type { GameObject, GameState, SeatState } from './state/types';
import { isFaceDownTo } from './view';

/** The objects whose identity the viewer knows now, and the library cards whose place it knows too. */
function whatViewerKnows(
  state: GameState,
  viewer: SeatId,
): { known: Set<ObjectId>; placed: Set<ObjectId> } {
  const known = new Set<ObjectId>();
  const placed = new Set<ObjectId>();
  const top = topCardVisibleTo(state, viewer);
  if (top !== null) {
    known.add(top);
    placed.add(top);
  }
  const d = state.pending;
  if (d !== null && d.seat === viewer) {
    if (d.kind === 'chooseCards') for (const id of d.legal) known.add(id);
    if (d.kind === 'arrangeCards') {
      for (const id of d.cards) {
        known.add(id);
        placed.add(id);
      }
    }
  }
  return { known, placed };
}

function hasForetell(state: GameState, card: CardId): boolean {
  return foretellCostOf(definitionOf(state, card).faces[0] ?? null) !== null;
}

/** Deals the pooled cards of one seat back into its slots; returns the objects that changed. */
function redealCards(
  state: GameState,
  seat: SeatState,
  viewer: SeatId,
  known: ReadonlySet<ObjectId>,
  rng: RngState,
): { changed: Map<ObjectId, GameObject>; rng: RngState } {
  const hidden = (id: ObjectId): boolean => {
    const obj = getObject(state, id);
    // A card in a hand or a library is one card, never a melded permanent (D-277).
    return obj.card !== null && !known.has(id) && !isCommanderCardId(state, obj.card);
  };
  const hiddenExile = state.exile.filter((id) => {
    const obj = getObject(state, id);
    return obj.owner === seat.id && isFaceDownTo(state, obj, viewer) && hidden(id);
  });
  const slots = [
    ...(seat.id === viewer ? [] : seat.hand.filter(hidden)),
    ...seat.library.filter(hidden),
    ...hiddenExile,
  ];
  const changed = new Map<ObjectId, GameObject>();
  // With one hand-and-library pool and no card in exile the dealing is a plain shuffle; the viewer's own library
  // has no other slot, and its order is shuffled below, so its cards stay where they are.
  if (slots.length === 0 || (seat.id === viewer && hiddenExile.length === 0)) {
    return { changed, rng };
  }
  let pool = slots.map((id) => getObject(state, id).card as CardId);
  const dealt = new Map<ObjectId, CardId>();
  let r = rng;
  // A foretold card is one with a foretell cost (CR 702.143a): the viewer knows that much about it.
  for (const id of hiddenExile) {
    if (getObject(state, id).foretoldTurn === undefined) continue;
    const fits = pool.flatMap((c, i) => (hasForetell(state, c) ? [i] : []));
    if (fits.length === 0) continue;
    const [pick, next] = nextInt(r, fits.length);
    r = next;
    const at = fits[pick] as number;
    dealt.set(id, pool[at] as CardId);
    pool = pool.filter((_, i) => i !== at);
  }
  const open = slots.filter((id) => !dealt.has(id));
  const [mixed, next] = shuffle(pool, r);
  r = next;
  for (const [i, id] of open.entries()) dealt.set(id, mixed[i] as CardId);
  for (const [id, card] of dealt) {
    const obj = getObject(state, id);
    if (obj.card !== card) changed.set(id, { ...obj, card });
  }
  return { changed, rng: r };
}

/** A library with its cards reordered at random, except the ones whose place the viewer knows. */
function reorderLibrary(
  library: readonly ObjectId[],
  placed: ReadonlySet<ObjectId>,
  rng: RngState,
): { library: ObjectId[]; rng: RngState } {
  const free = library.flatMap((id, i) => (placed.has(id) ? [] : [i]));
  const [mixed, next] = shuffle(
    free.map((i) => library[i] as ObjectId),
    rng,
  );
  const out = library.slice();
  free.forEach((at, i) => {
    out[at] = mixed[i] as ObjectId;
  });
  return { library: out, rng: next };
}

/** The sample of one state (its casting snapshot included). */
function sample(state: GameState, viewer: SeatId, rng: RngState): GameState {
  const [seedWord, r0] = nextUint32(rng);
  const [rngWord, r1] = nextUint32(r0);
  const [snapshotWord, r2] = nextUint32(r1);
  const { known, placed } = whatViewerKnows(state, viewer);
  let r = r2;
  const objects = { ...state.objects };
  const seats = state.seats.map((seat) => {
    const dealt = redealCards(state, seat, viewer, known, r);
    r = dealt.rng;
    for (const [id, obj] of dealt.changed) objects[id] = obj;
    const order = reorderLibrary(seat.library, placed, r);
    r = order.rng;
    return { ...seat, library: order.library };
  });
  const casting =
    state.casting === null
      ? null
      : {
          ...state.casting,
          snapshot: sample(state.casting.snapshot, viewer, createRng(snapshotWord)),
        };
  return { ...state, objects, seats, casting, seed: seedWord, rng: createRng(rngWord) };
}

/**
 * A determinized copy of `state` for `viewer` (see the header): what the viewer cannot know is drawn again with
 * `rng`, which is the only source of randomness, and the state's own `rng` and `seed` are replaced. The same
 * `rng` gives the same copy; the input is not changed.
 */
export function determinize(state: GameState, viewer: SeatId, rng: RngState): GameState {
  return sample(state, viewer, rng);
}
