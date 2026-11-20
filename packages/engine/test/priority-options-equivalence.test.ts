// Regression digest of the legal actions at every decision of whole seeded games (priority options
// included). It was recorded on the code BEFORE the speed-up of `priorityOptions`/the cast legality
// checks; a speed change must not change one option nor their order, so the digests must stay as
// they are. A different digest means a behaviour change: fix the code, do not regenerate the digest.
import { describe, expect, test } from 'vitest';
import { applyAction, createGame, getLegalActions } from '../src/index';
import {
  answerFromDecision,
  combatDecks,
  firstPolicy,
  lcg,
  newGame,
  type Policy,
  randomPolicy,
} from './random-games';

/** FNV-1a over the JSON of each decision's legal actions: order and content both count. */
function digestOf(play: (onDecision: (legal: unknown) => void) => number) {
  let h = 0x811c9dc5;
  const feed = (text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  const decisions = play((legal) => feed(JSON.stringify(legal)));
  return `${decisions}:${h.toString(16)}`;
}

function playPolicy(seed: number, policy: Policy, max: number) {
  return digestOf((onDecision) => {
    let state = newGame(seed);
    let n = 0;
    for (; n < max && !state.result; n += 1) {
      const d = state.pending;
      if (d === null) throw new Error('no pending decision');
      const all = getLegalActions(state, d.seat);
      onDecision(all);
      const legal = all.filter((a) => a.kind !== 'concede');
      const r = applyAction(state, d.seat, policy(legal));
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    return n;
  });
}

function playCombat(seed: number, max: number) {
  return digestOf((onDecision) => {
    const pick = lcg(seed);
    let state = createGame({ seed, decks: combatDecks() }).state;
    let n = 0;
    for (; n < max && !state.result; n += 1) {
      const d = state.pending;
      if (d === null) throw new Error('no pending decision');
      const all = getLegalActions(state, d.seat);
      onDecision(all);
      const action =
        answerFromDecision(d, pick) ??
        (all.filter((a) => a.kind !== 'concede')[pick(all.length - 1)] as never);
      const r = applyAction(state, d.seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    return n;
  });
}

describe('legal actions of whole games are unchanged by the priority-options speed-up', () => {
  test('first-legal policy (pass until decked)', () => {
    expect([1, 2].map((s) => playPolicy(s, firstPolicy, 20_000))).toEqual(EXPECTED.first);
  }, 120_000);
  test('random policy (lands, mana, spells, stack)', () => {
    expect([1, 2, 3, 4].map((s) => playPolicy(s, randomPolicy(s * 7), 3_000))).toEqual(
      EXPECTED.random,
    );
  }, 120_000);
  test('combat decks, random answers', () => {
    expect([11, 12, 13].map((s) => playCombat(s, 3_000))).toEqual(EXPECTED.combat);
  }, 120_000);
});

const EXPECTED = {
  first: ['3148:ad962fc6', '3148:fb531b68'],
  random: ['2985:2fd4b553', '3000:e9d44e84', '2457:ab88488f', '3000:99b4f3b0'],
  combat: ['1646:e64cea32', '3000:91e30d60', '561:7c577463'],
};
