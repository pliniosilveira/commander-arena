// Slice soak (D-194): whole games of the 'vote' deck style, with the SYNTHETIC Emissary Green (each player votes for profit or security whenever it attacks)
// and the three-option Ballot Rite (CR 701.38), between every kind of agent. The games are played here with a decision context that hands out a determinized
// sample like the runner does (`runGame`, A31), so the HeuristicAgent plays its votes out on a sample; the shared `stepGame` has none. Every game finishes with a
// result, no fallback, no rejected action and consistent state after every action; the action log replays to the same final state; and the rules of the slice are
// restated from the events and the state, apart from the engine: a vote is asked of one player at a time, starting with the controller and in turn order, each
// player votes once and for an option the decision offers, the decision carries exactly the votes cast so far, a casual or greedy agent follows its rule
// (the controller votes for the first option, another player for the option with the fewest votes), and when the last vote is in what the card does matches the
// tally (Treasure tokens twice the profit votes, counters on each creature of the controller equal to the security votes, life, cards and life lost for the rite).
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  type Action,
  applyAction,
  checkInvariants,
  createGame,
  createRng,
  determinize,
  type GameEvent,
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
import { smallGameConfig, VOTE_NAMES, VOTE_STYLE_PAIRS } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const MAX_TURNS = 150;
const MAX_ACTIONS = 5000;
const EMISSARY = 'SYNTHETIC Emissary Green';
const RITE = 'SYNTHETIC Ballot Rite';

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
  votes: number;
  controllerVotes: number;
  opponentVotes: number;
  completed: number;
  emissaryTallies: number;
  emissaryProfit: number;
  emissarySecurity: number;
  riteTallies: number;
  heuristicVotes: number;
}

const newTally = (): Tally => ({
  votes: 0,
  controllerVotes: 0,
  opponentVotes: 0,
  completed: 0,
  emissaryTallies: 0,
  emissaryProfit: 0,
  emissarySecurity: 0,
  riteTallies: 0,
  heuristicVotes: 0,
});

const add = (total: Tally, t: Tally): void => {
  for (const key of Object.keys(t) as (keyof Tally)[]) total[key] += t[key];
};

interface Step {
  readonly before: GameState;
  readonly after: GameState;
  readonly seat: SeatId;
  readonly action: Action;
  readonly events: readonly GameEvent[];
}

/** One vote of one resolution, tracked as the steps go by. */
interface OpenVote {
  readonly source: string;
  readonly sourceName: string;
  readonly controller: SeatId;
  readonly cast: { seat: SeatId; option: string }[];
  readonly options: readonly string[];
}

const isVote = (d: GameState['pending']): d is NonNullable<typeof d> & { kind: 'chooseOption' } =>
  d?.kind === 'chooseOption' && d.purpose === 'vote';

const treasuresOf = (s: GameState, seat: SeatId): number =>
  getView(s, seat).battlefield.filter((o) => o.controller === seat && o.name === 'Treasure').length;

/** The +1/+1 counters on each creature `seat` controls, in the order of the battlefield. */
const countersOf = (s: GameState, seat: SeatId): number[] =>
  getView(s, seat)
    .battlefield.filter((o) => o.controller === seat && o.types.includes('creature'))
    .map((o) => o.counters['+1/+1'] ?? 0);

/** The seats still in the game, in turn order starting from `from` (CR 701.38a). */
const orderFrom = (s: GameState, from: SeatId): SeatId[] =>
  s.seats.map((_, i) => (from + i) % s.seats.length).filter((i) => !s.seats[i]?.hasLost);

