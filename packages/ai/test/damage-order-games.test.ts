// Slice soak (D-191): whole games, started at the question, in which the order of prevention effects on a damage event is asked (CR 616.1, `chooseOption` with purpose
// 'replacement'), between every kind of agent, from three states built with the scenario DSL and the SYNTHETIC shields of the engine (a shield for you, a
// shield for any target, three sizes) and the damage to meet them (3 damage to you, burn, attackers): a random game never reaches two shields on one
// player with damage to meet them (the soak of the 'prevention' style never asked the question in 100 games), so the games begin there. Every game finishes with a result, no fallback, no rejected action and consistent state after
// every action; the action log replays to the same final state; and the rules of the question are restated from the state, apart from the engine: it
// goes to the player who would take the damage, its options are the effects that apply (two or more, with their keys in the order of the engine), the
// answer is one of them, a casual or greedy agent takes the first, damage of a combat step is not dealt before its questions are answered, and
// what an effect leads to is never more damage than is left of the event.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  type Action,
  applyAction,
  checkInvariants,
  type GameEvent,
  type GameState,
  stateHash,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import {
  type Agent,
  CasualAgent,
  GreedyAgent,
  HeuristicAgent,
  RandomLegalAgent,
} from '../src/index';
import { smallGameConfig, stepGame } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

/** Seat 1 casts `shields` on itself in seat 0's main phase (seat 0 holds `hand0` and `board0`); the game is left where the engine waits next. */
function opening(shields: readonly string[], hand0: readonly string[], board0: readonly string[]) {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield('Mountain', 'Mountain', 'Mountain', ...board0)
    .hand(...hand0)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(...shields.flatMap(() => ['Plains', 'Plains']))
    .hand(...shields)
    .at('precombatMain', { active: 0, priority: 1 })
    .build();
  for (const card of shields) {
    if (g.state.pending?.kind === 'priority' && g.deciding !== 1 && g.state.stack.length === 0) {
      g.pass();
    }
    const target = card.includes('Shield') ? [{ player: 1 } as const] : undefined;
    g.act(1).cast(`${card}[0]`, {
      pay: true,
      ...(target === undefined ? {} : { targets: target }),
    });
    g.passAll();
  }
  return g;
}

/**
 * The state a game starts from, by variant: the question is asked at once, so every game uses it. A shield for you of 3 and one of 5 and 3 damage to
 * you (cast by the player themself); the same shields and two attackers at that player, asked about when combat damage is dealt; three shields of 3, 2 and 5
 * and 6 damage from burn, which asks twice (CR 616.1f).
 */
