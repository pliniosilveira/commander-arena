// Slice S3 soak: whole games (the `soakGames()` count, test/soak.ts) with the 'activated' deck style (SYNTHETIC cards with activated
// abilities, pumps and Cycling) between random agents, with CasualAgent in some seats. Every game
// finishes with a result, no fallback, no rejected action, no agent error and consistent state
// after every action; the action log replays to the same final state; and every new path of the
// slice occurs: activations from the battlefield and from the hand (Cycling), abilities with
// targets, a sacrifice paid as a cost (asked and automatic), "until end of turn" effects made and
// ended at cleanup, abilities that fizzled and abilities that resolved after their source left.
import {
  checkInvariants,
  type GameEvent,
  type GameState,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import {
  ACTIVATED_CARD_NAMES,
  ACTIVATED_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  activations: number;
  fromHand: number;
  targeted: number;
  sacrificeAsked: number;
  sacrificeAutomatic: number;
  pumpsMade: number;
  pumpsEnded: number;
  fizzled: number;
  afterSourceLeft: number;
  lifePaid: number;
  countersRemoved: number;
  casualActivations: number;
  casualPumps: number;
  casualCycles: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  activations: 0,
  fromHand: 0,
  targeted: 0,
  sacrificeAsked: 0,
  sacrificeAutomatic: 0,
  pumpsMade: 0,
  pumpsEnded: 0,
  fizzled: 0,
  afterSourceLeft: 0,
  lifePaid: 0,
  countersRemoved: 0,
  casualActivations: 0,
  casualPumps: 0,
  casualCycles: 0,
  byCard: new Map(),
});

const nameOf = (state: GameState, id: string): string => {
  const obj = state.objects[id as never] ?? state.lki[id as never]?.object;
  if (!obj || obj.card === null) return obj?.token?.characteristics.name ?? '?';
  const card = state.cards[obj.card];
  return card === undefined ? '?' : (state.definitions[card.definition]?.name ?? '?');
};

/** Notes what one applied action did, for the paths this slice added. */
function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { before, after, action, events } = step;
  const abilityAct = (e: GameEvent) => e.kind === 'abilityActivated';
  if (action.kind === 'chooseTargets' && before.casting?.activation) tally.targeted += 1;
  if (action.kind === 'choosePermanents' && before.pending?.kind === 'choosePermanent') {
    if (before.pending.forCost) tally.sacrificeAsked += 1;
  }
  if (after.continuousEffects.length > before.continuousEffects.length) tally.pumpsMade += 1;
  if (before.continuousEffects.length > 0 && after.continuousEffects.length === 0) {
    tally.pumpsEnded += 1;
  }
  for (const e of events) {
    // The sacrifice of a cost is chosen by the engine when a single permanent qualifies; the
    // event names the ability being activated, which is on the stack by then.
    if (
      e.kind === 'permanentsChosen' &&
      e.automatic &&
      after.objects[e.source]?.stack?.ability?.kind === 'activated'
    ) {
      tally.sacrificeAutomatic += 1;
    }
    if (e.kind === 'fizzled' && before.objects[e.object]?.stack?.ability?.kind === 'activated') {
      tally.fizzled += 1;
    }
    if (e.kind === 'resolved') {
      const stack = before.objects[e.object]?.stack;
      if (
        stack?.ability?.kind === 'activated' &&
        stack.source !== null &&
        before.objects[stack.source] === undefined
      ) {
        tally.afterSourceLeft += 1;
      }
    }
    if (abilityAct(e) && e.kind === 'abilityActivated') {
      tally.activations += 1;
      const source = before.objects[e.source] ?? after.objects[e.source];
      // Cycling is the ability that functions from the hand (the card has left it by now).
      const stacked = e.stackObject === null ? undefined : after.objects[e.stackObject]?.stack;
      const hand = stacked?.ability?.kind === 'activated' && stacked.ability.functionsIn === 'hand';
      if (hand) tally.fromHand += 1;
      const name = nameOf(after, e.source);
      tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
      if (casual.has(e.seat)) {
        tally.casualActivations += 1;
        if (hand) tally.casualCycles += 1;
        else if (source?.zone === 'battlefield') tally.casualPumps += 1;
      }
    }
    if (e.kind === 'lifeChanged' && action.kind === 'activate' && e.to < e.from) {
      tally.lifePaid += 1;
    }
    if (e.kind === 'counterRemoved' && e.counter === 'charge') tally.countersRemoved += 1;
  }
}

test(
  `${GAMES} activated-ability games run clean, replay exactly and use every new path`,
  async () => {
    const total = newTally();
    const gamesWith = { ...newTally(), byCard: undefined } as Record<string, unknown>;
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = ACTIVATED_STYLE_PAIRS[g % ACTIVATED_STYLE_PAIRS.length] ?? [
        'activated',
        'activated',
      ];
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
        if (typeof v === 'number') {
          (total[key] as number) += v;
          if (v > 0) gamesWith[key] = ((gamesWith[key] as number | undefined) ?? 0) + 1;
        }
      }
      for (const [name, n] of tally.byCard)
        total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    const summary = {
      ...total,
      byCard: Object.fromEntries([...total.byCard].sort()),
      gamesWith,
      turnsMax: Math.max(...turns),
    };
    console.log(`100 activated games: ${JSON.stringify(summary)}`);

    expectPath(total.activations);
    expectPath(total.fromHand); // Cycling
    expectPath(total.targeted);
    expectPath(total.sacrificeAsked);
    expectPath(total.sacrificeAutomatic);
    expectPath(total.pumpsMade);
    expectPath(total.pumpsEnded);
    expectPath(total.fizzled);
    expectPath(total.afterSourceLeft);
    expectPath(total.lifePaid);
    expectPath(total.countersRemoved);
    expectPath(total.casualActivations);
    // Every card of the style that has an activated ability was activated somewhere.
    for (const name of ACTIVATED_CARD_NAMES) {
      if (name === 'SYNTHETIC Shrink') continue; // a spell, not an ability
      expectPath(total.byCard.get(name) ?? 0, name);
    }
    expectPath(total.byCard.get('SYNTHETIC Cycling Land') ?? 0);
  },
  soakTimeout(240_000),
);