function checkVote(
  t: Tally,
  kinds: readonly [Kind, Kind],
  open: { current: OpenVote | null },
  step: Step,
): void {
  const { before, after, events } = step;
  const asked = before.pending;
  if (isVote(asked)) {
    const q = asked.vote;
    if (q === undefined) throw new Error('a vote decision without its question');
    t.votes += 1;
    if (open.current === null || open.current.source !== asked.source) {
      open.current = {
        source: asked.source,
        sourceName: asked.sourceName,
        controller: q.controller,
        cast: [],
        options: asked.options,
      };
      // The first voter is the controller of the effect (CR 701.38a: starting with a specified player).
      expect(asked.seat).toBe(q.controller);
    }
    const vote = open.current;
    // One player at a time, in turn order from the controller, none twice; the decision carries exactly the votes so far.
    const expected = orderFrom(before, vote.controller).find(
      (s) => !vote.cast.some((c) => c.seat === s),
    );
    expect(asked.seat).toBe(expected);
    expect(q.cast).toEqual(vote.cast);
    expect(step.seat).toBe(asked.seat);
    expect(step.action.kind).toBe('chooseOption');
    if (step.action.kind !== 'chooseOption') return;
    expect(asked.options).toContain(step.action.option);
    vote.cast.push({ seat: asked.seat, option: step.action.option });
    if (asked.seat === q.controller) t.controllerVotes += 1;
    else t.opponentVotes += 1;
    const kind = kinds[asked.seat];
    if (kind === 'heuristic') t.heuristicVotes += 1;
    // The rule of the casual and greedy agents (`casual-vote.ts`).
    if (kind === 'casual' || kind === 'greedy') {
      if (asked.seat === q.controller) {
        expect(step.action.option).toBe(asked.options[0]);
      } else {
        const counts = asked.options.map((o) => q.cast.filter((c) => c.option === o).length);
        const least = Math.min(...counts);
        const wanted = [...asked.options]
          .reverse()
          .find((o) => q.cast.filter((c) => c.option === o).length === least);
        expect(step.action.option).toBe(wanted);
      }
    }
    // The vote is logged as it is cast, once for each voter.
    const logged = events.filter((e) => e.kind === 'optionChosen' && e.purpose === 'vote');
    expect(logged).toHaveLength(1);
  }
  const vote = open.current;
  if (vote === null) return;
  if (isVote(after.pending) && after.pending.source === vote.source) return;
  // The last vote is in: everyone voted once, and the card did what the tally says.
  open.current = null;
  t.completed += 1;
  expect(vote.cast.map((c) => c.seat)).toEqual(orderFrom(before, vote.controller));
  const n = (option: string) => vote.cast.filter((c) => c.option === option).length;
  if (vote.sourceName === EMISSARY) {
    t.emissaryTallies += 1;
    t.emissaryProfit += n('profit');
    t.emissarySecurity += n('security');
    expect(treasuresOf(after, vote.controller) - treasuresOf(before, vote.controller)).toBe(
      2 * n('profit'),
    );
    const was = countersOf(before, vote.controller);
    const now = countersOf(after, vote.controller);
    expect(now).toHaveLength(was.length);
    const totalGrowth = now.reduce((a, b) => a + b, 0) - was.reduce((a, b) => a + b, 0);
    expect(totalGrowth).toBe(n('security') * was.length);
  } else if (vote.sourceName === RITE) {
    t.riteTallies += 1;
    const me = vote.controller;
    expect((after.seats[me]?.life ?? 0) - (before.seats[me]?.life ?? 0)).toBe(2 * n('gold'));
    for (const s of orderFrom(before, me).filter((x) => x !== me)) {
      expect((before.seats[s]?.life ?? 0) - (after.seats[s]?.life ?? 0)).toBe(n('ash'));
    }
    const library = before.seats[me]?.library.length ?? 0;
    expect((after.seats[me]?.hand.length ?? 0) - (before.seats[me]?.hand.length ?? 0)).toBe(
      Math.min(n('iron'), library),
    );
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
    onStep({ before: state, after: r.state, seat: pending.seat, action, events: r.events });
    log.push({ seat: pending.seat, action });
    state = r.state;
  }
  return { state, capped: false, log };
}

test(
  `${GAMES} vote deck-style games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = VOTE_STYLE_PAIRS[g % VOTE_STYLE_PAIRS.length] ?? ['vote', 'vote'];
      const config = smallGameConfig(g, styles);
      const kinds: readonly [Kind, Kind] = [
        KINDS[g % 4] ?? 'random',
        KINDS[(g >> 2) % 4] ?? 'random',
      ];
      const agents = [make(kinds[0], 41000 + 2 * g), make(kinds[1], 41001 + 2 * g)] as const;
      const t = newTally();
      const open: { current: OpenVote | null } = { current: null };
      const run = await play(config, agents, (step) => {
        checkVote(t, kinds, open, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g} (${kinds.join(' v ')}, ${styles.join(' v ')})`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      expect(open.current, `${tag}: a vote was left open`).toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, run.log)), tag).toBe(stateHash(run.state));
      add(total, t);
    }
    console.log(`${GAMES} vote games: ${JSON.stringify(total)} (${VOTE_NAMES.join(', ')})`);
    expectPath(total.votes, 'a vote');
    expectPath(total.controllerVotes, 'a vote of the controller');
    expectPath(total.opponentVotes, 'a vote of another player');
    expectPath(total.emissaryTallies, 'a finished vote of Emissary Green');
    expectPath(total.riteTallies, 'a finished vote of Ballot Rite');
    expectPath(total.heuristicVotes, 'a vote of the heuristic agent');
  },
  soakTimeout(600_000),
);
