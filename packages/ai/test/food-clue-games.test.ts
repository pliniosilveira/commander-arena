// Soak: whole games (the `soakGames()` count, test/soak.ts) with the 'food' deck style (SYNTHETIC Food and Clue cards, sacrifice
// watchers, creatures with an intervening "if") between random agents, with CasualAgent in some
// seats. Every game finishes with a result, no fallback, no rejected action, no agent error and
// consistent state after every action; the action log replays to the same final state; and every
// new path occurs: Food and Clue tokens made, eaten and cracked (also by CasualAgent), the
// sacrifice paid as a cost seen by a watcher, an intervening "if" that stopped a trigger from
// going on the stack and one that went on and was removed on resolution (CR 603.4).
import {
  checkInvariants,
  type GameEvent,
  type GameState,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import {
  FOOD_CARD_NAMES,
  FOOD_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  foodMade: number;
  clueMade: number;
  foodEaten: number;
  cluesCracked: number;
  tokensGone: number;
  watcherTriggers: number;
  interveningRemoved: number;
  casualEaten: number;
  casualCracked: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  foodMade: 0,
  clueMade: 0,
  foodEaten: 0,
  cluesCracked: 0,
  tokensGone: 0,
  watcherTriggers: 0,
  interveningRemoved: 0,
  casualEaten: 0,
  casualCracked: 0,
  byCard: new Map(),
});

const nameOf = (state: GameState, id: string): string => {
  const obj = state.objects[id as never] ?? state.lki[id as never]?.object;
  if (!obj) return '?';
  if (obj.token !== null) return obj.token.characteristics.name;
  if (obj.card === null) return '?';
  const card = state.cards[obj.card];
  return card === undefined ? '?' : (state.definitions[card.definition]?.name ?? '?');
};

/** Notes what one applied action did, for the paths this slice added. */
function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { before, after, events } = step;
  for (const e of events as readonly GameEvent[]) {
    if (e.kind === 'spellCast') {
      const name = nameOf(after, e.object);
      tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
    }
    if (e.kind === 'tokenCreated' && e.name === 'Food') tally.foodMade += 1;
    if (e.kind === 'tokenCreated' && e.name === 'Clue') tally.clueMade += 1;
    if (e.kind === 'abilityActivated') {
      const source = nameOf(after, e.source);
      if (source === 'Food') {
        tally.foodEaten += 1;
        if (casual.has(e.seat)) tally.casualEaten += 1;
      }
      if (source === 'Clue') {
        tally.cluesCracked += 1;
        if (casual.has(e.seat)) tally.casualCracked += 1;
      }
    }
    if (e.kind === 'abilityTriggered') {
      const source = nameOf(after, e.source);
      if (source === 'SYNTHETIC Sacrifice Lifegainer' || source === 'SYNTHETIC Sacrifice Reader') {
        tally.watcherTriggers += 1;
      }
    }
    if (e.kind === 'fizzled' && e.reason === 'interveningIf') tally.interveningRemoved += 1;
  }
  // A token that was on the battlefield and is in no zone any more.
  for (const id of Object.keys(before.objects)) {
    const was = before.objects[id as never];
    if (was?.token !== null && was !== undefined && was.zone === 'battlefield') {
      if (after.objects[id as never] === undefined) tally.tokensGone += 1;
    }
  }
}

test(
  `${GAMES} Food and Clue games run clean, replay exactly and use every new path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = FOOD_STYLE_PAIRS[g % FOOD_STYLE_PAIRS.length] ?? ['food', 'food'];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 9000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 9000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const tally = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        note(tally, casual, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      // The log replays to the same game.
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      turns.push(run.state.turn.number);
      for (const key of Object.keys(tally) as (keyof Tally)[]) {
        const v = tally[key];
        if (typeof v === 'number') (total[key] as number) += v;
      }
      for (const [name, n] of tally.byCard)
        total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    const summary = {
      ...total,
      byCard: Object.fromEntries([...total.byCard].sort()),
      turnsMax: Math.max(...turns),
    };
    console.log(`100 food games: ${JSON.stringify(summary)}`);

    expectPath(total.foodMade);
    expectPath(total.clueMade);
    expectPath(total.foodEaten);
    expectPath(total.cluesCracked);
    expectPath(total.tokensGone);
    expectPath(total.watcherTriggers);
    expectPath(total.interveningRemoved);
    expectPath(total.casualEaten);
    expectPath(total.casualCracked);
    // Every card of the pool was cast at least once somewhere in the 100 games.
    for (const name of FOOD_CARD_NAMES) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(240_000),
);
