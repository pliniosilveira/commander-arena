/**
 * Library search (CR 701.23) and discard (CR 701.9) as instructions of a resolving effect.
 *
 * - CR 701.23a, 701.23b: the searcher looks at every card in their library and may find fewer
 *   cards than the maximum when the description has a stated quality, so the choice has `min` 0.
 *   `legal` lists the matching cards sorted by name (then by id): the order of the library is
 *   something nobody may know (CR 401.2), and the list must not give it away.
 * - CR 701.23e: the found cards are revealed only if the effect says so.
 * - CR 701.24b: the found cards are put into their destinations first, so the shuffle that follows
 *   does not include them.
 * - CR 701.9a, 701.9b: a discard moves cards from the hand to the graveyard; by default the
 *   discarding player chooses which.
 */
import type { ObjectFilter } from '../ast/types';
import { LAND_TYPES } from '../characteristics';
import type { ObjectId, SeatId } from '../ids';
import { shuffle } from '../rng';
import type { ChooseCardsDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { getSeat, patchObject } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { withAuraEntries } from './aura-entry';
import { counterCountOn } from './counter-bonus';
import { counterBlocked } from './counter-prevention';
import { derive } from './derive';
import { discardPrompt } from './discard-cost';
import { searchTopLimit } from './global-statics';
import { discardOne } from './madness';
import { manaValueOfCost } from './mana-value';
import { describeSearch } from './search-prompt';
import { matchesFilter } from './select';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type SearchInstruction = Extract<Instruction, { kind: 'search' }>;
type DiscardInstruction = Extract<Instruction, { kind: 'discard' }>;
type SearchZone = 'graveyard' | 'hand' | 'library';

/**
 * Whether the search went through the library (`librarySearched`, `thisWay` `searched`). A search of the library alone always does; one of several zones ("your graveyard,
 * hand, and/or library", CR 701.23a) does unless the cards found came from the graveyard or the hand: "and/or" lets the player search only those zones. A search that finds nothing
 * searched all of them.
 */
function searchedLibrary(
  state: GameState,
  search: SearchInstruction['search'],
  found: readonly ObjectId[],
): boolean {
  const zones = search.zones;
  if (zones === undefined) return true;
  if (!zones.includes('library')) return false;
  if (found.length === 0) return true;
  return found.some((id) => state.objects[id]?.zone === 'library');
}

/** The numeric part of an object id ("o12" is 12), so the order is the order of creation. */
function idNumber(id: ObjectId): number {
  return Number(id.slice(1));
}

/**
 * The cards in `seat`'s library that match `filter`, in a fixed order that does not reveal the
 * library's order: by name, then by id.
 */
export function searchCandidates(
  state: GameState,
  seat: SeatId,
  source: ObjectId | null,
  filter: ObjectFilter,
  zones: readonly SearchZone[] = ['library'],
): ObjectId[] {
  const found: { id: ObjectId; name: string }[] = [];
  // CR 701.23, 614.1a (Aven Mindcensor): an opponent of the controller of such a permanent searches only the top cards of the library.
  const topOnly = searchTopLimit(state, seat);
  // CR 701.23a: the cards of every zone searched ("your graveyard, hand, and/or library") that match, in one list.
  for (const zone of zones) {
    const scoped: ObjectFilter = { ...filter, zone };
    const cards = getSeat(state, seat)[zone];
    for (const id of zone === 'library' && topOnly !== null ? cards.slice(0, topOnly) : cards) {
      const obj = state.objects[id];
      if (obj !== undefined && matchesFilter(state, obj, scoped, { controller: seat, source })) {
        found.push({ id, name: derive(state, obj).name });
      }
    }
  }
  found.sort((a, b) =>
    a.name === b.name ? idNumber(a.id) - idNumber(b.id) : a.name < b.name ? -1 : 1,
  );
  return found.map((f) => f.id);
}

/** The land types (CR 205.3i) a card in a library has. */
function landTypesOf(state: GameState, id: ObjectId): string[] {
  const obj = state.objects[id];
  return obj === undefined ? [] : derive(state, obj).subtypes.filter((s) => LAND_TYPES.includes(s));
}

function moveInstruction(
  object: ObjectId,
  to: 'battlefield' | 'hand' | 'graveyard' | 'library',
  tapped: boolean,
): Instruction {
  return { kind: 'move', object, to, position: 'top', tapped, commanderChoice: null };
}

/**
 * The cards found, assigned to the destinations in the order the player chose them (the first
 * `count` to the first destination, and so on; `'rest'` takes what is left). The cards for the top
 * of the library (D-405) are separate: they stay in the library, out of the shuffle, and are put
 * on top once it is done (CR 701.24b), the first one found ending on top.
 */
function placeFound(
  search: SearchInstruction['search'],
  found: readonly ObjectId[],
): { now: Instruction[]; onTop: ObjectId[] } {
  const now: Instruction[] = [];
  const onTop: ObjectId[] = [];
  let next = 0;
  for (const d of search.destinations) {
    const n = d.count === 'rest' ? found.length - next : d.count;
    for (const id of found.slice(next, next + n)) {
      if (d.zone === 'library') onTop.push(id);
      else now.push(moveInstruction(id, d.zone, d.tapped === true));
    }
    next += n;
  }
  return { now, onTop };
}

/**
 * CR 701.23: ask for the cards found, or (with the answer) reveal, move and shuffle. The searching
 * player is `instruction.seat`, who is not always the controller of the spell or ability (CR
 * 701.23a: "Its controller may search their library"): every question goes to them. A "may" search
 * first asks whether to search at all (CR 608.2d); the answer is recorded in `accepted`.
 */
export function runSearch(
  state: GameState,
  res: ResolutionContext,
  instruction: SearchInstruction,
): StepOutcome {
  const { search, seat } = instruction;
  const shuffle: Instruction[] = search.shuffle ? [{ kind: 'shuffle', seat }] : [];
  // CR 701.23i, 101.4 (`together`): what this player decided is held until the last player has; then the cards of every player who searched move and their libraries are shuffled, in
  // the order the players decided.
  const group = instruction.together;
  const hold = (accepted: boolean, cards: readonly ObjectId[]): StepOutcome => {
    if (group === undefined) throw new Error('A search with no group cannot be held');
    const held = [...group.held, { seat, accepted, chosen: cards }];
    const next = group.later[0];
    if (next !== undefined) {
      return done(
        state,
        [],
        [
          {
            ...instruction,
            seat: next,
            accepted: search.optional === true ? null : true,
            chosen: null,
            together: { later: group.later.slice(1), held },
          },
        ],
      );
    }
    const { together: _held, ...single } = instruction;
    return done(
      state,
      [],
      held
        .filter((h) => h.accepted)
        .map((h) => ({ ...single, seat: h.seat, accepted: true, chosen: h.chosen })),
    );
  };
  // A "may" search this player declined (only a player of a group stays at the head with `accepted` false).
  if (group !== undefined && instruction.accepted === false) return hold(false, []);
  if (instruction.accepted === null) {
    const info = sourceInfo(state, res.source);
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'confirmOptional',
        seat,
        source: res.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
        purpose: 'search',
      },
    };
  }
  if (instruction.chosen === null) {
    const legal = searchCandidates(state, seat, res.source, search.filter, search.zones);
    // CR 701.23c: with nothing to find the player still searched (and shuffles if told to).
    if (legal.length === 0 || search.max <= 0) {
      // CR 701.23c: in a group the player who searched and found nothing is held as one who found no card, and shuffles with the others.
      if (group !== undefined) return hold(true, []);
      // Lorehold group 1: the player searched, which "if you search your library this way" reads.
      const library = search.zones === undefined || search.zones.includes('library');
      return {
        ...done(state, library ? [{ kind: 'librarySearched', seat, found: 0 }] : [], shuffle),
        thisWay: library ? { searched: 1 } : {},
      };
    }
    const total = search.totalManaValue;
    const decision: Omit<ChooseCardsDecision, 'id'> = {
      kind: 'chooseCards',
      seat,
      source: res.object,
      purpose: 'search',
      zone: 'library',
      legal,
      // CR 701.23b: with a stated quality the player may find fewer, so `min` is 0. CR 701.23d: a
      // search "simply for a quantity of cards" ("a card", "three cards") must find that many, or
      // as many as the library holds.
      min:
        hasStatedQuality(search.filter) || total !== undefined || search.anyNumber === true
          ? 0
          : Math.min(search.max, legal.length),
      // CR 202.3: "any number of ... with total mana value N or less": as many as the library holds; the answer is checked against the total.
      // CR 701.23: "any number of creature cards": as many as the library holds, none included.
      max:
        total === undefined && search.anyNumber !== true
          ? Math.min(search.max, legal.length)
          : legal.length,
      reveal: search.reveal,
      prompt: describeSearch(search),
      // CR 202.3e: a card in a library has no X announced, so an {X} in its cost counts as 0 (`manaValueOfCost`).
      ...(total === undefined
        ? {}
        : {
            totalManaValue: {
              limit: total,
              values: Object.fromEntries(
                legal.map((id) => {
                  const card = state.objects[id];
                  return [
                    id,
                    card === undefined ? 0 : manaValueOfCost(derive(state, card).manaCost, card),
                  ];
                }),
              ),
            },
          }),
      // D-262: the answer is checked against the land types of the cards offered (`validCardsChoice`).
      ...(search.sharedLandType === true
        ? { shareLandType: Object.fromEntries(legal.map((id) => [id, landTypesOf(state, id)])) }
        : {}),
    };
    return { state, events: [], front: [], needs: decision };
  }
  if (group !== undefined) return hold(true, instruction.chosen);
  const found = instruction.chosen;
  // CR 701.23a: "found" counts the cards of the library alone for the event of a library search.
  const searched = searchedLibrary(state, search, found);
  const events: GameEvent[] = searched
    ? [
        {
          kind: 'librarySearched',
          seat,
          found:
            search.zones === undefined
              ? found.length
              : found.filter((id) => state.objects[id]?.zone === 'library').length,
        },
      ]
    : [];
  if (search.reveal && found.length > 0) {
    const cards = found.flatMap((id) => {
      const obj = state.objects[id];
      return obj?.card == null ? [] : [{ card: obj.card, name: derive(state, obj).name }];
    });
    events.push({
      kind: 'cardsRevealed',
      seat,
      cards: cards.map((c) => c.card),
      names: cards.map((c) => c.name),
      from: 'library',
    });
  }
  // CR 701.24b (D-405): "then shuffle and put that card on top": the shuffle leaves the found cards out, then they go on top (the last one first,
  // so the first found ends on top).
  const placed = placeFound(search, found);
  const shuffled: Instruction[] = search.shuffle
    ? [{ kind: 'shuffle', seat, ...(placed.onTop.length > 0 ? { keep: placed.onTop } : {}) }]
    : [];
  const top = [...placed.onTop].reverse().map((id) => moveInstruction(id, 'library', false));
  return {
    // CR 303.4f: an Aura found for the battlefield chooses what it enchants as it enters.
    ...done(state, events, [...withAuraEntries(state, placed.now), ...shuffled, ...top]),
    thisWay: searched ? { searched: 1 } : {},
  };
}

