// Property tests (SPEC 12) on random games between RandomLegalAgents: invariants after every
// action, legal options at every decision, bounded length, determinism, replay and JSON round trip.
// Generated inputs are the game seed, both agent seeds and both deck mixes; fast-check prints the
// seed and the shrunk counterexample on failure.
import {
  type Action,
  applyAction,
  checkInvariants,
  type GameConfig,
  type GameState,
  getLegalActions,
  legalActionsForDecision,
  stateHash,
} from '@commander-arena/engine';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { RandomLegalAgent, replayGame, runGame } from '../src/index';
import {
  COMMANDERS,
  combatAnswerErrors,
  type DeckMix,
  deckFromMix,
  LANDS,
  type StepInfo,
  spellSlots,
  stepGame,
} from './helpers';

const LIMITS = { maxTurns: 150, maxActions: 5000 };

const mixOf = (pool: readonly string[]): fc.Arbitrary<DeckMix> =>
  fc.record({
    commander: fc.constantFrom(...COMMANDERS),
    lands: fc.array(fc.constantFrom(...LANDS), { minLength: 8, maxLength: 12 }),
    spells: fc.array(fc.constantFrom(...pool), { minLength: 10, maxLength: 14 }),
  });

/** The old spell mix, a creature-heavy mix and a keyword-creature mix of the fixtures (helpers). */
const deckMix: fc.Arbitrary<DeckMix> = fc.oneof(
  mixOf(spellSlots('spells')),
  mixOf(spellSlots('creatures')),
  mixOf(spellSlots('brawl')),
);

const seed32 = fc.integer({ min: 0, max: 2 ** 31 - 1 });

const gameInput = fc.record({
  seed: seed32,
  agentSeeds: fc.tuple(seed32, seed32),
  decks: fc.tuple(deckMix, deckMix),
});
type GameInput = {
  seed: number;
  agentSeeds: [number, number];
  decks: [DeckMix, DeckMix];
};

const configOf = (input: GameInput): GameConfig => ({
  seed: input.seed,
  decks: input.decks.map(deckFromMix),
});
const agentsOf = (input: GameInput) =>
  [
    new RandomLegalAgent({ seed: input.agentSeeds[0] }),
    new RandomLegalAgent({ seed: input.agentSeeds[1] }),
  ] as const;

/** Cards each owner brought, to check conservation against. */
const deckSizes = (config: GameConfig) => config.decks.map((d) => d.cards.length);

/** Every object that stands for a card, counted by owner across all zone lists. */
function cardsByOwner(state: GameState): number[] {
  const counts = state.seats.map(() => 0);
  const zoneLists = [
    ...state.seats.flatMap((s) => [s.library, s.hand, s.graveyard, s.command]),
    state.battlefield,
    state.exile,
    state.stack,
  ];
  for (const list of zoneLists) {
    for (const id of list) {
      const obj = state.objects[id];
      if (obj?.card !== null && obj !== undefined) counts[obj.owner] = (counts[obj.owner] ?? 0) + 1;
    }
  }
  return counts;
}

function checkStep(step: StepInfo, sizes: number[]): void {
  const { after, before, index } = step;
  const at = `after action ${index} (${step.action.kind} by seat ${step.seat})`;
  expect(checkInvariants(after), at).toEqual([]);
  expect(after.actionCount, at).toBe(before.actionCount + 1);

  // Each owner's cards are conserved across zones (tokens have no card and are not counted).
  expect(cardsByOwner(after), at).toEqual(sizes);

  // No negative counts anywhere.
  for (const seat of after.seats) {
    expect(seat.landsPlayedThisTurn, at).toBeGreaterThanOrEqual(0);
    expect(seat.mulligans, at).toBeGreaterThanOrEqual(0);
    expect(seat.poison, at).toBeGreaterThanOrEqual(0);
  }
  for (const obj of Object.values(after.objects)) {
    expect(obj.damage, at).toBeGreaterThanOrEqual(0);
    for (const n of Object.values(obj.counters)) expect(n, at).toBeGreaterThanOrEqual(0);
  }

  // The engine is waiting on exactly one decision, which has a real option.
  if (after.result !== null) {
    expect(after.pending, at).toBeNull();
    return;
  }
  const pending = after.pending;
  expect(pending, at).not.toBeNull();
  if (pending === null) return;
  const legal = legalActionsForDecision(pending);
  expect(legal.length, at).toBeGreaterThan(0);
  expect(
    legal.some((a: Action) => a.kind !== 'concede'),
    `${at}: ${pending.kind} offers only concede`,
  ).toBe(true);
  expect(getLegalActions(after, pending.seat), at).toEqual(legal);

  // Combat (CR 506-511): combat state exists only in the combat phase, attackers and damage are
  // decided by the active seat, blockers by the defending seat, and the decision matches the state.
  expect(
    after.combat === null || after.turn.phase === 'combat',
    `${at}: combat outside phase`,
  ).toBe(true);
  if (pending.kind === 'declareAttackers' || pending.kind === 'assignDamage') {
    expect(pending.seat, `${at}: ${pending.kind} seat`).toBe(after.turn.activeSeat);
  }
  if (pending.kind === 'declareBlockers') {
    expect(pending.seat, `${at}: declareBlockers seat`).not.toBe(after.turn.activeSeat);
    const declared = after.combat?.attackers.map((a) => a.object) ?? [];
    for (const a of pending.attackers) expect(declared, at).toContain(a.attacker);
  }
  if (
    pending.kind === 'declareAttackers' ||
    pending.kind === 'declareBlockers' ||
    pending.kind === 'assignDamage'
  ) {
    for (const action of legal) {
      expect(
        combatAnswerErrors(pending, action).length === 0 || action.kind === 'concede',
        at,
      ).toBe(true);
    }
  }
  for (const other of after.seats) {
    if (other.id !== pending.seat) expect(getLegalActions(after, other.id), at).toEqual([]);
  }
}

