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
import { counterBlocked } from './counter-prevention';
import { derive } from './derive';
import { discardPrompt } from './discard-cost';
import { discardOne } from './madness';
import { describeSearch } from './search-prompt';
import { matchesFilter } from './select';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type SearchInstruction = Extract<Instruction, { kind: 'search' }>;
type DiscardInstruction = Extract<Instruction, { kind: 'discard' }>;

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
): ObjectId[] {
  const scoped: ObjectFilter = { ...filter, zone: 'library' };
  const found: { id: ObjectId; name: string }[] = [];
  for (const id of getSeat(state, seat).library) {
    const obj = state.objects[id];
    if (obj !== undefined && matchesFilter(state, obj, scoped, { controller: seat, source })) {
      found.push({ id, name: derive(state, obj).name });
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
  to: 'battlefield' | 'hand' | 'graveyard',
  tapped: boolean,
): Instruction {
  return { kind: 'move', object, to, position: 'top', tapped, commanderChoice: null };
}

/**
 * The cards found, assigned to the destinations in the order the player chose them (the first
 * `count` to the first destination, and so on; `'rest'` takes what is left).
 */
function placeFound(
  search: SearchInstruction['search'],
  found: readonly ObjectId[],
): Instruction[] {
  const out: Instruction[] = [];
  let next = 0;
  for (const d of search.destinations) {
    const n = d.count === 'rest' ? found.length - next : d.count;
    for (const id of found.slice(next, next + n)) {
      out.push(moveInstruction(id, d.zone, d.tapped === true));
    }
    next += n;
  }
  return out;
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
    const legal = searchCandidates(state, seat, res.source, search.filter);
    // CR 701.23c: with nothing to find the player still searched (and shuffles if told to).
    if (legal.length === 0) {
      return done(state, [{ kind: 'librarySearched', seat, found: 0 }], shuffle);
    }
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
      min: hasStatedQuality(search.filter) ? 0 : Math.min(search.max, legal.length),
      max: Math.min(search.max, legal.length),
      reveal: search.reveal,
      prompt: describeSearch(search),
      // D-262: the answer is checked against the land types of the cards offered (`validCardsChoice`).
      ...(search.sharedLandType === true
        ? { shareLandType: Object.fromEntries(legal.map((id) => [id, landTypesOf(state, id)])) }
        : {}),
    };
    return { state, events: [], front: [], needs: decision };
  }
  const found = instruction.chosen;
  const events: GameEvent[] = [{ kind: 'librarySearched', seat, found: found.length }];
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
  return done(state, events, [...placeFound(search, found), ...shuffle]);
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
  const count = instruction.anyNumber === true ? hand.length : instruction.count;
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
    (anyNumber ? (hand.length === 0 ? [] : null) : hand.length <= count && !choice ? hand : null);
  if (chosen === null) {
    const max = Math.min(count, hand.length);
    const decision: Omit<ChooseCardsDecision, 'id'> = {
      kind: 'chooseCards',
      seat,
      source: res.object,
      purpose: 'discard',
      zone: 'hand',
      legal: hand,
      min: anyNumber ? 0 : choice ? 1 : count,
      max: anyNumber ? hand.length : choice ? max : count,
      reveal: true,
      prompt: anyNumber
        ? 'Discard any number of cards'
        : choice
          ? `${discardPrompt(max)}, or discard one card that matches instead`
          : discardPrompt(count),
      ...(choice ? { orSingle: alone } : {}),
    };
    return { state, events: [], front: [], needs: decision };
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
    if (wasSpell.has(id)) discardedSpells += 1;
  }
  // CR 701.50a (D-209): the creature that connives gets a +1/+1 counter for a nonland card discarded, if it is still there.
  if (instruction.conniver !== undefined && nonland && discardedCards > 0) {
    const conniver = next.objects[instruction.conniver];
    // D-1152 (CR 122.6, 101.2): a creature that can't have +1/+1 counters gets none.
    if (conniver?.zone === 'battlefield' && !counterBlocked(next, conniver, '+1/+1')) {
      next = patchObject(next, conniver.id, {
        counters: { ...conniver.counters, '+1/+1': (conniver.counters['+1/+1'] ?? 0) + 1 },
      });
      events.push({
        kind: 'counterAdded',
        object: conniver.id,
        counter: '+1/+1',
        count: 1,
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
      discardedInstantOrSorcery: discardedSpells,
      ...(discardedCards > 0 ? { discardedBy: [seat] } : {}),
    },
  };
}

/** A filter with any restriction is a "stated quality" (CR 701.23b); `{}` is "a card" (701.23d). */
function hasStatedQuality(filter: ObjectFilter): boolean {
  return Object.keys(filter).length > 0;
}
