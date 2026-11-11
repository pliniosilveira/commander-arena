// Random games between decks of the M2 combat fixtures, played through the public API only.
// Combat decisions are answered from the decision (random attackers and targets, random blocks that
// respect menace, random legal damage divisions), the rest from getLegalActions. After every action
// the structural invariants hold, no action the driver built is rejected, and every game finishes.
import { describe, expect, test } from 'vitest';
import { checkInvariants, createGame, stateHash } from '../src/index';
import { combatDecks, playCombatGame } from './random-games';

const GAMES = 200;
const MAX_ACTIONS = 30_000;

describe('random combat games', () => {
  test(`${GAMES} seeded games finish with consistent states after every action`, () => {
    let combats = 0;
    let doubleBlocks = 0;
    let tramples = 0;
    let permanentAttacks = 0;
    const kinds = new Set<string>();
    for (let seed = 1; seed <= GAMES; seed += 1) {
      const start = createGame({
        seed,
        decks: combatDecks(),
        settings: { startingLife: 20 },
      }).state;
      const { state, log } = playCombatGame(start, seed * 31 + 7, MAX_ACTIONS, (s) => {
        const problems = checkInvariants(s);
        if (problems.length > 0) throw new Error(`seed ${seed}: ${problems.join('; ')}`);
      });
      expect(state.result, `seed ${seed} did not finish in ${MAX_ACTIONS} actions`).not.toBeNull();
      for (const entry of log) {
        kinds.add(entry.action.kind);
        if (entry.action.kind === 'declareAttackers' && entry.action.attacks.length > 0)
          combats += 1;
        if (
          entry.action.kind === 'declareAttackers' &&
          entry.action.attacks.some((a) => a.target.kind === 'permanent')
        ) {
          permanentAttacks += 1;
        }
        if (entry.action.kind === 'declareBlockers') {
          const perAttacker = new Map<string, number>();
          for (const b of entry.action.blocks)
            perAttacker.set(b.attacker, (perAttacker.get(b.attacker) ?? 0) + 1);
          if ([...perAttacker.values()].some((n) => n >= 2)) doubleBlocks += 1;
        }
        if (
          entry.action.kind === 'assignDamage' &&
          entry.action.assignments.some((a) => a.to.kind === 'player')
        ) {
          tramples += 1;
        }
      }
    }
    // The games really exercised combat: attacks, double blocks, trample splits, attacks on
    // planeswalkers and battles.
    expect(combats).toBeGreaterThan(GAMES);
    expect(doubleBlocks).toBeGreaterThan(0);
    expect(tramples).toBeGreaterThan(0);
    expect(permanentAttacks).toBeGreaterThan(0);
    expect(kinds.has('declareAttackers')).toBe(true);
    expect(kinds.has('declareBlockers')).toBe(true);
    expect(kinds.has('assignDamage')).toBe(true);
  }, 300_000);

  test('the same seed and the same answers give the same final state', () => {
    const run = () => {
      const start = createGame({
        seed: 12,
        decks: combatDecks(),
        settings: { startingLife: 20 },
      }).state;
      return playCombatGame(start, 99, MAX_ACTIONS).state;
    };
    expect(stateHash(run())).toBe(stateHash(run()));
  });
});
