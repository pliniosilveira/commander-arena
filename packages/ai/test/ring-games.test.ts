// Slice soak (D-196): whole games of the 'ring' deck style, with the SYNTHETIC There and Back Again (the Saga of the Korvold deck, with its real wording), the
// Ring on its own (CR 701.54), its watcher and its condition, between every kind of agent. The games are played with a decision context that hands out a
// determinized sample like the runner does (`runGame`, A31). Every game finishes with a result, no fallback, no rejected action and consistent state after every
// action (the invariants include "a Ring-bearer is a permanent of a player the Ring tempted, one at most"); the action log replays to the same final state; and
// the rules of the slice are restated from the events and the state, apart from the engine: each time the Ring tempts a player the count goes up by one, the emblem
// is given on the first time, the Ring-bearer chosen is a creature of that player's (none when they control none) and is the Ring-bearer afterwards; a casual or
// greedy agent chooses the creature with the most power; a Ring-bearer is not blocked by a creature with greater power; the abilities of the Ring triggered as often
// as the level and the events say (a loot when the bearer attacks from two tempts, a sacrifice for each blocker from three, a loss of life when it connects from
// four); and no delayed sacrifice of the Ring outlives its combat. The count is `soakGames()` (D-126); the path checks run from 100 games up.
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
import { RING_NAMES, RING_STYLE_PAIRS, smallGameConfig } from './helpers';
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
  tempts: number;
  firstTempts: number;
  withoutCreature: number;
  asked: number;
  askedCasual: number;
  askedHeuristic: number;
  bearerAttacks: number;
  loots: number;
  blockedTriggers: number;
  drains: number;
  lostBearers: number;
  expectedLoots: number;
  expectedBlocked: number;
  expectedDrains: number;
}

