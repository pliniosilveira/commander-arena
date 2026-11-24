// The events and the report of a table run (issue 482 follow-up): the observer reads blocks, attacks and
// eliminations off real engine states, and a traced `playTable` run gives a consistent report.
import {
  type Action,
  applyAction,
  type CardDefinition,
  type SeatId,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import {
  type ActionStep,
  AGENT_FACTORIES,
  ARENA_DECKS,
  playTable,
  runGame,
  type TableEvent,
  TableObserver,
  tableReport,
} from '../src/index';
import { creature } from './heuristic-helpers';

const BEARS = 'Grizzly Bears'; // 2/2
const V3 = 'SYNTHETIC Vanilla 3/3';
const SPIDER = 'Giant Spider'; // 2/4 reach
const FLIER = creature('SYNTHETIC Flying Three', 3, 3, ['flying']);

/** Seat 1 attacks seat 0 (at `life`) with the creatures in `attackers`; seat 0 holds `blockers`. */
function setup(attackers: string[], blockers: string[], life: number, defs: CardDefinition[] = []) {
  let b = scenario();
  for (const d of defs) b = b.define(d);
  b = b
    .seat(0)
    .life(life)
    .battlefield(...blockers)
    .library('Island', { count: 4 })
    .seat(1);
  for (const a of attackers) b = b.battlefield(a);
  const g = b.library('Island', { count: 4 }).at('precombatMain', { active: 1 }).build();
  g.advanceTo('declareAttackers');
  return g;
}

/** Passes priority for whoever holds it until the game is over (or `limit` actions), observing every step. */
function passToEnd(observer: TableObserver, start: ActionStep['after'], limit = 40): void {
  let state = start;
  for (let i = 0; i < limit && state.result === null && state.pending !== null; i += 1) {
    const seat = state.pending.seat;
    const action: Action = { kind: 'pass' };
    const applied = applyAction(state, seat, action);
    if (!applied.ok) throw new Error(applied.error);
    observer.observe({ index: i, seat, action, before: state, after: applied.state });
    state = applied.state;
  }
}

/** What the observer makes of `action` by `seat` on the state of `g`. */
function observe(g: { state: ActionStep['before'] }, seat: SeatId, action: Action): TableEvent[] {
  const applied = applyAction(g.state, seat, action);
  if (!applied.ok) throw new Error(applied.error);
  const observer = new TableObserver(2);
  observer.observe({ index: 0, seat, action, before: g.state, after: applied.state });
  return observer.events;
}

describe('the block event', () => {
  test('a free creature could have stopped the damage that went through', () => {
    const g = setup([V3, BEARS], [SPIDER], 20);
    g.act(1).attack([V3, BEARS]);
    g.advanceTo('declareBlockers', { block: false });
    const [e] = observe(g, 0, { kind: 'declareBlockers', blocks: [] });
    expect(e).toMatchObject({
      kind: 'block',
      seat: 0,
      life: 20,
      attackersAtMe: 2,
      blockers: 0,
      candidates: 1,
      unblocked: 5,
      avoidable: 5,
      lethal: false,
    });
  });

  test('blocking one attacker with the only creature leaves nothing avoidable', () => {
    const g = setup([V3, BEARS], [SPIDER], 20);
    g.act(1).attack([V3, BEARS]);
    g.advanceTo('declareBlockers', { block: false });
    const [e] = observe(g, 0, {
      kind: 'declareBlockers',
      blocks: [{ blocker: g.id(SPIDER), attacker: g.id(V3) }],
    });
    expect(e).toMatchObject({ blockers: 1, unblocked: 2, avoidable: 0 });
  });

  test('lethal damage the defender could not have blocked is not avoidable, and the elimination follows', () => {
    // Bears can block the vanilla 3/3 but not the flier, which is lethal at 3 life.
    const g = setup([V3, FLIER.name], [BEARS], 3, [FLIER]);
    g.act(1).attack([V3, FLIER.name]);
    g.advanceTo('declareBlockers', { block: false });
    const block: Action = {
      kind: 'declareBlockers',
      blocks: [{ blocker: g.id(BEARS), attacker: g.id(V3) }],
    };
    const applied = applyAction(g.state, 0, block);
    if (!applied.ok) throw new Error(applied.error);
    const observer = new TableObserver(2);
    observer.observe({ index: 0, seat: 0, action: block, before: g.state, after: applied.state });
    passToEnd(observer, applied.state);
    expect(observer.events[0]).toMatchObject({
      kind: 'block',
      unblocked: 3,
      avoidable: 0,
      lethal: true,
    });
    expect(observer.events.find((e) => e.kind === 'eliminated')).toMatchObject({
      seat: 0,
      cause: 'life',
      place: 2,
      turn: observer.events[0]?.turn,
    });
    expect(observer.placements()).toEqual([2, 1]);
  });
});

describe('the attack event', () => {
  test('sending every creature that could attack is all-in, and the groups say whom it went at', () => {
    const g = setup([V3, BEARS], [], 20);
    const at = { kind: 'player', seat: 0 } as const;
    const all = observe(g, 1, {
      kind: 'declareAttackers',
      attacks: [
        { attacker: g.id(V3), target: at },
        { attacker: g.id(BEARS), target: at },
      ],
    });
    expect(all[0]).toMatchObject({
      kind: 'attack',
      seat: 1,
      attackers: 2,
      candidates: 2,
      power: 5,
      allIn: true,
      groups: [{ seat: 0, attackers: 2, power: 5, life: 20 }],
    });
    const one = observe(g, 1, {
      kind: 'declareAttackers',
      attacks: [{ attacker: g.id(V3), target: at }],
    });
    expect(one[0]).toMatchObject({ attackers: 1, candidates: 2, allIn: false });
  });
});

describe('the runner hook', () => {
  test('onAction sees every applied action in order, with the state before and after', async () => {
    const seen: ActionStep[] = [];
    const deck = ARENA_DECKS.map((d) => (Array.isArray(d) ? d[0] : d))[0];
    if (deck === undefined) throw new Error('an arena deck');
    const agents = [0, 1].map((k) => AGENT_FACTORIES.random.create(k + 1));
    const run = await runGame({ seed: 1, decks: [deck, deck] }, agents, {
      maxTurns: 3,
      maxActions: 200,
      onAction: (s) => seen.push(s),
    });
    expect(seen).toHaveLength(run.log.length);
    expect(seen.map((s) => s.index)).toEqual(run.log.map((_, i) => i));
    expect(seen.map((s) => [s.seat, s.action])).toEqual(run.log.map((l) => [l.seat, l.action]));
    expect(seen[1]?.before).toBe(seen[0]?.after);
  }, 60_000);
});

describe('a traced table run', () => {
  const deck = ARENA_DECKS.map((d) => (Array.isArray(d) ? d[0] : d));
  const agents = [
    AGENT_FACTORIES.heuristic,
    AGENT_FACTORIES.greedy,
    AGENT_FACTORIES.casual,
    AGENT_FACTORIES.random,
  ];
  const run = (trace: boolean) =>
    playTable({
      agents,
      decks: deck,
      games: 4,
      baseSeed: 1,
      limits: { maxTurns: 25, maxActions: 3000 },
      trace,
    });

  test('places are a ranking, the winner is 1, and events are kept only when asked', async () => {
    const quiet = await run(false);
    expect(quiet.log.every((g) => g.events === undefined)).toBe(true);
    const r = await run(true);
    for (const g of r.log) {
      expect(g.places).toHaveLength(4);
      expect([0, 1, 2, 3]).toContain(g.startingSeat);
      if (g.winnerSeat !== null) {
        expect(g.places[g.winnerSeat]).toBe(1);
        expect([...g.places].sort()).toEqual([1, 2, 3, 4]);
      }
      const out = (g.events ?? []).filter((e) => e.kind === 'eliminated');
      expect(out.map((e) => e.place)).toEqual([...out.map((e) => e.place)].sort((a, b) => b - a));
    }
  }, 120_000);

  test('the report adds up, and the same run gives the same report', async () => {
    const r = await run(true);
    const rep = tableReport(r);
    expect(rep.games).toBe(4);
    expect(rep.agents.map((a) => a.label)).toEqual(r.labels);
    // Every seat of every game falls in one seat slot and one place of the turn order, and one seat wins each game.
    for (const slots of [rep.bySeat, rep.byPosition]) {
      expect(slots.reduce((n, p) => n + p.games, 0)).toBe(16);
      expect(slots.reduce((n, p) => n + p.wins, 0)).toBe(r.wins.reduce((a, b) => a + b, 0));
    }
    for (const a of rep.agents) {
      expect(a.survival.games).toBe(4);
      expect(a.survival.meanPlace).toBeGreaterThanOrEqual(1);
      expect(a.survival.meanPlace).toBeLessThanOrEqual(4);
      expect(a.block.avoidable).toBeLessThanOrEqual(a.block.unblocked);
      expect(a.removal.bands.reduce((x, y) => x + y, 0)).toBe(a.removal.casts);
    }
    // Every game gives one place to each seat: the mean place of the four agents is 2.5 when all four go out in order.
    const attacks = rep.agents.reduce((n, a) => n + a.attack.attacks, 0);
    const events = r.log.flatMap((g) => g.events ?? []);
    expect(attacks).toBe(events.filter((e) => e.kind === 'attack' && e.attackers > 0).length);
    expect(JSON.stringify(tableReport(await run(true)))).toBe(JSON.stringify(rep));
  }, 240_000);
});
