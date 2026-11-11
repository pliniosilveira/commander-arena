// The differential test of the derive speed-up (M45, D-173). Seeded random games on static-heavy
// decks (lords, anthems, Auras, Equipment, copy effects, "loses all abilities", conditions) and on the
// combat decks are played step by step; after every step a fingerprint is taken of the derived
// characteristics of every object that is not in a library and the legal actions, and every fifth or tenth
// step of both players' views and the state hash. The fingerprints of a game are folded into one value per game and
// compared with `derive-digest.expected.json`, recorded with the implementation before the speed-up.
// Any change of what the engine computes, in any step of any game, changes the value.
//
// A second check guards the caches themselves: the recorded states are fingerprinted again in reverse
// order and in an interleaved order, and the answers must not depend on what was asked before.
//
// To record the file again after an intended change of behaviour (a new ENGINE_VERSION):
//   UPDATE_DERIVE_DIGESTS=1 pnpm exec vitest run packages/engine/test/derive-differential.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import type { GameObject, GameState } from '../src/index';
import { stateHash } from '../src/index';
import { derive } from '../src/rules/derive';
import { definitionOf } from '../src/state/ops';
import {
  boardStart,
  digestState,
  type Played,
  playFrom,
  playGame,
  soupDeck,
} from './derive-digest';
import { combatDecks } from './random-games';

const EXPECTED_FILE = new URL('./derive-digest.expected.json', import.meta.url);
const SOUP_GAMES = 3;
const COMBAT_GAMES = 1;
const BOARD_GAMES = 5;
const MAX_ACTIONS = 400;

interface GameFingerprint {
  readonly label: string;
  readonly steps: number;
  readonly peak: number;
  readonly digest: string;
}

function fingerprints(): {
  fingerprint: GameFingerprint;
  digests: string[];
  states: GameState[];
}[] {
  const games: { label: string; play: () => Played }[] = [];
  for (let i = 1; i <= SOUP_GAMES; i += 1) {
    games.push({
      label: `soup ${i}`,
      play: () => playGame(i, [soupDeck(i), soupDeck(i + 100)], MAX_ACTIONS),
    });
  }
  for (let i = 1; i <= COMBAT_GAMES; i += 1) {
    games.push({ label: `combat ${i}`, play: () => playGame(50 + i, combatDecks(), MAX_ACTIONS) });
  }
  for (let i = 1; i <= BOARD_GAMES; i += 1) {
    games.push({ label: `board ${i}`, play: () => playFrom(i, boardStart(i), MAX_ACTIONS) });
  }
  return games.map((g) => {
    const played = g.play();
    const digests = played.states.map((s, i) => digestState(s, i));
    return {
      fingerprint: {
        label: g.label,
        steps: played.states.length - 1,
        peak: played.peak,
        digest: stateHash(digests),
      },
      digests,
      states: played.states,
    };
  });
}

describe('derive differential', () => {
  const games = fingerprints();

  test('every game reproduces the fingerprints recorded before the speed-up', () => {
    const actual = games.map((g) => g.fingerprint);
    if (process.env.UPDATE_DERIVE_DIGESTS === '1') {
      writeFileSync(EXPECTED_FILE, `${JSON.stringify(actual, null, 2)}\n`);
    }
    const expected: GameFingerprint[] = JSON.parse(readFileSync(EXPECTED_FILE, 'utf8'));
    expect(actual).toEqual(expected);
  });

  test('the games reach boards with something for derive to do', () => {
    const peaks = games.map((g) => g.fingerprint.peak);
    expect(Math.max(...peaks)).toBeGreaterThanOrEqual(12);
    for (const g of games) expect(g.fingerprint.steps, g.fingerprint.label).toBeGreaterThan(30);
  });

  test('the games exercise static abilities, attachments and restrictions', () => {
    let changedPt = 0;
    let attached = 0;
    let restricted = 0;
    for (const g of games) {
      g.states.forEach((state, i) => {
        if (i % 4 !== 0) return;
        for (const id of state.battlefield) {
          const obj = state.objects[id] as GameObject;
          const d = derive(state, obj);
          const printed = obj.card === null ? null : definitionOf(state, obj.card).faces[obj.face];
          if (
            printed !== undefined &&
            printed !== null &&
            typeof printed.power === 'number' &&
            d.power !== printed.power
          ) {
            changedPt += 1;
          }
          if (d.attachments.length > 0) attached += 1;
          if (d.restrictions.length > 0 || d.blockLimits.length > 0) restricted += 1;
        }
      });
    }
    expect(changedPt).toBeGreaterThan(0);
    expect(attached).toBeGreaterThan(0);
    expect(restricted).toBeGreaterThan(0);
  });

  test('the answers do not depend on the order in which states are looked at', () => {
    for (const g of games.slice(0, 2)) {
      const states = g.states;
      const again = new Array<string>(states.length);
      // Backwards, then the even steps, then the odd ones: every state is asked about after many others.
      for (let i = states.length - 1; i >= 0; i -= 1) {
        again[i] = digestState(states[i] as GameState, i);
      }
      expect(again, g.fingerprint.label).toEqual(g.digests);
      const mixed = new Array<string>(states.length);
      for (const parity of [0, 1]) {
        for (let i = parity; i < states.length; i += 2) {
          mixed[i] = digestState(states[i] as GameState, i);
        }
      }
      expect(mixed, g.fingerprint.label).toEqual(g.digests);
    }
  });
});