function startState(variant: number): GameState {
  if (variant % 3 === 0) {
    const g = opening(
      ['SYNTHETIC Brace Three', 'SYNTHETIC Brace Five', 'SYNTHETIC Backdraft'],
      [],
      [],
    );
    return g.state;
  }
  if (variant % 3 === 1) {
    const g = opening(
      ['SYNTHETIC Shield Three', 'SYNTHETIC Shield Five'],
      [],
      ['SYNTHETIC Vanilla 3/3', 'SYNTHETIC Vanilla 2/2'],
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack(['SYNTHETIC Vanilla 3/3', 'SYNTHETIC Vanilla 2/2']);
    g.advanceTo('combatDamage');
    return g.state;
  }
  const g = opening(
    ['SYNTHETIC Shield Three', 'SYNTHETIC Shield Two', 'SYNTHETIC Shield Five'],
    ['SYNTHETIC Order Blast'],
    [],
  );
  g.act(0).cast('SYNTHETIC Order Blast', { pay: true, targets: [{ player: 1 }] });
  g.passAll();
  return g.state;
}

type Kind = 'random' | 'casual' | 'greedy' | 'heuristic';
const KINDS: readonly Kind[] = ['random', 'casual', 'greedy', 'heuristic'];

function make(kind: Kind, seed: number): Agent & { fallbacks: readonly unknown[] } {
  return kind === 'casual'
    ? new CasualAgent({ seed })
    : kind === 'greedy'
      ? new GreedyAgent({ seed })
      : kind === 'heuristic'
        ? new HeuristicAgent({ seed })
        : new RandomLegalAgent({ seed });
}

interface Tally {
  asked: number;
  spell: number;
  combat: number;
  rounds: number;
  firstByCasualOrGreedy: number;
  byKind: Map<Kind, number>;
  answeredByOptions: number;
}

const newTally = (): Tally => ({
  asked: 0,
  spell: 0,
  combat: 0,
  rounds: 0,
  firstByCasualOrGreedy: 0,
  byKind: new Map(),
  answeredByOptions: 0,
});

/** The step's checks of the rules of the question, from the states and the events alone. */
function note(
  tally: Tally,
  kinds: readonly [Kind, Kind],
  step: {
    before: GameState;
    seat: number;
    action: Action;
    after: GameState;
    events: readonly GameEvent[];
  },
): void {
  const asked = step.before.pending;
  if (asked?.kind !== 'chooseOption' || asked.purpose !== 'replacement') return;
  const q = asked.replacement;
  if (q?.event === undefined) throw new Error('a replacement question without its words');
  tally.asked += 1;
  if (q.event.combat) tally.combat += 1;
  else tally.spell += 1;
  // The affected player is asked, and answers.
  const to = q.event.to;
  expect(asked.seat).toBe(to.kind === 'player' ? to.seat : step.before.objects[to.id]?.controller);
  expect(step.seat).toBe(asked.seat);
  // Two or more effects apply, each with words, and the options are their keys.
  expect(asked.options.length).toBeGreaterThanOrEqual(2);
  expect(q.choices.map((c) => c.option)).toEqual(asked.options);
  expect(q.event.amount).toBeGreaterThan(0);
  for (const c of q.choices) {
    expect(c.text.startsWith('Prevent ')).toBe(true);
    // What an effect leads to never exceeds what is left of the damage, and prevents at most that much.
    expect(c.outcome.amount).toBeLessThanOrEqual(q.event.amount);
    expect(c.outcome.amount + c.outcome.prevented).toBe(q.event.amount);
  }
  // The answer is one of the options, and says so in the events.
  if (step.action.kind !== 'chooseOption')
    throw new Error(`a question answered with ${step.action.kind}`);
  expect(asked.options).toContain(step.action.option);
  tally.answeredByOptions += 1;
  const chosen = step.events.find((e) => e.kind === 'replacementChosen');
  expect(chosen).toMatchObject({
    kind: 'replacementChosen',
    seat: asked.seat,
    option: step.action.option,
  });
  const kind = kinds[step.seat] ?? 'random';
  tally.byKind.set(kind, (tally.byKind.get(kind) ?? 0) + 1);
  if (kind === 'casual' || kind === 'greedy') {
    // The first option: prevent first.
    expect(step.action.option).toBe(asked.options[0]);
    tally.firstByCasualOrGreedy += 1;
  }
  // A combat question is asked before any of its batch is dealt: the plan is in the decision, nothing was dealt in the step that asked it.
  if (q.event.combat) {
    expect(q.resume).toBeDefined();
    expect(q.resume?.assignments.length).toBeGreaterThan(0);
  } else {
    expect(q.resume).toBeUndefined();
  }
  // Another question for the same damage (CR 616.1f) shows as a chain of questions: count the rounds.
  if (step.after.pending?.kind === 'chooseOption' && step.after.pending.purpose === 'replacement') {
    tally.rounds += 1;
  }
}

test(
  `${GAMES} damage-order games run clean, replay exactly and use every path of the question`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const kinds: readonly [Kind, Kind] = [
        KINDS[g % 4] ?? 'random',
        KINDS[(g >> 2) % 4] ?? 'random',
      ];
      const start = startState(g);
      expect(start.pending?.kind, `game ${g} starts at the question`).toBe('chooseOption');
      const config = smallGameConfig(g);
      const agents = [make(kinds[0], 17000 + 2 * g), make(kinds[1], 17001 + 2 * g)] as const;
      const log: { seat: number; action: Action }[] = [];
      const tally = newTally();
      const run = await stepGame(
        config,
        agents,
        LIMITS,
        (step) => {
          log.push({ seat: step.seat, action: step.action });
          note(tally, kinds, step);
          const problems = checkInvariants(step.after);
          if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
        },
        start,
      );
      const tag = `game ${g} (${kinds.join(' v ')})`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      // The action log replays from the same start to the same state (every answer checked against the options the replay recomputes).
      let replayed = start;
      for (const { seat, action } of log) {
        const r = applyAction(replayed, seat, action);
        if (!r.ok) throw new Error(`${tag}: replay rejected ${action.kind}: ${r.error}`);
        replayed = r.state;
      }
      expect(stateHash(replayed), tag).toBe(stateHash(run.state));
      total.asked += tally.asked;
      total.spell += tally.spell;
      total.combat += tally.combat;
      total.rounds += tally.rounds;
      total.firstByCasualOrGreedy += tally.firstByCasualOrGreedy;
      total.answeredByOptions += tally.answeredByOptions;
      for (const [k, n] of tally.byKind) total.byKind.set(k, (total.byKind.get(k) ?? 0) + n);
    }
    console.log(
      `${GAMES} damage-order games: ${JSON.stringify({ ...total, byKind: Object.fromEntries(total.byKind) })}`,
    );
    expectPath(total.asked);
    expectPath(total.spell);
    expectPath(total.combat);
    expectPath(total.rounds);
    for (const kind of KINDS) expectPath(total.byKind.get(kind) ?? 0, kind);
  },
  soakTimeout(300_000),
);
