// Slice soak: whole games (the `soakGames()` count, test/soak.ts) with the 'kicker' deck style (SYNTHETIC kicker, flashback and
// conditional-effect cards) between random agents, with CasualAgent in some seats. Every game
// finishes with a result, no fallback, no rejected action, no agent error and consistent state after
// every action; the action log replays to the same final state; and every new path occurs: the
// kicker question asked, kicked and unkicked casts, kicked creatures that enter with counters,
// flashback casts (also kicked), and a flashback spell exiled instead of going to the graveyard
// when it resolves, is countered and fizzles, and never put in the graveyard.
import { checkInvariants, type GameEvent, stateHash } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { cardNameOf } from './game-names';
import {
  KICKER_CARD_NAMES,
  KICKER_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  questions: number;
  kickedCasts: number;
  unkickedCasts: number;
  lifeKickers: number;
  bearCounters: number;
  flashbackCasts: number;
  flashbackKicked: number;
  exiledResolved: number;
  exiledCountered: number;
  exiledFizzled: number;
  flashbackToGraveyard: number;
  casualKicked: number;
  casualFlashback: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  questions: 0,
  kickedCasts: 0,
  unkickedCasts: 0,
  lifeKickers: 0,
  bearCounters: 0,
  flashbackCasts: 0,
  flashbackKicked: 0,
  exiledResolved: 0,
  exiledCountered: 0,
  exiledFizzled: 0,
  flashbackToGraveyard: 0,
  casualKicked: 0,
  casualFlashback: 0,
  byCard: new Map(),
});

/** Notes what one applied action did, for the paths this slice added. */
function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { before, after, events } = step;
  const d = after.pending;
  if (d?.kind === 'confirmOptional' && d.purpose === 'kicker') tally.questions += 1;
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = cardNameOf(after, e.object);
      tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
      const kickerCard = (KICKER_CARD_NAMES as readonly string[]).includes(name);
      if (e.kicked) {
        tally.kickedCasts += 1;
        if (name === 'SYNTHETIC Life Kicker' || name === 'SYNTHETIC Double Kicker') {
          tally.lifeKickers += 1;
        }
        if (casual.has(e.seat)) tally.casualKicked += 1;
      } else if (kickerCard && e.alternative === undefined && /Kicker/.test(name)) {
        tally.unkickedCasts += 1;
      }
      if (e.alternative === 'flashback') {
        tally.flashbackCasts += 1;
        if (e.kicked) tally.flashbackKicked += 1;
        if (casual.has(e.seat)) tally.casualFlashback += 1;
      }
    }
    if (e.kind === 'counterAdded' && e.counter === '+1/+1' && e.count === 2) {
      tally.bearCounters += 1;
    }
    if (e.kind === 'zoneChanged' && e.fromZone === 'stack') {
      const flashback = before.objects[e.from]?.stack?.flashback === true;
      if (!flashback) continue;
      if (e.toZone === 'graveyard') tally.flashbackToGraveyard += 1;
      if (e.toZone !== 'exile') continue;
      const reason = (kind: GameEvent['kind']) =>
        events.some((x) => x.kind === kind && 'object' in x && x.object === e.from);
      if (reason('resolved')) tally.exiledResolved += 1;
      else if (reason('fizzled')) tally.exiledFizzled += 1;
      else if (reason('countered')) tally.exiledCountered += 1;
    }
  }
}

test(
  `${GAMES} kicker and flashback games run clean, replay exactly and use every new path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = KICKER_STYLE_PAIRS[g % KICKER_STYLE_PAIRS.length] ?? ['kicker', 'kicker'];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 7000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 7000 + 2 * g + seat });
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
      // The log replays to the same game (hashing covers the kicked and flashback fields).
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
    console.log(`100 kicker games: ${JSON.stringify(summary)}`);

    expectPath(total.questions);
    expectPath(total.kickedCasts);
    expectPath(total.unkickedCasts);
    expectPath(total.lifeKickers);
    expectPath(total.bearCounters);
    expectPath(total.flashbackCasts);
    expectPath(total.flashbackKicked);
    expectPath(total.exiledResolved);
    expectPath(total.exiledCountered);
    expectPath(total.exiledFizzled);
    expect(total.flashbackToGraveyard).toBe(0);
    expectPath(total.casualKicked);
    expectPath(total.casualFlashback);
    // Every flashback card was cast with flashback at least once somewhere in the 100 games.
    for (const name of KICKER_CARD_NAMES) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(240_000),
);
