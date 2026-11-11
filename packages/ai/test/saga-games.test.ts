// Slice soak: whole games (the `soakGames()` count, test/soak.ts) with the 'sagas' deck style (SYNTHETIC Saga cards, CR 714, and the
// instants that add lore counters to a Saga, destroy it, exile and return it, or copy it) between
// random agents, with CasualAgent in some seats. Every game finishes with a result, no fallback, no
// rejected action and consistent state after every action; the action log replays to the same final
// state; and every new path occurs: Sagas entering with a lore counter, the turn-based counter at
// the precombat main phase, every chapter number triggered, a Saga played through all of its
// chapters and sacrificed by the casual agent, a final chapter that makes a creature, a Saga that
// leaves before its last chapter, a Saga returned by a flicker or copied by a token, and counters
// added by an effect.
import {
  checkInvariants,
  type GameEvent,
  type GameState,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import {
  SAGA_CARD_NAMES,
  SAGA_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  sagasCast: number;
  entered: number;
  turnBased: number;
  chapter1: number;
  chapter2: number;
  chapter3: number;
  sacrificed: number;
  golems: number;
  leftEarly: number;
  copies: number;
  effectCounters: number;
  casualCasts: number;
  casualCompleted: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  sagasCast: 0,
  entered: 0,
  turnBased: 0,
  chapter1: 0,
  chapter2: 0,
  chapter3: 0,
  sacrificed: 0,
  golems: 0,
  leftEarly: 0,
  copies: 0,
  effectCounters: 0,
  casualCasts: 0,
  casualCompleted: 0,
  byCard: new Map(),
});

const objectOf = (state: GameState, id: ObjectId) => state.objects[id] ?? state.lki[id]?.object;

const layoutOf = (state: GameState, id: ObjectId): string | null => {
  const obj = objectOf(state, id);
  if (!obj || obj.card === null) return null;
  const card = state.cards[obj.card];
  return card === undefined ? null : (state.definitions[card.definition]?.layout ?? null);
};

const nameOf = (state: GameState, id: ObjectId): string => {
  const obj = objectOf(state, id);
  if (!obj) return '?';
  if (obj.card === null) return obj.token?.characteristics.name ?? '?';
  const card = state.cards[obj.card];
  return card === undefined ? '?' : (state.definitions[card.definition]?.name ?? '?');
};

/** Notes what one applied action did, for the paths this slice added. */
function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { before, after, events } = step;
  const list = events as readonly GameEvent[];
  list.forEach((e, i) => {
    if (e.kind === 'spellCast') {
      const name = nameOf(after, e.object);
      if ((SAGA_CARD_NAMES as readonly string[]).includes(name)) {
        tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
      }
      if (layoutOf(after, e.object) === 'saga') {
        tally.sagasCast += 1;
        if (casual.has(e.seat)) tally.casualCasts += 1;
      }
    }
    if (e.kind === 'abilityTriggered' && e.chapter !== undefined) {
      if (e.chapter === 1) tally.chapter1 += 1;
      if (e.chapter === 2) tally.chapter2 += 1;
      if (e.chapter === 3) tally.chapter3 += 1;
    }
    if (e.kind === 'counterAdded' && e.counter === 'lore') {
      const entering = list.slice(0, i).some((x) => x.kind === 'zoneChanged' && x.to === e.object);
      const token = list
        .slice(0, i)
        .some((x) => x.kind === 'tokenCreated' && x.object === e.object);
      if (entering || token) {
        tally.entered += 1;
        if (token) tally.copies += 1;
      } else if (
        list.slice(0, i).some((x) => x.kind === 'stepBegan' && x.step === 'precombatMain')
      ) {
        tally.turnBased += 1;
      } else {
        tally.effectCounters += 1;
      }
    }
    if (e.kind === 'sacrificed') {
      const obj = objectOf(before, e.permanent);
      const lore = obj?.counters.lore ?? 0;
      if (lore > 0) {
        tally.sacrificed += 1;
        if (casual.has(e.controller)) tally.casualCompleted += 1;
      }
    }
    if (e.kind === 'tokenCreated' && e.name === 'Golem') tally.golems += 1;
    if (e.kind === 'zoneChanged' && e.fromZone === 'battlefield' && e.toZone !== 'battlefield') {
      const was = before.objects[e.from];
      const lore = was?.counters.lore ?? 0;
      const sacrificed = list.some((x) => x.kind === 'sacrificed' && x.permanent === e.from);
      if (lore > 0 && !sacrificed && layoutOf(before, e.from) === 'saga') tally.leftEarly += 1;
    }
  });
}

test(
  `${GAMES} Saga games run clean, replay exactly and use every new path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = SAGA_STYLE_PAIRS[g % SAGA_STYLE_PAIRS.length] ?? ['sagas', 'sagas'];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 9500 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 9500 + 2 * g + seat });
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
      // The log replays to the same game (the hash covers counters and the chapter on the stack).
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
    console.log(`100 Saga games: ${JSON.stringify(summary)}`);

    expectPath(total.sagasCast);
    expectPath(total.entered);
    expectPath(total.turnBased);
    expectPath(total.chapter1);
    expectPath(total.chapter2);
    expectPath(total.chapter3);
    expectPath(total.sacrificed);
    expectPath(total.golems);
    expectPath(total.leftEarly);
    expectPath(total.copies);
    expectPath(total.effectCounters);
    expectPath(total.casualCasts);
    expectPath(total.casualCompleted);
  },
  soakTimeout(240_000),
);
