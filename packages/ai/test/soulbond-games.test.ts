// Slice soak (D-286, D-284): whole games of the 'soulbond' deck style, with the SYNTHETIC soulbond creatures (the keyword alone, the Seraph's grant of the dies-and-return
// ability, +2/+2 and flying for the pair), the creatures that return when they die, bodies and removal that ends a pair, between every kind of agent. The games are played
// with a decision context that hands out a determinized sample like the runner does (`runGame`, A31). Every game finishes with a result, no fallback, no rejected action and
// consistent state after every action (the invariants include "a pair is a link from both sides by one player"); the action log replays to the same final state; and the
// rules of the slice are restated from the events and the views, apart from the engine: each pairing is of two creatures of the player who made it, both unpaired before;
// a creature is in one pair at most and both views agree; the question of soulbond lists unpaired creatures of the player and the casual, greedy and heuristic agents always
// pair, with the strongest one; a pair stands until a creature of it left the battlefield, changed hands or stopped being a creature (a creature that phased out keeps it), and
// is ended with the event that says so; a creature that came back is unpaired. The count is `soakGames()` (D-126); the path checks run from 100 games up.
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
  type ObjectId,
  type ObjectView,
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
import { SOULBOND_NAMES, SOULBOND_STYLE_PAIRS, smallGameConfig } from './helpers';
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
  paired: number;
  asked: number;
  askedWithCandidate: number;
  askedCasual: number;
  askedHeuristic: number;
  declined: number;
  left: number;
  control: number;
  notCreature: number;
  pairsSeen: number;
  graveyardReturns: number;
}

