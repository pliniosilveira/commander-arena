// A 100-game soak of the search and discard slice: decks of library-search, discard and looting
// cards (the 'search' style of helpers.ts), a mirror match and both mixed ways, with random agents
// and, in half the games, the casual agent for seat 0. Every game finishes with a result, no
// fallback and no rejected action; replaying the action log gives the same final state; and every
// new decision path occurs: a search answered with none, one and several cards, searches with
// nothing to find, revealed searches, searches that shuffle and ones that do not, cards put onto
// the battlefield, into the hand and into the graveyard, discards by the controller and by the
// opponent, and discards of a whole hand without a question.
import {
  applyAction,
  checkInvariants,
  createGame,
  type GameEvent,
  type GameState,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, runGame } from '../src/index';
import { SEARCH_STYLE_PAIRS, smallGameConfig } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const MAX_TURNS = 150;
const MAX_ACTIONS = 5000;
const GAMES = soakGames();

interface Tally {
  searchAnswered0: number;
  searchAnswered1: number;
  searchAnswered2plus: number;
  searchNothingToFind: number;
  revealed: number;
  searchThenShuffle: number;
  searchWithoutShuffle: number;
  toBattlefield: number;
  toHand: number;
  toGraveyard: number;
  discardBySelf: number;
  discardByOpponent: number;
  discardWholeHand: number;
  casualSearches: number;
}

const newTally = (): Tally => ({
  searchAnswered0: 0,
  searchAnswered1: 0,
  searchAnswered2plus: 0,
  searchNothingToFind: 0,
  revealed: 0,
  searchThenShuffle: 0,
  searchWithoutShuffle: 0,
  toBattlefield: 0,
  toHand: 0,
  toGraveyard: 0,
  discardBySelf: 0,
  discardByOpponent: 0,
  discardWholeHand: 0,
  casualSearches: 0,
});

/** Replays the log through applyAction, noting what each action did. Returns the final state. */
function replayAndTally(
  config: ReturnType<typeof smallGameConfig>,
  log: readonly { seat: number; action: Parameters<typeof applyAction>[2] }[],
  tally: Tally,
  casualSeat: number | null,
): GameState {
  let state = createGame(config).state;
  for (const [index, entry] of log.entries()) {
    const before = state;
    const pending = before.pending;
    const applied = applyAction(before, entry.seat, entry.action);
    if (!applied.ok) throw new Error(`replay: action ${index} rejected: ${applied.error}`);
    state = applied.state;
    expect(checkInvariants(state), `invariants after action ${index}`).toEqual([]);
    noteBatch(before, pending?.kind ?? null, entry.action, applied.events, tally);
    if (
      pending?.kind === 'chooseCards' &&
      pending.purpose === 'search' &&
      pending.seat === casualSeat
    ) {
      tally.casualSearches += 1;
    }
  }
  return state;
}

function noteBatch(
  before: GameState,
  pendingKind: string | null,
  action: { kind: string; objects?: readonly string[] },
  events: readonly GameEvent[],
  tally: Tally,
): void {
  const pending = before.pending;
  if (pending?.kind === 'chooseCards' && action.kind === 'chooseCards') {
    const n = action.objects?.length ?? 0;
    if (pending.purpose === 'search') {
      if (n === 0) tally.searchAnswered0 += 1;
      else if (n === 1) tally.searchAnswered1 += 1;
      else tally.searchAnswered2plus += 1;
    } else {
      // The seat that discards is not always the controller of the spell or ability.
      const source = before.objects[pending.source];
      if (source !== undefined && source.controller !== pending.seat) tally.discardByOpponent += 1;
      else tally.discardBySelf += 1;
    }
  }
  const searched = events.findIndex((e) => e.kind === 'librarySearched');
  if (searched >= 0) {
    const e = events[searched];
    if (e?.kind === 'librarySearched' && e.found === 0 && pendingKind !== 'chooseCards') {
      tally.searchNothingToFind += 1;
    }
    const after = events.slice(searched);
    if (after.some((x) => x.kind === 'libraryShuffled')) tally.searchThenShuffle += 1;
    else tally.searchWithoutShuffle += 1;
    for (const x of after) {
      if (x.kind === 'cardsRevealed') tally.revealed += 1;
      if (x.kind === 'zoneChanged' && x.fromZone === 'library') {
        if (x.toZone === 'battlefield') tally.toBattlefield += 1;
        if (x.toZone === 'hand') tally.toHand += 1;
        if (x.toZone === 'graveyard') tally.toGraveyard += 1;
      }
    }
  }
  // A discard with no question: events say so, and the decision before was not one about cards.
  const discards = events.filter((e) => e.kind === 'discarded').length;
  if (discards > 0 && pendingKind !== 'chooseCards' && pendingKind !== 'discard') {
    tally.discardWholeHand += 1;
  }
}

test(
  `${GAMES} search-deck games finish cleanly, replay exactly, and exercise every search and discard path`,
  async () => {
    const total = newTally();
    let turns = 0;
    for (let g = 1; g <= GAMES; g += 1) {
      const config = smallGameConfig(
        g,
        SEARCH_STYLE_PAIRS[g % SEARCH_STYLE_PAIRS.length] ?? ['search', 'search'],
      );
      const casualSeat = g % 2 === 0 ? 0 : null;
      const random0 = new RandomLegalAgent({ seed: 3000 + 2 * g });
      const random1 = new RandomLegalAgent({ seed: 3001 + 2 * g });
      const casual0 = new CasualAgent({ seed: 3000 + 2 * g });
      const agents: readonly [Agent, Agent] = [casualSeat === 0 ? casual0 : random0, random1];
      const run = await runGame(config, agents, { maxTurns: MAX_TURNS, maxActions: MAX_ACTIONS });
      const tag = `game ${g}`;
      expect(run.reason, tag).toBe('result');
      expect(run.counters.fallbacks, tag).toBe(0);
      expect(run.counters.rejectedActions, tag).toBe(0);
      expect(run.agentErrors, tag).toEqual([]);
      expect(casual0.fallbacks, tag).toHaveLength(0);
      expect(random0.fallbacks, tag).toHaveLength(0);
      expect(random1.fallbacks, tag).toHaveLength(0);

      // Replay determinism: the same log rebuilds the same state, hash for hash.
      const replayed = replayAndTally(config, run.log, total, casualSeat);
      expect(stateHash(replayed), tag).toBe(stateHash(run.state));
      turns += run.state.turn.number;
    }

    console.log(
      `search soak: ${JSON.stringify({ ...total, meanTurns: Math.round(turns / GAMES) })}`,
    );
    for (const [key, value] of Object.entries(total)) {
      expectPath(value, `path "${key}" never occurred`);
    }
  },
  soakTimeout(240_000),
);
