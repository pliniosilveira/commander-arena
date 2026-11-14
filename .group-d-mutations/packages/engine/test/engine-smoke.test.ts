// First end-to-end check of the engine: random legal play through the public API only.
import { describe, expect, test } from 'vitest';
import {
  type Action,
  applyAction,
  createGame,
  type DeckConfig,
  deckOf,
  fixtureCard,
  type GameState,
  getLegalActions,
  stateHash,
} from '../src/index';
import { deckA, lcg } from './random-games';

function deckB(): DeckConfig {
  const cards = deckOf([
    ['Yargle, Glutton of Urborg', 1],
    ['Swamp', 30],
    ['Island', 8],
    ['Mountain', 6],
    ['Llanowar Elves', 10],
    ['Grizzly Bears', 10],
    ['Counterspell', 8],
    ['Murder', 10],
    ['Lightning Bolt', 10],
    ['Forest', 6],
  ]);
  return { cards, commanders: [0] };
}

function playRandomGame(seed: number, maxActions = 20_000) {
  const pick = lcg(seed * 7919 + 1);
  const created = createGame({ seed, decks: [deckA(), deckB()] });
  let state: GameState = created.state;
  const log: { seat: number; action: Action }[] = [];
  for (let i = 0; i < maxActions && !state.result; i += 1) {
    const d = state.pending;
    if (d === null) throw new Error('no pending decision in a running game');
    const legal = getLegalActions(state, d.seat).filter((a) => a.kind !== 'concede');
    if (legal.length === 0) throw new Error(`no legal action for ${d.kind} at action ${i}`);
    const action = legal[pick(legal.length)] as Action;
    const r = applyAction(state, d.seat, action);
    if (!r.ok) throw new Error(`legal action rejected: ${JSON.stringify(action)}: ${r.error}`);
    state = r.state;
    log.push({ seat: d.seat, action });
  }
  return { state, log };
}

// A whole random game is thousands of actions, and the second test below plays two of them. Alone
// they pass in time, but with the whole suite running in parallel the default 5 s limit is not
// enough. The games and the assertions stay as they are; only the limit is raised.
const GAME_TIMEOUT_MS = 30_000;

describe('engine smoke', () => {
  test(
    'a random game runs to completion with the public API',
    () => {
      const { state } = playRandomGame(1);
      expect(state.result).not.toBeNull();
    },
    GAME_TIMEOUT_MS,
  );

  test(
    'the same seed and actions give the same final hash',
    () => {
      const a = playRandomGame(5);
      const b = playRandomGame(5);
      expect(stateHash(a.state)).toBe(stateHash(b.state));
    },
    GAME_TIMEOUT_MS,
  );

  test(
    'state stays JSON round-trippable',
    () => {
      const { state } = playRandomGame(3);
      expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    },
    GAME_TIMEOUT_MS,
  );

  test('fixture sanity', () => {
    expect(fixtureCard('Plains').faces[0]?.types).toContain('land');
  });
});
