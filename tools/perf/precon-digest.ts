// A fingerprint of whole games on the real precons (M45, D-173), through the public API only: the five
// precons through the web import pipeline, played by the RandomLegalAgent from a seed, and for every
// step a fingerprint of both players' views (every derived characteristic they show), the legal
// actions, and every tenth step the state hash. Run it on two versions of the engine and compare the
// output line by line: a pure speed-up prints exactly the same lines.
//
//   node tools/perf/precon-digest.ts [--games 10] [--first-seed 1] [--max-actions 1500]
//
// The packages/engine/test/derive-differential test is the committed safety net (fixtures, fast); this
// is the same idea on the real cards, too slow for a test run.

import '../corpus/register.ts';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    games: { type: 'string', default: '10' },
    'first-seed': { type: 'string', default: '1' },
    'max-actions': { type: 'string', default: '1500' },
  },
});
const GAMES = Number(values.games);
const FIRST = Number(values['first-seed']);
const MAX_ACTIONS = Number(values['max-actions']);

const { applyAction, createGame, getLegalActions, getView, stateHash } = await import(
  '@commander-arena/engine'
);
const { AGENT_FACTORIES, runGame } = await import('@commander-arena/ai');
const { crossPairs, loadPreconDecks } = await import('./../ai/precons.ts');

const loaded = await loadPreconDecks();
for (const problem of loaded.problems) process.stderr.write(`precon left out: ${problem}\n`);
const pairs = crossPairs(loaded.decks);

for (let i = 0; i < GAMES; i++) {
  const seed = FIRST + i;
  const decks = pairs[i % pairs.length];
  if (decks === undefined) continue;
  const run = await runGame(
    { seed, decks },
    [AGENT_FACTORIES.random.create(2 * seed + 1), AGENT_FACTORIES.random.create(2 * seed + 2)],
    { maxTurns: 60, maxActions: MAX_ACTIONS },
  );
  let state = createGame({ seed, decks }).state;
  const digests: string[] = [];
  let peak = 0;
  run.log.forEach((entry, index) => {
    const applied = applyAction(state, entry.seat, entry.action);
    if (!applied.ok) throw new Error(`replay rejected: ${applied.error}`);
    state = applied.state;
    peak = Math.max(peak, state.battlefield.length);
    const parts: string[] = [];
    if (index % 10 === 0) parts.push(stateHash(state));
    for (const seat of state.seats) parts.push(stateHash(getView(state, seat.id)));
    if (state.pending !== null) parts.push(stateHash(getLegalActions(state, state.pending.seat)));
    digests.push(stateHash(parts));
  });
  process.stdout.write(
    `seed ${seed} actions ${run.log.length} peak ${peak} ${run.reason} digest ${stateHash(digests)}\n`,
  );
}
