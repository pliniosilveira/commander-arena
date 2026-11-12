// Slice soak (D-274): whole games with the 'miracle' deck style (SYNTHETIC Miracle cards: an {X} in the miracle cost, a target, a
// permanent, cards that draw several cards or give the draw to the opponent) between random agents, with CasualAgent in some seats.
// Every game finishes with a result, no fallback, no rejected action, no agent error and consistent state after every action; the
// action log replays to the same final state; declining the reveal leaves no public trace (no event at all); and every path of the
// slice occurs. The count is `soakGames()` (D-126); the path checks run from 100 games up.
import { checkInvariants, stateHash } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import {
  MIRACLE_NAMES,
  MIRACLE_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  revealAsked: number;
  revealAccepted: number;
  revealDeclined: number;
  /** The reveal was asked in the draw step, and while a spell resolved. */
  revealInDrawStep: number;
  revealInResolution: number;
  triggers: number;
  castAsked: number;
  castAccepted: number;
  castDeclined: number;
  /** The trigger resolved and nothing was asked: the card could not be cast. */
  castNotAsked: number;
  miracleSpells: number;
  /** A miracle cast with an announced X above 0 that made that many tokens. */
  xCasts: number;
  casualReveals: number;
}

const newTally = (): Tally => ({
  revealAsked: 0,
  revealAccepted: 0,
  revealDeclined: 0,
  revealInDrawStep: 0,
  revealInResolution: 0,
  triggers: 0,
  castAsked: 0,
  castAccepted: 0,
  castDeclined: 0,
  castNotAsked: 0,
  miracleSpells: 0,
  xCasts: 0,
  casualReveals: 0,
});

/** Notes what one applied action did, for the paths this slice added. */
function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { after, events, before } = step;
  const asked = before.pending;

  if (asked?.kind === 'confirmOptional' && asked.purpose === 'miracleReveal') {
    const accepted = step.action.kind === 'acceptOptional';
    tally.revealAsked += 1;
    if (before.resolution === null) tally.revealInDrawStep += 1;
    else tally.revealInResolution += 1;
    if (accepted) {
      tally.revealAccepted += 1;
      if (casual.has(step.seat)) tally.casualReveals += 1;
      // The reveal is public and the trigger follows.
      expect(events.some((e) => e.kind === 'cardsRevealed')).toBe(true);
      expect(events.some((e) => e.kind === 'miracleRevealed')).toBe(true);
    } else {
      tally.revealDeclined += 1;
      // Declining leaves no event: the events are public and any would tell the opponent the card has miracle.
      for (const e of events) {
        expect(['cardsRevealed', 'miracleRevealed', 'optionalAnswered']).not.toContain(e.kind);
      }
    }
  }
  if (asked?.kind === 'confirmOptional' && asked.purpose === 'miracle') {
    tally.castAsked += 1;
    if (step.action.kind === 'acceptOptional') tally.castAccepted += 1;
    else tally.castDeclined += 1;
  }

  for (const e of events) {
    if (e.kind === 'miracleRevealed') tally.triggers += 1;
    if (e.kind === 'spellCast' && e.alternative === 'miracle') {
      tally.miracleSpells += 1;
      const spell = after.objects[e.object];
      if ((spell?.stack?.x ?? 0) > 0) tally.xCasts += 1;
    }
    // A miracle ability that resolved with nothing asked: the card was gone, or it could not be cast.
    if (e.kind === 'resolved' && before.pending?.kind !== 'confirmOptional') {
      const ability = before.objects[e.object]?.stack?.ability;
      if (ability?.kind === 'triggered' && ability.effect.kind === 'castExiled') {
        if (ability.effect.mode === 'miracle') tally.castNotAsked += 1;
      }
    }
  }
}

test(
  `${GAMES} miracle games run clean, replay exactly and use every path of the slice`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = MIRACLE_STYLE_PAIRS[g % MIRACLE_STYLE_PAIRS.length] ?? ['miracle', 'miracle'];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 9700 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 9700 + 2 * g + seat });
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
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      turns.push(run.state.turn.number);
      for (const key of Object.keys(tally) as (keyof Tally)[]) total[key] += tally[key];
    }
    console.log(
      `${GAMES} miracle games: ${JSON.stringify({ ...total, turnsMax: Math.max(...turns) })} (${MIRACLE_NAMES.length} cards)`,
    );

    expectPath(total.revealAsked);
    expectPath(total.revealAccepted);
    expectPath(total.revealDeclined);
    expectPath(total.revealInDrawStep);
    expectPath(total.revealInResolution);
    expectPath(total.triggers);
    expectPath(total.castAsked);
    expectPath(total.castAccepted);
    expectPath(total.miracleSpells);
    expectPath(total.xCasts);
    expectPath(total.casualReveals);
  },
  soakTimeout(240_000),
);
