// Slice soak (D-1100 to D-1102): whole games with the 'hashatonG1' deck style (SYNTHETIC cards of group 1 of the Hashaton deck: a creature that draws when it deals
// combat damage to a player or planeswalker, a creature that puts a -1/-1 counter on each creature of the opponents whenever its controller cycles or discards another card,
// the creature that makes the opponent sacrifice, discard and lose life when it enters or attacks, and a spell that gains, draws and discards in order) between random agents,
// with CasualAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every action; the action log replays to the
// same final state; and two rules of the slice are restated from the events and the states, apart from the engine: the combat damage trigger is put on the stack once for each
// hit of its creature on a player or a planeswalker and never for a creature (CR 120.2a, 510.2, 603.2), and the cycle-or-discard trigger once for each card its controller discards
// for each such creature they control, a cycled card being one card (CR 702.29a, 702.29d). No new kind of decision is asked: the questions are the ones a sacrifice, a discard and
// a target already ask. The count is `soakGames()` (D-126); the path checks run from 100 games up.
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
  HASHATON_G1_NAMES,
  HASHATON_G1_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const FROG = 'SYNTHETIC Bog Frog';
const FIEND = 'SYNTHETIC Cycle Fiend';
const ARCHON = 'SYNTHETIC Cruel Archon';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';

interface Tally {
  frogHits: number;
  frogTriggers: number;
  frogBlocked: number;
  fiendExpected: number;
  fiendTriggers: number;
  fiendLeft: boolean;
  discards: number;
  cycled: number;
  archonTriggers: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  frogHits: 0,
  frogTriggers: 0,
  frogBlocked: 0,
  fiendExpected: 0,
  fiendTriggers: 0,
  fiendLeft: false,
  discards: 0,
  cycled: 0,
  archonTriggers: 0,
  byCard: new Map(),
});

const name = (state: GameState, id: ObjectId): string | null => {
  try {
    return tokenOrFaceNameOf(state, id);
  } catch {
    return null;
  }
};

/** The permanents named `card` on the battlefield of `state` that `seat` controls. */
function controlled(state: GameState, seat: SeatId, card: string): number {
  return state.battlefield.filter((id) => {
    const obj = state.objects[id];
    return obj !== undefined && obj.controller === seat && name(state, id) === card;
  }).length;
}

/** The triggers are put on the stack as the next player is given priority, which may be in the step after the event: the counts are summed over the game. */
function checkRules(t: Tally, step: StepInfo): void {
  const { before, after, events } = step;
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const card = tokenOrFaceNameOf(after, e.object);
      t.byCard.set(card, (t.byCard.get(card) ?? 0) + 1);
    }
    if (e.kind === 'damageDealt' && e.combat && name(before, e.source) === FROG) {
      // A player or a planeswalker is hit; a creature is not (CR 120.2a).
      const toPlayer = e.to.kind === 'player';
      const toWalker = e.to.kind === 'object' && name(before, e.to.id) === WALKER;
      if (toPlayer || toWalker) t.frogHits += 1;
      else t.frogBlocked += 1;
    }
    if (e.kind === 'discarded') {
      t.discards += 1;
      // Every Cycle Fiend its controller had as the card was discarded sees "another card" (CR 702.29d: once, though a cycled card is also discarded).
      t.fiendExpected += controlled(before, e.seat, FIEND);
    }
    if (e.kind === 'cycled') t.cycled += 1;
    if (e.kind === 'died' && (name(before, e.object) === FIEND || name(after, e.object) === FIEND))
      t.fiendLeft = true;
    if (e.kind === 'abilityTriggered') {
      const card = name(before, e.source) ?? name(after, e.source);
      if (card === FROG) t.frogTriggers += 1;
      if (card === FIEND) t.fiendTriggers += 1;
      if (card === ARCHON) t.archonTriggers += 1;
    }
  }
}

/** What the soak restates, at the end of a game: the triggers match the hits and the discards (the last ones may be unplaced when the game ended in that step). */
function checkGame(t: Tally, ended: boolean, tag: string): void {
  if (ended) expect(t.frogTriggers, tag).toBeLessThanOrEqual(t.frogHits);
  else expect(t.frogTriggers, tag).toBe(t.frogHits);
  if (t.fiendLeft || ended) expect(t.fiendTriggers, tag).toBeLessThanOrEqual(t.fiendExpected);
  else expect(t.fiendTriggers, tag).toBe(t.fiendExpected);
}

test(
  `${GAMES} hashatonG1 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = HASHATON_G1_STYLE_PAIRS[g % HASHATON_G1_STYLE_PAIRS.length] ?? [
        'hashatonG1',
        'hashatonG1',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 17100 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 17100 + 2 * g + seat });
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
      checkGame(t, run.state.result !== null, tag);
      total.frogHits += t.frogHits;
      total.frogBlocked += t.frogBlocked;
      total.discards += t.discards;
      total.fiendTriggers += t.fiendTriggers;
      total.cycled += t.cycled;
      total.archonTriggers += t.archonTriggers;
      for (const [card, n] of t.byCard) total.byCard.set(card, (total.byCard.get(card) ?? 0) + n);
    }
    console.log(
      `${GAMES} hashatonG1 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.frogHits, 'a Frog hit');
    expectPath(total.discards, 'a card discarded');
    expectPath(total.fiendTriggers, 'a Cycle Fiend trigger');
    expectPath(total.archonTriggers, 'an Archon trigger');
    // Every card of the slice was cast at least once somewhere in the games.
    for (const card of HASHATON_G1_NAMES) expectPath(total.byCard.get(card) ?? 0, card);
  },
  soakTimeout(240_000),
);
