// Slice soak (D-203): whole games of the 'planeswalkers' deck style, with the SYNTHETIC planeswalkers of the engine (loyalty abilities of every shape, a [-X], an
// ultimate, statics and triggers, one that becomes a creature, one that adds mana), the Jace token makers (Empower Jace), the emblem rites, the life setter and
// the spells that take a planeswalker or its types away, between every kind of agent. The games are played with a decision context that hands out a determinized
// sample like the runner does (`runGame`, A31). Every game finishes with a result, no fallback, no rejected action and consistent state after every action; the
// action log replays to the same final state; and the rules of the slice are restated from the events and the state, apart from the engine: a loyalty ability is
// activated at most once for each permanent each turn (CR 606.3), in a main phase of its controller's turn with an empty stack (CR 606.3), and the loyalty
// counters change as its cost says (CR 606.4); no planeswalker stays on the battlefield with 0 loyalty after the state-based actions (CR 704.5i); the casual,
// greedy and heuristic agents activate loyalty abilities of their own planeswalkers; an emblem stays in the command zone of its owner for the rest of the game
// (CR 114.5). The count is `soakGames()` (D-126); the path checks run from 100 games up.
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
import { PLANESWALKER_NAMES, PLANESWALKER_STYLE_PAIRS, smallGameConfig } from './helpers';
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
  activations: number;
  byKind: Record<Kind, number>;
  plus: number;
  minus: number;
  zero: number;
  ultimates: number;
  tokens: number;
  emblems: number;
  attacksAtWalkers: number;
  walkersDied: number;
  commanderZoneEmblems: number;
}

const newTally = (): Tally => ({
  activations: 0,
  byKind: { random: 0, casual: 0, greedy: 0, heuristic: 0 },
  plus: 0,
  minus: 0,
  zero: 0,
  ultimates: 0,
  tokens: 0,
  emblems: 0,
  attacksAtWalkers: 0,
  walkersDied: 0,
  commanderZoneEmblems: 0,
});

const add = (total: Tally, t: Tally): void => {
  for (const key of Object.keys(t) as (keyof Tally)[]) {
    if (key === 'byKind') {
      for (const kind of KINDS) total.byKind[kind] += t.byKind[kind];
    } else total[key] += t[key];
  }
};

interface Step {
  readonly before: GameState;
  readonly after: GameState;
  readonly seat: SeatId;
  readonly action: Action;
  readonly events: readonly GameEvent[];
}

function checkWalkers(t: Tally, kinds: readonly [Kind, Kind], step: Step): void {
  const { before, after, events } = step;
  // A loyalty ability: activated at sorcery timing, once for each permanent each turn (CR 606.3), and its cost changes the loyalty (CR 606.4). The
  // activation is complete in the step that emits `abilityActivated` (the costs are paid then), so the checks are made there.
  for (const e of events) {
    if (e.kind !== 'abilityActivated') continue;
    const obj = before.objects[e.source];
    const view = getView(before, e.seat).battlefield.find((o) => o.id === e.source);
    const ability = view?.activated?.find((a) => a.abilityIndex === e.abilityIndex)?.ability;
    const symbol = ability?.cost.find((c) => c.kind === 'loyalty');
    if (obj === undefined || symbol === undefined || symbol.kind !== 'loyalty') continue;
    t.activations += 1;
    t.byKind[kinds[e.seat] ?? 'random'] += 1;
    expect(['precombatMain', 'postcombatMain']).toContain(before.turn.step);
    expect(before.turn.activeSeat).toBe(e.seat);
    expect(
      before.turnLog.activated.some((a) => a.object === obj.id && a.loyalty === true),
      'a second loyalty ability of one permanent in a turn',
    ).toBe(false);
    const loyaltyBefore = obj.counters.loyalty ?? 0;
    const objAfter = after.objects[obj.id];
    if (symbol.change === 'x') t.minus += 1;
    else if (symbol.change > 0) t.plus += 1;
    else if (symbol.change < 0) {
      t.minus += 1;
      if (-symbol.change >= 3 && loyaltyBefore + symbol.change <= 0) t.ultimates += 1;
    } else t.zero += 1;
    if (symbol.change !== 'x') {
      expect(objAfter?.counters.loyalty ?? 0).toBe(loyaltyBefore + symbol.change);
    }
  }
  for (const e of events) {
    if (e.kind === 'tokenCreated' && e.name === 'Jace') t.tokens += 1;
    if (e.kind === 'emblemCreated') t.emblems += 1;
    if (
      e.kind === 'zoneChanged' &&
      e.fromZone === 'battlefield' &&
      e.toZone === 'graveyard' &&
      before.objects[e.from]?.counters.loyalty === 0
    ) {
      t.walkersDied += 1;
    }
  }
  if (after.combat !== null) {
    for (const a of after.combat.attackers) {
      if (a.target.kind === 'permanent') t.attacksAtWalkers += 1;
    }
  }
  // CR 704.5i: after the state-based actions no planeswalker stays with 0 loyalty (a decision in the middle of them aside).
  if (after.pending?.kind === 'priority') {
    for (const view of getView(after, after.pending.seat).battlefield) {
      if (view.types.includes('planeswalker')) {
        expect(view.counters.loyalty ?? 0, `${view.name} at 0 loyalty`).toBeGreaterThan(0);
      }
    }
  }
  // CR 114.5: an emblem never leaves the command zone.
  for (const o of Object.values(before.objects)) {
    if (o.emblem === true) {
      expect(after.objects[o.id]?.zone, `emblem ${o.id}`).toBe('command');
      t.commanderZoneEmblems += 1;
    }
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
  `${GAMES} planeswalker deck-style games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = PLANESWALKER_STYLE_PAIRS[g % PLANESWALKER_STYLE_PAIRS.length] ?? [
        'planeswalkers',
        'planeswalkers',
      ];
      const config = smallGameConfig(g, styles);
      const kinds: readonly [Kind, Kind] = [
        KINDS[g % 4] ?? 'random',
        KINDS[(g >> 2) % 4] ?? 'random',
      ];
      const agents = [make(kinds[0], 47000 + 2 * g), make(kinds[1], 47001 + 2 * g)] as const;
      const t = newTally();
      const run = await play(config, agents, (step) => {
        checkWalkers(t, kinds, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g} (${kinds.join(' v ')}, ${styles.join(' v ')})`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, run.log)), tag).toBe(stateHash(run.state));
      add(total, t);
    }
    console.log(
      `${GAMES} planeswalker games: ${JSON.stringify(total)} (${PLANESWALKER_NAMES.length} cards)`,
    );
    expectPath(total.activations, 'a loyalty ability activated');
    expectPath(total.byKind.casual, 'a casual agent activating one');
    expectPath(total.byKind.greedy, 'a greedy agent activating one');
    expectPath(total.byKind.heuristic, 'a heuristic agent activating one');
    expectPath(total.plus, 'a [+N] ability');
    expectPath(total.minus, 'a [-N] ability');
    expectPath(total.zero, 'a [0] ability');
    expectPath(total.tokens, 'a Jace token');
    expectPath(total.emblems, 'an emblem');
    expectPath(total.attacksAtWalkers, 'an attack at a planeswalker');
  },
  soakTimeout(600_000),
);
