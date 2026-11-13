// Slice soak (D-1110 to D-1112, provisional): whole games with the 'hashatonLife' deck style (SYNTHETIC cards of the engine fixtures `synthetic-hashaton-g2.ts`: a
// permanent that says "your opponents can't gain life", a demon that makes opponents lose the life they lost this turn again at each end step, an angel that creates a
// token at each end step after a life gain, and a dragon that asks "you may pay that much life. If you do, draw that many cards", with spells and a lifelinker that gain
// life, burn that makes life lost, bodies and removal) between random agents, with CasualAgent in some seats. Every game finishes with a result, no fallback, no
// rejected action and consistent state after every action; the action log replays to the same final state; and two rules of the slice are restated from the events and the
// states, apart from the engine: no player gains life while an opponent controls a permanent that says they can't, through the whole step (CR 119.7), and a player who
// pays life for the dragon draws that many cards at once (CR 119.4, 608.2c). The question is the "may pay" of old, so the agents answer only the questions they always do.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import { checkInvariants, type GameState, type SeatId, stateHash } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { stackNameOf, tokenOrFaceNameOf } from './game-names';
import {
  HASHATON_G2_NAMES,
  HASHATON_G2_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

/** The permanents that say "Your opponents can't gain life". */
const STOPPERS = ['SYNTHETIC Joyless Idol', 'SYNTHETIC Hollow Demon'];

interface Tally {
  lifeGains: number;
  payments: number;
  angels: number;
  demonTriggers: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  lifeGains: 0,
  payments: 0,
  angels: 0,
  demonTriggers: 0,
  byCard: new Map(),
});

/** Whether a player other than `seat` controls a permanent that stops `seat` gaining life. */
function stoppedBy(state: GameState, seat: SeatId): boolean {
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (
      obj !== undefined &&
      obj.controller !== seat &&
      STOPPERS.includes(tokenOrFaceNameOf(state, id))
    ) {
      return true;
    }
  }
  return false;
}

function checkRules(t: Tally, step: StepInfo): void {
  const { before, after, events } = step;
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrFaceNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    }
    if (e.kind === 'lifeGained') {
      t.lifeGains += 1;
      // CR 119.7: nothing gained life while an opponent had the permanent, before and after the step.
      if (stoppedBy(before, e.seat) && stoppedBy(after, e.seat)) {
        throw new Error(`seat ${e.seat} gained ${e.amount} life while an opponent stopped it`);
      }
    }
    if (e.kind === 'optionalAnswered' && e.accepted) {
      // The question is the dragon's own ability, which is still on the stack in the state before the answer.
      if (stackNameOf(before, e.source) === 'SYNTHETIC Ghostly Dragon') t.payments += 1;
    }
    if (e.kind === 'resolved') {
      const name = tokenOrFaceNameOf(before, e.object);
      if (name === 'SYNTHETIC Hollow Demon' || name === 'SYNTHETIC Grudge Demon') {
        t.demonTriggers += 1;
      }
    }
    if (e.kind === 'tokenCreated' && e.name === 'Angel') t.angels += 1;
  }
}

test(
  `${GAMES} hashatonLife games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = HASHATON_G2_STYLE_PAIRS[g % HASHATON_G2_STYLE_PAIRS.length] ?? [
        'hashatonLife',
        'hashatonLife',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 21900 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 21900 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      total.lifeGains += t.lifeGains;
      total.payments += t.payments;
      total.angels += t.angels;
      total.demonTriggers += t.demonTriggers;
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} hashatonLife games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.lifeGains);
    expectPath(total.demonTriggers);
    expectPath(total.payments);
    expectPath(total.angels);
    // Every card of the slice was cast at least once somewhere in the games.
    for (const name of HASHATON_G2_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(240_000),
);