const newTally = (): Tally => ({
  tempts: 0,
  firstTempts: 0,
  withoutCreature: 0,
  asked: 0,
  askedCasual: 0,
  askedHeuristic: 0,
  bearerAttacks: 0,
  loots: 0,
  blockedTriggers: 0,
  drains: 0,
  lostBearers: 0,
  expectedLoots: 0,
  expectedBlocked: 0,
  expectedDrains: 0,
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

const level = (s: GameState, seat: SeatId): number => s.seats[seat]?.ring?.tempted ?? 0;

/** The creatures on the battlefield, as the view of `seat` has them. */
const creaturesOf = (s: GameState, seat: SeatId) =>
  getView(s, seat).battlefield.filter((o) => o.controller === seat && o.types.includes('creature'));

const bearerOf = (s: GameState, seat: SeatId) =>
  getView(s, seat).battlefield.find((o) => o.ringBearer === seat);

function checkRing(t: Tally, kinds: readonly [Kind, Kind], step: Step): void {
  const { before, after, events } = step;
  // The question of the Ring: one of the creatures of the player; a casual or greedy agent takes the one with the most power.
  const asked = before.pending;
  if (asked?.kind === 'choosePermanent' && asked.purpose === 'ringBearer') {
    t.asked += 1;
    expect(asked.min).toBe(1);
    expect(asked.max).toBe(1);
    expect(asked.legal.length).toBeGreaterThanOrEqual(2);
    const mine = creaturesOf(before, asked.seat).map((o) => o.id);
    expect([...asked.legal].sort()).toEqual([...mine].sort());
    expect(step.action.kind).toBe('choosePermanents');
    if (step.action.kind === 'choosePermanents') {
      expect(step.action.objects).toHaveLength(1);
      const kind = kinds[asked.seat];
      const view = getView(before, asked.seat).battlefield;
      const power = (id: string) => view.find((o) => o.id === id)?.power ?? 0;
      const picked = step.action.objects[0] as string;
      if (kind === 'casual' || kind === 'greedy') {
        t.askedCasual += 1;
        expect(power(picked)).toBe(Math.max(...asked.legal.map(power)));
        // the first of the list on a tie
        const top = asked.legal.find((id) => power(id) === power(picked));
        expect(picked).toBe(top);
      }
      if (kind === 'heuristic') t.askedHeuristic += 1;
    }
  }
  // Each time the Ring tempts a player (CR 701.54a, 701.54c, 701.54d).
  for (const e of events) {
    if (e.kind !== 'ringTempted') continue;
    t.tempts += 1;
    expect(level(after, e.seat)).toBe(level(before, e.seat) + 1);
    expect(e.times).toBe(level(after, e.seat));
    expect(e.first).toBe(before.seats[e.seat]?.ring === undefined);
    if (e.first) t.firstTempts += 1;
    const creatures = creaturesOf(after, e.seat);
    if (e.bearer === null) {
      t.withoutCreature += 1;
      expect(creatures, 'no Ring-bearer chosen while a creature could be').toHaveLength(0);
      expect(bearerOf(after, e.seat)).toBeUndefined();
    } else {
      expect(creatures.map((o) => o.id)).toContain(e.bearer);
      expect(bearerOf(after, e.seat)?.id).toBe(e.bearer);
      // the designation of one creature only: the other creatures of the player are not Ring-bearers
      expect(creatures.filter((o) => o.ringBearer === e.seat)).toHaveLength(1);
    }
  }
  for (const e of events) if (e.kind === 'ringBearerLost') t.lostBearers += 1;
  // What the events say should have triggered, at the level of the player as it was before the events (CR 701.54c).
  const bearerBefore = (seat: SeatId) => bearerOf(before, seat);
  for (const e of events) {
    if (e.kind === 'attackersDeclared') {
      const b = bearerBefore(e.seat);
      if (b !== undefined && e.attackers.some((a) => a.object === b.id)) {
        t.bearerAttacks += 1;
        if (level(before, e.seat) >= 2) t.expectedLoots += 1;
      }
    } else if (e.kind === 'blockersDeclared') {
      for (const block of e.blocks) {
        for (const seat of [0, 1] as const) {
          const b = bearerBefore(seat);
          if (b === undefined || b.id !== block.attacker) continue;
          // CR 701.54c: a creature with greater power does not block the Ring-bearer
          const blocker = getView(before, seat).battlefield.find((o) => o.id === block.blocker);
          expect(blocker?.power ?? 0).toBeLessThanOrEqual(b.power ?? 0);
          if (level(before, seat) >= 3) t.expectedBlocked += 1;
        }
      }
    } else if (e.kind === 'damageDealt') {
      if (!e.combat || e.amount <= 0 || e.to.kind !== 'player') continue;
      for (const seat of [0, 1] as const) {
        const b = bearerBefore(seat);
        if (b !== undefined && b.id === e.source && level(before, seat) >= 4) {
          t.expectedDrains += 1;
        }
      }
    } else if (e.kind === 'abilityTriggered') {
      const inherent = after.objects[e.stackObject]?.stack?.inherent;
      if (inherent === undefined || !inherent.startsWith('ring')) continue;
      const need = inherent === 'ringLoot' ? 2 : inherent === 'ringBlocked' ? 3 : 4;
      expect(level(after, e.seat), `${inherent} before its level`).toBeGreaterThanOrEqual(need);
      if (inherent === 'ringLoot') t.loots += 1;
      else if (inherent === 'ringBlocked') t.blockedTriggers += 1;
      else t.drains += 1;
    }
  }
  // CR 603.7: the sacrifice of the Ring's third ability waits for the end of combat and does not outlive its combat.
  if (['postcombatMain', 'end', 'cleanup'].includes(after.turn.step)) {
    expect(
      after.delayedTriggers.filter(
        (d) => d.ability.trigger.kind === 'step' && d.ability.trigger.step === 'combatEnd',
      ),
    ).toHaveLength(0);
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
  `${GAMES} ring deck-style games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = RING_STYLE_PAIRS[g % RING_STYLE_PAIRS.length] ?? ['ring', 'ring'];
      const config = smallGameConfig(g, styles);
      const kinds: readonly [Kind, Kind] = [
        KINDS[g % 4] ?? 'random',
        KINDS[(g >> 2) % 4] ?? 'random',
      ];
      const agents = [make(kinds[0], 43000 + 2 * g), make(kinds[1], 43001 + 2 * g)] as const;
      const t = newTally();
      const run = await play(config, agents, (step) => {
        checkRing(t, kinds, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g} (${kinds.join(' v ')}, ${styles.join(' v ')})`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      // Every trigger the events asked for went on the stack, but for one a game that ended first never put there.
      expect(t.loots, `${tag}: loots`).toBeLessThanOrEqual(t.expectedLoots);
      expect(t.expectedLoots - t.loots, `${tag}: loots`).toBeLessThanOrEqual(1);
      expect(t.blockedTriggers, `${tag}: blocked`).toBeLessThanOrEqual(t.expectedBlocked);
      expect(t.expectedBlocked - t.blockedTriggers, `${tag}: blocked`).toBeLessThanOrEqual(2);
      expect(t.drains, `${tag}: drains`).toBeLessThanOrEqual(t.expectedDrains);
      expect(t.expectedDrains - t.drains, `${tag}: drains`).toBeLessThanOrEqual(1);
      expect(stateHash(replayGame(config, run.log)), tag).toBe(stateHash(run.state));
      add(total, t);
    }
    console.log(`${GAMES} ring games: ${JSON.stringify(total)} (${RING_NAMES.join(', ')})`);
    expectPath(total.tempts, 'the Ring tempting a player');
    expectPath(total.firstTempts, 'the first time the Ring tempts a player');
    expectPath(total.asked, 'the question which creature is the Ring-bearer');
    expectPath(total.askedCasual, 'a casual or greedy answer to it');
    expectPath(total.askedHeuristic, 'a heuristic answer to it');
    expectPath(total.bearerAttacks, 'a Ring-bearer attacking');
    expectPath(total.loots, 'the loot of a Ring-bearer that attacks');
    expectPath(total.blockedTriggers, 'the sacrifice of a creature that blocks the Ring-bearer');
    expectPath(total.drains, 'the life loss of a Ring-bearer that connects');
    expectPath(total.lostBearers, 'a Ring-bearer that stopped being one');
  },
  soakTimeout(600_000),
);
