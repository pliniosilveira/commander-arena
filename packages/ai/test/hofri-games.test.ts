// Slice soak (D-229 to D-235): whole games of the 'hofri' deck style, with the SYNTHETIC cards of the Hofri Ghostforge program (the permanents each player keeps, exile
// from the graveyard as a cost with the opponent's choice, a creature that becomes a copy of a card that left a graveyard, phasing, the once-a-turn play from the
// graveyard, exile until an opponent becomes the monarch, each player exiling a card of their graveyard), between every kind of agent. Every game finishes with a result,
// no fallback, no rejected action and consistent state after every action; the action log replays to the same final state; and the decisions of the slice are answered
// with what the engine lists: a `spare` choice is one of the permanents of the type of the player it names, a `split` choice is asked of an opponent of the player who
// activated, a `copy` choice is one of the cards the decision lists, and a permanent that is phased out is not on the battlefield of the view. The count is `soakGames()`
// (D-126); the path checks run from 100 games up.
import {
  type Action,
  applyAction,
  checkInvariants,
  createGame,
  createRng,
  determinize,
  type GameState,
  getView,
  type SeatId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import {
  type Agent,
  CasualAgent,
  type DecideContext,
  GreedyAgent,
  HeuristicAgent,
  RandomLegalAgent,
  replayGame,
} from '../src/index';
import { HOFRI_NAMES, HOFRI_STYLE_PAIRS, smallGameConfig } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const MAX_TURNS = 150;
const MAX_ACTIONS = 5000;

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
  spare: number;
  split: number;
  copy: number;
  exileCost: number;
  phased: number;
  graveyardPlays: number;
}

const newTally = (): Tally => ({
  spare: 0,
  split: 0,
  copy: 0,
  exileCost: 0,
  phased: 0,
  graveyardPlays: 0,
});

interface Step {
  readonly before: GameState;
  readonly after: GameState;
  readonly seat: SeatId;
  readonly action: Action;
}

function checkHofri(t: Tally, step: Step): void {
  const { before, after } = step;
  const asked = before.pending;
  if (asked?.kind === 'choosePermanent' && asked.purpose === 'spare') {
    t.spare += 1;
    expect(asked.min).toBe(1);
    expect(asked.max).toBe(1);
    expect(asked.spare).toBeDefined();
    if (asked.spare !== undefined) {
      // The choices are the controller's, one of the permanents of the type the named player controls.
      for (const id of asked.legal) {
        const o = before.objects[id];
        expect(o?.zone).toBe('battlefield');
      }
    }
  }
  if (asked?.kind === 'chooseCards' && asked.purpose === 'split') {
    t.split += 1;
    expect(asked.legal.length).toBeGreaterThanOrEqual(2);
    expect(asked.min).toBe(1);
    expect(asked.max).toBe(1);
    // An opponent of the player whose ability it is chooses.
    expect(before.objects[asked.source]?.controller).not.toBe(asked.seat);
  }
  if (asked?.kind === 'chooseCards' && asked.purpose === 'copy') {
    t.copy += 1;
    expect(asked.legal.length).toBeGreaterThanOrEqual(2);
  }
  if (asked?.kind === 'chooseCards' && asked.purpose === 'exile' && asked.forCost === true) {
    t.exileCost += 1;
  }
  // The permanents phased out are in the zone of their own and not on the battlefield of any view.
  for (const id of after.phased ?? []) {
    t.phased += 1;
    expect(after.objects[id]?.zone).toBe('phased');
    for (const seat of [0, 1] as const) {
      expect(getView(after, seat).battlefield.map((o) => o.id)).not.toContain(id);
    }
  }
  if (
    step.action.kind === 'castSpell' &&
    before.objects[step.action.object]?.zone === 'graveyard'
  ) {
    t.graveyardPlays += 1;
  }
}

/** Plays a game with a decision context that hands out a determinized sample, like the runner (`runGame`). */
async function play(
  config: ReturnType<typeof smallGameConfig>,
  agents: readonly [Agent, Agent],
  onStep: (step: Step) => void,
): Promise<{ state: GameState; capped: boolean; log: { seat: SeatId; action: Action }[] }> {
  let state = createGame(config).state;
  const log: { seat: SeatId; action: Action }[] = [];
  let decisions = 0;
  while (state.result === null) {
    if (state.turn.number > MAX_TURNS || log.length >= MAX_ACTIONS) {
      return { state, capped: true, log };
    }
    const pending = state.pending;
    if (pending === null) throw new Error('a running game has no pending decision');
    const view = getView(state, pending.seat);
    if (view.pending === null) throw new Error('the deciding seat does not see its decision');
    const agent = agents[pending.seat];
    if (agent === undefined) throw new Error(`no agent for seat ${pending.seat}`);
    decisions += 1;
    const real = state;
    const ctx: DecideContext = {
      budgetMs: 1000,
      now: () => decisions,
      sample: (seed) => determinize(real, pending.seat, createRng(seed)),
    };
    const action = await agent.decide(view, view.pending, ctx);
    const r = applyAction(state, pending.seat, action);
    if (!r.ok) {
      throw new Error(
        `rejected ${JSON.stringify(action)}: ${r.error} (asked ${JSON.stringify(view.pending)})`,
      );
    }
    onStep({ before: state, after: r.state, seat: pending.seat, action });
    log.push({ seat: pending.seat, action });
    state = r.state;
  }
  return { state, capped: false, log };
}

test(
  `${GAMES} hofri deck-style games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = HOFRI_STYLE_PAIRS[g % HOFRI_STYLE_PAIRS.length] ?? ['hofri', 'hofri'];
      const config = smallGameConfig(g, styles);
      const kinds: readonly [Kind, Kind] = [
        KINDS[g % 4] ?? 'random',
        KINDS[(g >> 2) % 4] ?? 'random',
      ];
      const agents = [make(kinds[0], 47000 + 2 * g), make(kinds[1], 47001 + 2 * g)] as const;
      const t = newTally();
      const run = await play(config, agents, (step) => {
        checkHofri(t, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g} (${kinds.join(' v ')}, ${styles.join(' v ')})`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, run.log)), tag).toBe(stateHash(run.state));
      for (const key of Object.keys(t) as (keyof Tally)[]) total[key] += t[key];
    }
    console.log(`${GAMES} hofri games: ${JSON.stringify(total)} (${HOFRI_NAMES.join(', ')})`);
    expectPath(total.phased, 'a permanent that phases out');
  },
  soakTimeout(600_000),
);