const newTally = (): Tally => ({
  paired: 0,
  asked: 0,
  askedWithCandidate: 0,
  askedCasual: 0,
  askedHeuristic: 0,
  declined: 0,
  left: 0,
  control: 0,
  notCreature: 0,
  pairsSeen: 0,
  graveyardReturns: 0,
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

/** The battlefield as the view of `seat` has it (a phased-out permanent is not on it). */
const fieldOf = (s: GameState, seat: SeatId): readonly ObjectView[] => getView(s, seat).battlefield;

/** The pairs of the state as the views say them: each pair once, as [a, b] with a < b. */
function pairsOf(s: GameState): [ObjectId, ObjectId][] {
  const field = fieldOf(s, 0);
  const out: [ObjectId, ObjectId][] = [];
  for (const o of field) {
    if (o.pairedWith === undefined || o.id > o.pairedWith) continue;
    out.push([o.id, o.pairedWith]);
  }
  return out;
}

function checkPairs(t: Tally, kinds: readonly [Kind, Kind], step: Step): void {
  const { before, after, events } = step;
  const fieldBefore = fieldOf(before, 0);
  const fieldAfter = fieldOf(after, 0);
  const findAfter = (id: string) => fieldAfter.find((o) => o.id === id);
  // The question of soulbond: unpaired creatures of the player, other than the creature; a casual, greedy or heuristic agent always pairs, with the strongest one.
  const asked = before.pending;
  if (asked?.kind === 'choosePermanent' && asked.purpose === 'soulbond') {
    t.asked += 1;
    expect(asked.min).toBe(0);
    expect(asked.max).toBe(1);
    expect(asked.legal.length).toBeGreaterThanOrEqual(1);
    expect(asked.subject).toBeDefined();
    expect(asked.legal).not.toContain(asked.subject);
    for (const id of asked.legal) {
      const o = fieldBefore.find((x) => x.id === id);
      expect(o, `${id} is offered but is not on the battlefield`).toBeDefined();
      expect(o?.controller).toBe(asked.seat);
      expect(o?.types).toContain('creature');
      expect(o?.pairedWith, `${id} is offered but is paired`).toBeUndefined();
    }
    const self = fieldBefore.find((x) => x.id === asked.subject);
    expect(self?.controller).toBe(asked.seat);
    expect(self?.pairedWith).toBeUndefined();
    expect(step.action.kind).toBe('choosePermanents');
    if (step.action.kind === 'choosePermanents') {
      expect(step.action.objects.length).toBeLessThanOrEqual(1);
      const kind = kinds[asked.seat];
      const power = (id: string) => fieldBefore.find((o) => o.id === id)?.power ?? 0;
      const toughness = (id: string) => fieldBefore.find((o) => o.id === id)?.toughness ?? 0;
      t.askedWithCandidate += 1;
      if (step.action.objects.length === 0) t.declined += 1;
      if (kind === 'casual' || kind === 'greedy' || kind === 'heuristic') {
        expect(step.action.objects, `${kind} declined to pair`).toHaveLength(1);
        const picked = step.action.objects[0] as string;
        const top = Math.max(...asked.legal.map(power));
        expect(power(picked)).toBe(top);
        const tied = asked.legal.filter((id) => power(id) === top);
        expect(toughness(picked)).toBe(Math.max(...tied.map(toughness)));
        t.askedCasual += kind === 'heuristic' ? 0 : 1;
        t.askedHeuristic += kind === 'heuristic' ? 1 : 0;
      }
    }
  }
  // Each pairing (CR 702.95a, 702.95b): two creatures of the player, unpaired before, paired with each other after.
  for (const e of events) {
    if (e.kind !== 'creaturesPaired') continue;
    t.paired += 1;
    expect(e.a).not.toBe(e.b);
    for (const id of [e.a, e.b]) {
      const o = findAfter(id);
      expect(o, `${id} is paired but not on the battlefield`).toBeDefined();
      expect(o?.controller).toBe(e.by);
      expect(o?.types).toContain('creature');
      expect(o?.pairedWith).toBe(id === e.a ? e.b : e.a);
      expect(fieldBefore.find((x) => x.id === id)?.pairedWith, `${id} was paired`).toBeUndefined();
    }
  }
  // A creature is in one pair at most, and the views agree (the same pair for both of them).
  const seen = new Set<string>();
  for (const o of fieldAfter) {
    if (o.pairedWith === undefined) continue;
    expect(seen.has(o.id), `${o.id} is in two pairs`).toBe(false);
    seen.add(o.id);
    const partner = findAfter(o.pairedWith);
    expect(partner?.pairedWith, `the pair of ${o.id} is not mutual`).toBe(o.id);
    expect(partner?.controller).toBe(o.controller);
    expect(o.types).toContain('creature');
  }
  // A pair stands until a creature of it left the battlefield (a new object), changed hands or stopped being a creature; phasing keeps it (CR 702.95e, 702.26d).
  for (const [a, b] of pairsOf(before)) {
    const x = findAfter(a);
    const y = findAfter(b);
    if (x?.pairedWith === b && y?.pairedWith === a) {
      t.pairsSeen += 1;
      continue;
    }
    const phased = (id: ObjectId) => after.objects[id]?.zone === 'phased';
    const ca = fieldBefore.find((o) => o.id === a)?.controller;
    const gone = (id: ObjectId, o: ObjectView | undefined) =>
      o === undefined && !phased(id) && after.objects[id] === undefined;
    const reasons: string[] = [];
    if (gone(a, x) || gone(b, y)) reasons.push('left');
    else if (x !== undefined && y !== undefined) {
      if (x.controller !== ca || y.controller !== ca) reasons.push('control');
      if (!x.types.includes('creature') || !y.types.includes('creature'))
        reasons.push('notCreature');
    }
    if (reasons.length === 0 && (phased(a) || phased(b))) continue; // phased out: the pair stands
    if (reasons.length === 0 && (x === undefined || y === undefined)) {
      // A creature that is no longer on the battlefield of the view but still an object: it phased out (handled) or left (a new object): both are explained above.
      continue;
    }
    expect(reasons, `the pair ${a}-${b} ended with no reason`).not.toHaveLength(0);
    // The log says it, unless both left together.
    const said = events.some(
      (e) => e.kind === 'creaturesUnpaired' && (e.a === a || e.a === b || e.b === a || e.b === b),
    );
    // The game ended in this action (a player lost): the state-based actions do not go on, so nothing says it.
    const bothGone = (gone(a, x) && gone(b, y)) || after.result !== null;
    expect(
      said || bothGone,
      `the pair ${a}-${b} ended (${reasons.join(', ')}) with no event: ${JSON.stringify(step.action)} ${events.map((e) => e.kind).join(',')} pending ${after.pending?.kind}`,
    ).toBe(true);
  }
  for (const e of events) {
    if (e.kind === 'creaturesUnpaired') {
      if (e.why === 'left') t.left += 1;
      else if (e.why === 'control') t.control += 1;
      else t.notCreature += 1;
      // A creature that is unpaired is not paired with anything after, unless it is paired again by an ability that resolved in the same action.
    }
    // A card that comes back from the graveyard (the returning creatures) is a new object and unpaired.
    if (e.kind === 'zoneChanged' && e.fromZone === 'graveyard' && e.toZone === 'battlefield') {
      t.graveyardReturns += 1;
      const back = findAfter(e.to);
      expect(back, 'the card that came back is on the battlefield').toBeDefined();
      expect(back?.pairedWith).toBeUndefined();
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
  `${GAMES} soulbond deck-style games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = SOULBOND_STYLE_PAIRS[g % SOULBOND_STYLE_PAIRS.length] ?? [
        'soulbond',
        'soulbond',
      ];
      const config = smallGameConfig(g, styles);
      const kinds: readonly [Kind, Kind] = [
        KINDS[g % 4] ?? 'random',
        KINDS[(g >> 2) % 4] ?? 'random',
      ];
      const agents = [make(kinds[0], 47000 + 2 * g), make(kinds[1], 47001 + 2 * g)] as const;
      const t = newTally();
      const run = await play(config, agents, (step) => {
        checkPairs(t, kinds, step);
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
    console.log(`${GAMES} soulbond games: ${JSON.stringify(total)} (${SOULBOND_NAMES.join(', ')})`);
    expectPath(total.paired, 'two creatures becoming paired');
    expectPath(total.asked, 'the question which creature to pair with');
    expectPath(total.askedCasual, 'a casual or greedy answer to it');
    expectPath(total.askedHeuristic, 'a heuristic answer to it');
    expectPath(total.pairsSeen, 'a pair standing across an action');
    expectPath(total.left, 'a pair ended because a creature of it left');
    expectPath(total.notCreature, 'a pair ended because a creature of it stopped being one');
    expectPath(total.graveyardReturns, 'a creature that came back from the graveyard, unpaired');
  },
  soakTimeout(600_000),
);
