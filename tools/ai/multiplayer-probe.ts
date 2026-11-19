// Probe of 3- and 4-seat games (phase 0 of the multiplayer plan): plays whole games of the real precons with
// one agent per seat and reports how they end, so what breaks without any rules work shows up first.
//
//   node tools/ai/multiplayer-probe.ts [--players 3] [--games 20] [--agent random] [--seed 1] [--max-turns 100]
//
// Not part of any test run. The runner uses a logical clock, so a game is reproducible from its seed.

import '../corpus/register.ts';
import { parseArgs } from 'node:util';
import type { Agent } from '@commander-arena/ai';

const { values } = parseArgs({
  options: {
    players: { type: 'string', default: '3' },
    games: { type: 'string', default: '20' },
    agent: { type: 'string', default: 'random' },
    seed: { type: 'string', default: '1' },
    'max-turns': { type: 'string', default: '100' },
    'max-actions': { type: 'string', default: '8000' },
    verbose: { type: 'boolean', default: false },
  },
});
const PLAYERS = Number(values.players);
const GAMES = Number(values.games);
const FIRST_SEED = Number(values.seed);

const { AGENT_FACTORIES, runGame } = await import('@commander-arena/ai');
const { loadPreconDecks } = await import('./precons.ts');

const kind = values.agent as keyof typeof AGENT_FACTORIES;
const factory = AGENT_FACTORIES[kind];
if (factory === undefined) throw new Error(`unknown agent ${values.agent}`);

const loaded = await loadPreconDecks();
if (loaded.decks.length < PLAYERS) throw new Error('not enough playable precons');

const anomalies: Record<string, number> = {};
const note = (m: string): void => {
  anomalies[m] = (anomalies[m] ?? 0) + 1;
};
const lossTurns: number[] = [];
/** Wraps an agent to watch what each view shows about players who have left the game (CR 800.4a). */
function watch(inner: Agent, seat: number): Agent {
  const seenLost = new Set<number>();
  return {
    get name() {
      return inner.name;
    },
    fallbacks: inner.fallbacks ?? [],
    async decide(view, decision, ctx) {
      for (const s of view.seats) {
        if (s.hasLost && !seenLost.has(s.id)) {
          seenLost.add(s.id);
          if (seat === 0 || seat === (s.id === 0 ? 1 : 0)) lossTurns.push(view.turn);
        }
      }
      const lost = new Set(view.seats.filter((s) => s.hasLost).map((s) => s.id));
      if (lost.has(seat)) note('a seat that has lost was asked for a decision');
      if (lost.has(view.activeSeat)) note('the active seat is a player who has lost');
      for (const o of view.battlefield) {
        if (lost.has(o.controller)) {
          note('permanent still on the battlefield under a player who has lost');
          break;
        }
      }
      for (const o of view.stack ?? []) {
        if (lost.has(o.controller)) {
          note('stack object controlled by a player who has lost');
          break;
        }
      }
      return inner.decide(view, decision, ctx);
    },
  };
}

const endReasons: Record<string, number> = {};
const errors: Record<string, number> = {};
const winners: Record<string, number> = {};
let turns = 0;
let rejected = 0;
let decisions = 0;
let fallbacks = 0;
let crashed = 0;

for (let i = 0; i < GAMES; i++) {
  const seed = FIRST_SEED + i;
  const decks = Array.from(
    { length: PLAYERS },
    (_, k) =>
      (loaded.decks[(i + k * 3) % loaded.decks.length] as (typeof loaded.decks)[number]).deck,
  );
  const agents = decks.map((_, k) => watch(factory.create(seed * 10 + k), k));
  try {
    const run = await runGame({ seed, decks }, agents, {
      maxTurns: Number(values['max-turns']),
      maxActions: Number(values['max-actions']),
    });
    endReasons[run.reason] = (endReasons[run.reason] ?? 0) + 1;
    turns += run.state.turn.number;
    rejected += run.rejected.length;
    decisions += run.counters.decisions;
    fallbacks += run.counters.fallbacks;
    const w = JSON.stringify(run.result === null ? null : run.result.kind);
    winners[w] = (winners[w] ?? 0) + 1;
    for (const e of run.agentErrors.slice(0, 3))
      errors[e.slice(0, 160)] = (errors[e.slice(0, 160)] ?? 0) + 1;
    for (const r of run.rejected.slice(0, 2))
      errors[`rejected: ${r.error.slice(0, 140)}`] =
        (errors[`rejected: ${r.error.slice(0, 140)}`] ?? 0) + 1;
    if (values.verbose)
      console.log(
        `seed ${seed}: ${run.reason}, turn ${run.state.turn.number}, ${run.log.length} actions`,
      );
  } catch (error) {
    crashed += 1;
    const m = `CRASH: ${(error instanceof Error ? error.message : String(error)).slice(0, 160)}`;
    errors[m] = (errors[m] ?? 0) + 1;
    if (values.verbose) console.log(`seed ${seed}: ${m}`);
  }
}

console.log(`\n${PLAYERS} seats, ${GAMES} games, agent ${kind}, first seed ${FIRST_SEED}`);
console.log('end reasons:', endReasons, 'crashed:', crashed);
console.log('result values:', winners);
console.log(
  `avg final turn ${(turns / Math.max(1, GAMES - crashed)).toFixed(1)}; decisions ${decisions}; rejected actions ${rejected}; fallbacks ${fallbacks}`,
);
console.log('anomalies seen in views (count of decisions):', anomalies);
console.log('turns at which a first loss was seen:', lossTurns.slice(0, 20).join(','));
console.log('distinct problems:');
for (const [m, n] of Object.entries(errors)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15))
  console.log(`  ${n}x ${m}`);