describe('random games between RandomLegalAgents', () => {
  test('invariants, conservation and legal options hold after every action; games end in the cap', async () => {
    await fc.assert(
      fc.asyncProperty(gameInput, async (input) => {
        const config = configOf(input);
        const sizes = deckSizes(config);
        const { state, capped } = await stepGame(config, agentsOf(input), LIMITS, (step) =>
          checkStep(step, sizes),
        );
        expect(capped).toBe(false);
        expect(state.result).not.toBeNull();
      }),
      { numRuns: 30 },
    );
  }, 120_000);

  test('every action the engine lists is accepted by applyAction', async () => {
    await fc.assert(
      fc.asyncProperty(gameInput, async (input) => {
        let offered = 0;
        await stepGame(configOf(input), agentsOf(input), LIMITS, ({ before }) => {
          const pending = before.pending;
          if (pending === null) return;
          for (const action of legalActionsForDecision(pending)) {
            const r = applyAction(before, pending.seat, action);
            offered += 1;
            expect(r.ok, `${pending.kind}: ${JSON.stringify(action)}`).toBe(true);
          }
        });
        expect(offered).toBeGreaterThan(0);
      }),
      { numRuns: 6 },
    );
  }, 120_000);

  test('the same seeds give the same final hash and the same log, twice', async () => {
    await fc.assert(
      fc.asyncProperty(gameInput, async (input) => {
        const config = configOf(input);
        const a = await runGame(config, agentsOf(input), LIMITS);
        const b = await runGame(config, agentsOf(input), LIMITS);
        expect(a.reason).toBe('result');
        expect(stateHash(a.state)).toBe(stateHash(b.state));
        expect(stateHash(a.log)).toBe(stateHash(b.log));
        expect(a.counters).toEqual(b.counters);
      }),
      { numRuns: 20 },
    );
  }, 120_000);

  test('different agent seeds change the game (the agent stream is not ignored)', async () => {
    const input = fc.sample(gameInput, { numRuns: 1, seed: 7 })[0] as GameInput;
    const config = configOf(input);
    const a = await runGame(
      config,
      [new RandomLegalAgent({ seed: 1 }), new RandomLegalAgent({ seed: 2 })],
      LIMITS,
    );
    const b = await runGame(
      config,
      [new RandomLegalAgent({ seed: 3 }), new RandomLegalAgent({ seed: 4 })],
      LIMITS,
    );
    expect(stateHash(a.log)).not.toBe(stateHash(b.log));
  });

  test('replayGame(config, log) reproduces the final hash', async () => {
    await fc.assert(
      fc.asyncProperty(gameInput, async (input) => {
        const config = configOf(input);
        const run = await runGame(config, agentsOf(input), LIMITS);
        const replayed = replayGame(config, run.log);
        expect(stateHash(replayed)).toBe(stateHash(run.state));
        expect(replayed.result).toEqual(run.result);
      }),
      { numRuns: 20 },
    );
  }, 120_000);

  test('a JSON round trip of a mid-game state keeps the hash and play continues identically', async () => {
    await fc.assert(
      fc.asyncProperty(gameInput, fc.integer({ min: 1, max: 600 }), async (input, cut) => {
        const config = configOf(input);
        // Play `cut` actions (or to the end), then freeze the state.
        const first = await stepGame(config, agentsOf(input), {
          maxTurns: LIMITS.maxTurns,
          maxActions: cut,
        });
        const frozen = first.state;
        const thawed: GameState = JSON.parse(JSON.stringify(frozen));
        expect(stateHash(thawed)).toBe(stateHash(frozen));
        expect(checkInvariants(thawed)).toEqual([]);
        if (frozen.result !== null) return;

        // Continue both with identical fresh agents. The agents are not the ones that played the
        // first part, but both continuations see the same agents, so they must agree exactly.
        const continueWith = (start: GameState) =>
          stepGame(
            config,
            agentsOf({ ...input, agentSeeds: [input.seed, cut] }),
            LIMITS,
            undefined,
            start,
          );
        const a = await continueWith(frozen);
        const b = await continueWith(thawed);
        expect(a.capped).toBe(false);
        expect(a.actions).toBe(b.actions);
        expect(stateHash(a.state)).toBe(stateHash(b.state));
      }),
      { numRuns: 25 },
    );
  }, 120_000);
});
