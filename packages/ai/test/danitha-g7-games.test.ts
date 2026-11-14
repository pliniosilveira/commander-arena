// Slice soak (D-433): whole games with the 'danithaG7' deck style (SYNTHETIC cards of the engine fixtures `synthetic-danitha-g7.ts`: modal spells whose modes have a cost
// listed before the effect, Tiered, with bodies and removal) between random agents, with CasualAgent and HeuristicAgent in some seats. Every game finishes with a result, no fallback,
// no rejected action and consistent state after every action; the action log replays to the same final state; and, with the rules read again here from the cards' texts (not from
// the engine's own code), at every step:
//   - a spell of the group is cast with the number of modes its text says (one, or one or more) and the mana it spent is at least its mana cost plus the cost of each mode chosen
//     (CR 702.183a, 700.2h; a tax can add to it, nothing in these decks reduces it);
//   - the sets of modes a `chooseModes` question of a spell of the group offers are all sets the caster could pay for: a set is never offered when the mana the caster has could not pay its
//     mode costs (CR 118.3), counted from the untapped lands and mana creatures they control and the mana already in their pool.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  applyAction,
  checkInvariants,
  getLegalActions,
  getView,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import {
  type Agent,
  CasualAgent,
  HeuristicAgent,
  RandomLegalAgent,
  replayGame,
} from '../src/index';
import { tokenOrCopyNameOf } from './game-names';
import {
  DANITHA_G7_NAMES,
  DANITHA_G7_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

/** The mana cost of each card and the cost of each mode, read from the texts of the cards (the modes in printed order). */
const COSTS = new Map<string, { base: number; modes: number[]; one: boolean }>([
  ['SYNTHETIC Tiered Ward', { base: 1, modes: [0, 1, 4], one: true }],
  ['SYNTHETIC Costed Pair', { base: 1, modes: [1, 1], one: false }],
  ['SYNTHETIC Half Costed Choice', { base: 1, modes: [0, 3], one: true }],
]);

interface Tally {
  casts: number;
  questions: number;
  costed: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({ casts: 0, questions: 0, costed: 0, byCard: new Map() });

function checkRules(t: Tally, step: StepInfo): void {
  const { after, events } = step;
  // A question about the modes of a spell of the group: no set costs more than the player can have (lands and mana creatures they control, untapped).
  const pending = after.pending;
  if (pending?.kind === 'chooseModes' && pending.purpose === 'spell') {
    const name = tokenOrCopyNameOf(after, pending.source);
    const cost = COSTS.get(name);
    if (cost !== undefined) {
      t.questions += 1;
      const view = getView(after, pending.seat);
      const sources = view.battlefield.filter(
        (o) =>
          o.controller === pending.seat &&
          !o.tapped &&
          (o.types.includes('land') || o.name === 'Llanowar Elves'),
      ).length;
      // Mana already in the pool pays too (an agent may tap its lands before it casts).
      const floating = after.seats[pending.seat]?.manaPool.length ?? 0;
      for (const set of pending.sets) {
        const total = cost.base + set.reduce((n, i) => n + (cost.modes[i] ?? 0), 0);
        expect(total, `${name}: the set [${set.join(',')}] could be paid`).toBeLessThanOrEqual(
          sources + floating,
        );
      }
    }
  }
  for (const e of events) {
    if (e.kind !== 'spellCast') continue;
    const name = tokenOrCopyNameOf(after, e.object);
    t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    const cost = COSTS.get(name);
    if (cost === undefined) continue;
    t.casts += 1;
    const stack = after.objects[e.object]?.stack;
    const chosen = stack?.chosenModes ?? [];
    expect(chosen.length, `${name}: the number of modes`).toBeGreaterThanOrEqual(1);
    if (cost.one) expect(chosen, `${name}: one mode`).toHaveLength(1);
    const expected = cost.base + chosen.reduce((n, i) => n + (cost.modes[i] ?? 0), 0);
    if (chosen.some((i) => (cost.modes[i] ?? 0) > 0)) t.costed += 1;
    expect(
      stack?.manaSpent?.total ?? 0,
      `${name}: the mana spent covers its cost and the cost of the modes chosen`,
    ).toBeGreaterThanOrEqual(expected);
  }
}

test(
  `${GAMES} danithaG7 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = DANITHA_G7_STYLE_PAIRS[g % DANITHA_G7_STYLE_PAIRS.length] ?? [
        'danithaG7',
        'danithaG7',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 207000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 207000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 207000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
        if (step.index % 97 === 0) {
          const listed = getLegalActions(step.before, step.seat);
          expect(
            listed.some((a) => JSON.stringify(a) === JSON.stringify(step.action)) ||
              applyAction(step.before, step.seat, step.action).ok,
          ).toBe(true);
        }
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      for (const key of ['casts', 'questions', 'costed'] as const) total[key] += t[key];
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} danithaG7 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.casts);
    expectPath(total.questions);
    expectPath(total.costed);
    for (const name of DANITHA_G7_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(300_000),
);
