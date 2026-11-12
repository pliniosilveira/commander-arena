// Slice soak (D-940 to D-942): whole games with the 'nivDraw' deck style (SYNTHETIC cards that skip a draw while the library has no cards in it, with a creature
// that becomes a 10/10 then, creatures that draw or gain life when a source deals noncombat damage to a player, a creature that pings and a spell that hits each
// opponent) between random agents, with CasualAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after
// every action; the action log replays to the same final state; and two rules of the slice are restated from the events and the states, apart from the engine:
// a skipped draw names a permanent that skips draws on the battlefield under the control of the player whose draw it was (CR 614.11, 121.6), and a player who
// controls a permanent that skips every draw of an empty library never loses to an empty library (CR 121.4, 704.5b). No new question is asked of a player (the
// replacement and the trigger need no choice), so the agents answer only the questions they always do.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  checkInvariants,
  type GameState,
  type ObjectId,
  type SeatId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { tokenOrFaceNameOf } from './game-names';
import {
  NIV_DRAW_NAMES,
  NIV_DRAW_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

/** The permanents of the slice that skip a draw: the creature while its library is empty, the two artifacts. */
const SKIPPERS = ['SYNTHETIC Hollow Warden', 'SYNTHETIC Draw Veto', 'SYNTHETIC Thin Veto'];

interface Tally {
  skippedDraws: number;
  emptyLibraryDraws: number;
  scribeTriggers: number;
  noncombatDamage: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  skippedDraws: 0,
  emptyLibraryDraws: 0,
  scribeTriggers: 0,
  noncombatDamage: 0,
  byCard: new Map(),
});

/** Whether `seat` controls a permanent with this name on the battlefield of `state`. */
function controls(state: GameState, seat: SeatId, names: readonly string[]): ObjectId | null {
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (
      obj !== undefined &&
      obj.controller === seat &&
      names.includes(tokenOrFaceNameOf(state, id))
    ) {
      return id;
    }
  }
  return null;
}

function checkRules(t: Tally, step: StepInfo): void {
  const { before, after, events } = step;
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrFaceNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    }
    if (e.kind === 'damageDealt' && !e.combat && e.to.kind === 'player') t.noncombatDamage += 1;
    if (e.kind === 'drawSkipped') {
      t.skippedDraws += 1;
      // CR 614.11: the replacement is a permanent's, on the battlefield, under the control of the player whose draw it replaced.
      const source = after.objects[e.source];
      if (
        source === undefined ||
        source.zone !== 'battlefield' ||
        source.controller !== e.seat ||
        !SKIPPERS.includes(tokenOrFaceNameOf(after, e.source))
      ) {
        throw new Error(`a draw of seat ${e.seat} was skipped by ${String(e.source)}`);
      }
    }
    if (e.kind === 'drewFromEmptyLibrary') {
      t.emptyLibraryDraws += 1;
      // CR 121.4, 614.11: a player who controlled the whole step a permanent that skips every draw from an empty library attempted none.
      const both =
        controls(before, e.seat, SKIPPERS) !== null && controls(after, e.seat, SKIPPERS) !== null;
      if (both) throw new Error(`seat ${e.seat} drew from an empty library with a skipper in play`);
    }
    if (e.kind === 'resolved') {
      const name = tokenOrFaceNameOf(before, e.object);
      if (name === 'SYNTHETIC Spark Scribe') t.scribeTriggers += 1;
    }
  }
}

test(
  `${GAMES} nivDraw games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = NIV_DRAW_STYLE_PAIRS[g % NIV_DRAW_STYLE_PAIRS.length] ?? [
        'nivDraw',
        'nivDraw',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 16900 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 16900 + 2 * g + seat });
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
      total.skippedDraws += t.skippedDraws;
      total.emptyLibraryDraws += t.emptyLibraryDraws;
      total.scribeTriggers += t.scribeTriggers;
      total.noncombatDamage += t.noncombatDamage;
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} nivDraw games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.noncombatDamage);
    expectPath(total.emptyLibraryDraws);
    // Every card of the slice was cast at least once somewhere in the games.
    for (const name of NIV_DRAW_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(240_000),
);