/** CR 701.9: the player chooses (unless the whole hand goes), then the cards go to the graveyard. */
export function runDiscard(
  state: GameState,
  res: ResolutionContext,
  instruction: DiscardInstruction,
): StepOutcome {
  const { seat } = instruction;
  const hand = getSeat(state, seat).hand;
  // D-151: "Discard any number of cards": as many as the hand holds may be chosen, none included.
  // CR 701.9a: "discards their hand": the whole hand as it is when this player's instruction comes up, so nothing is chosen.
  const count =
    instruction.anyNumber === true || instruction.hand === true
      ? hand.length
      : instruction.leave !== undefined
        ? // CR 701.9 (Magus of the Balance): all but the cards the player keeps.
          Math.max(0, hand.length - instruction.leave)
        : instruction.count;
  // D-139: "discard N cards unless you discard an artifact card": the cards of the hand the filter matches may be discarded alone.
  const alone =
    instruction.unless === undefined
      ? []
      : hand.filter((id) => {
          const card = state.objects[id];
          return (
            card !== undefined &&
            matchesFilter(
              state,
              card,
              { ...instruction.unless, zone: 'hand' },
              { controller: seat, source: res.source },
            )
          );
        });
  // Fewer cards than asked: the whole hand is discarded and there is nothing to choose, unless one card alone would do (and
  // another could then be kept).
  const choice = alone.length > 0 && hand.length > 1;
  const anyNumber = instruction.anyNumber === true;
  // CR 701.9, 107.1c: "discard up to N cards": none to N of the hand, the player's choice.
  const upTo = instruction.upTo === true;
  // CR 701.9b (D-209): "discard a card at random": the generator picks them, nobody chooses.
  let random: { readonly cards: readonly ObjectId[]; readonly rng: GameState['rng'] } | null = null;
  if (instruction.random === true && instruction.chosen === null) {
    const [shuffled, rng] = shuffle(hand, state.rng);
    random = { cards: shuffled.slice(0, count), rng };
  }
  // An empty hand has nothing to choose among; otherwise the player chooses how many (CR 701.9).
  const chosen =
    instruction.chosen ??
    random?.cards ??
    (anyNumber || upTo
      ? hand.length === 0
        ? []
        : null
      : instruction.leave !== undefined && count === 0
        ? []
        : hand.length <= count && !choice
          ? hand
          : null);
  if (chosen === null) {
    const max = Math.min(count, hand.length);
    const decision: Omit<ChooseCardsDecision, 'id'> = {
      kind: 'chooseCards',
      seat,
      source: res.object,
      purpose: 'discard',
      zone: 'hand',
      legal: hand,
      min: anyNumber || upTo ? 0 : choice ? 1 : count,
      max: anyNumber ? hand.length : upTo ? max : choice ? max : count,
      reveal: true,
      prompt: anyNumber
        ? 'Discard any number of cards'
        : upTo
          ? `Discard up to ${max === 1 ? 'a card' : `${max} cards`}`
          : choice
            ? `${discardPrompt(max)}, or discard one card that matches instead`
            : discardPrompt(count),
      ...(choice ? { orSingle: alone } : {}),
    };
    return { state, events: [], front: [], needs: decision };
  }
  // CR 101.4, 701.9 (`discard.together`): the choice of one of several players is held until the last has chosen; then every chosen card is discarded at once, each as an
  // instruction of its player that has its `chosen` set.
  const group = instruction.together;
  if (group !== undefined) {
    const held = [...group.held, { seat, cards: chosen }];
    const nextSeat = group.later[0];
    // CR 701.9b: a card at random is drawn now, so the generator moves on for the next player; the discards themselves wait for the last.
    const drawn = random === null ? state : { ...state, rng: random.rng };
    if (nextSeat !== undefined) {
      return done(
        drawn,
        [],
        [
          {
            ...instruction,
            seat: nextSeat,
            chosen: null,
            together: { later: group.later.slice(1), held },
          },
        ],
      );
    }
    const { together: _held, ...single } = instruction;
    return done(
      drawn,
      [],
      held.map((h) => ({ ...single, seat: h.seat, chosen: h.cards })),
    );
  }
  let next = random === null ? state : { ...state, rng: random.rng };
  const events: GameEvent[] = [];
  let discardedCards = 0;
  let discardedCreatures = 0;
  let discardedSpells = 0;
  const wasCreature = new Set(
    chosen.filter((id) => {
      const card = state.objects[id];
      return card?.zone === 'hand' && derive(state, card).types.includes('creature');
    }),
  );
  // D-358: "If you discarded an instant or sorcery card this way", read before the card leaves the hand.
  const wasSpell = new Set(
    chosen.filter((id) => {
      const card = state.objects[id];
      if (card?.zone !== 'hand') return false;
      const types = derive(state, card).types;
      return types.includes('instant') || types.includes('sorcery');
    }),
  );
  // CR 202.3 (Summon: Kujata): "that card's mana value", read before the card leaves the hand; the total of the cards discarded, as an {X} in the cost of a card in the hand counts 0.
  const discardedValue = chosen.reduce((total, id) => {
    const card = state.objects[id];
    return card?.zone === 'hand'
      ? total + manaValueOfCost(derive(state, card).manaCost, card)
      : total;
  }, 0);
  // Occult Epiphany (CR 205.2a): the card types of the cards discarded, read before they leave the hand; a card with two types counts for both.
  const discardedTypes = [
    ...new Set(
      chosen.flatMap((id) => {
        const card = state.objects[id];
        return card?.zone === 'hand' ? derive(state, card).types : [];
      }),
    ),
  ];
  // Federation Fleet group D (CR 603.12): the cards that are not lands, read before they leave the hand ("When you discard a nonland card this way").
  const wasNonland = new Set(
    chosen.filter((id) => {
      const card = state.objects[id];
      return card?.zone === 'hand' && !derive(state, card).types.includes('land');
    }),
  );
  let discardedNonlands = 0;
  // CR 701.50a (D-209): "if a nonland card is discarded this way", read before the card leaves the hand.
  const nonland = chosen.some((id) => {
    const card = state.objects[id];
    return card?.zone === 'hand' && !derive(state, card).types.includes('land');
  });
  for (const id of chosen) {
    if (next.objects[id]?.zone !== 'hand') continue;
    // CR 702.35a: a card with madness is exiled instead of going to the graveyard (`discardOne`).
    const discarded = discardOne(next, seat, id);
    // Only a move into the hand or library asks about a commander (CR 903.9b), never a discard.
    if (discarded === null) throw new Error('A discard asked for a decision');
    next = discarded.state;
    events.push(...discarded.events);
    discardedCards += 1;
    if (wasCreature.has(id)) discardedCreatures += 1;
    if (wasNonland.has(id)) discardedNonlands += 1;
    if (wasSpell.has(id)) discardedSpells += 1;
  }
  // CR 701.50a (D-209): the creature that connives gets a +1/+1 counter for a nonland card discarded, if it is still there.
  if (instruction.conniver !== undefined && nonland && discardedCards > 0) {
    const conniver = next.objects[instruction.conniver];
    // D-380 (CR 122.6, 101.2): a creature that can't have +1/+1 counters gets none.
    if (conniver?.zone === 'battlefield' && !counterBlocked(next, conniver, '+1/+1')) {
      const put = counterCountOn(next, conniver, '+1/+1', 1);
      next = patchObject(next, conniver.id, {
        counters: { ...conniver.counters, '+1/+1': (conniver.counters['+1/+1'] ?? 0) + put },
      });
      events.push({
        kind: 'counterAdded',
        object: conniver.id,
        counter: '+1/+1',
        count: put,
        by: instruction.seat,
      });
    }
  }
  // D-135: "if you do" counts the cards actually discarded (an empty hand discards nothing).
  return {
    ...done(next, events),
    performed: discardedCards,
    thisWay: {
      discarded: discardedCards,
      // D-210: "if a creature card was discarded this way", "each player who discarded a card this way".
      discardedCreature: discardedCreatures,
      discardedNoncreature: discardedCards - discardedCreatures,
      ...(discardedNonlands > 0 ? { discardedNonland: discardedNonlands } : {}),
      discardedInstantOrSorcery: discardedSpells,
      ...(discardedCards > 0 ? { discardedValue } : {}),
      ...(discardedCards > 0 ? { discardedTypes, discardedTypeCount: discardedTypes.length } : {}),
      // Issue 279: this player's own number; the resolution keeps the greatest of them (`stack.ts`).
      discardedMost: discardedCards,
      ...(discardedCards > 0 ? { discardedBy: [seat] } : {}),
      ...(instruction.hand === true ? { discardedHandBy: [seat] } : {}),
    },
  };
}

/** A filter with any restriction is a "stated quality" (CR 701.23b); `{}` is "a card" (701.23d). */
function hasStatedQuality(filter: ObjectFilter): boolean {
  return Object.keys(filter).length > 0;
}
