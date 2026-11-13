// Slice soak (D-378 to D-380): whole games with the 'hashatonG3' deck style (SYNTHETIC cards of the engine fixtures `synthetic-hashaton-g3.ts`: creatures
// that say counters "can't be put on" the creatures of their controller, a creature that says "draw two cards instead" of a draw but the first of each draw step and one
// that says "twice that many tokens", the spells that make tokens and draw cards, wither, persist and proliferate to put counters on, and the Dragon and Thopter effects
// that order the replacements of tokens with the doubling) between random agents, with CasualAgent in some seats. Every game finishes with a result, no fallback, no
// rejected action and consistent state after every action; the action log replays to the same final state; and three rules of the slice are restated from the events and
// the states, apart from the engine: no -1/-1 counter is put on a creature of a player who controls Counter Ward, and no +1/+1 counter on a creature of a player who
// controls Growth Ward (CR 122.6, 101.2); each draw that was replaced is followed by the draws that replace it, and the first draw of a draw step is not one that was replaced
// (CR 614.11, 504.1); and the tokens a Muster Call or Angel Caller makes are twice as many for each doubling permanent of its controller (CR 614.1a, 614.5). The question of
// the order of the replacements is the one of old, so the agents answer only the questions they always do. The count is `soakGames()` (D-126); the path checks run from 100
// games up.
import { checkInvariants, type GameState, type SeatId, stateHash } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { tokenOrCopyNameOf } from './game-names';
import { HASHATON_G3_STYLE_PAIRS, type StepInfo, smallGameConfig, stepGame } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const DOUBLERS = ['SYNTHETIC Twin Reign', 'SYNTHETIC Token Reign'];
const DRAWERS = ['SYNTHETIC Twin Reign', 'SYNTHETIC Draw Reign'];

interface Tally {
  replacedDraws: number;
  doubledTokens: number;
  rotsKept: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  replacedDraws: 0,
  doubledTokens: 0,
  rotsKept: 0,
  byCard: new Map(),
});

/** How many permanents named in `names` the player controls in the state. */
function controlled(state: GameState, seat: SeatId, names: readonly string[]): number {
  let n = 0;
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (
      obj !== undefined &&
      obj.controller === seat &&
      names.includes(tokenOrCopyNameOf(state, id))
    ) {
      n += 1;
    }
  }
  return n;
}

function checkRules(t: Tally, step: StepInfo): void {
  const { before, after, events } = step;
  // The tokens of one spell that resolved in this step, by the name of the token: twice as many for each doubler the controller of the spell had.
  const made = new Map<string, number>();
  for (const e of events) {
    if (e.kind === 'tokenCreated') made.set(e.name, (made.get(e.name) ?? 0) + 1);
  }
  let drawsThisStep = 0;
  let firstDrawOfStepReplaced = false;
  let sawStepDraw = false;
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrCopyNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    }
    if (e.kind === 'stepBegan' && e.step === 'draw') sawStepDraw = true;
    if (e.kind === 'cardDrawn' || e.kind === 'drewFromEmptyLibrary' || e.kind === 'drawSkipped') {
      drawsThisStep += 1;
    }
    if (e.kind === 'drawReplaced') {
      t.replacedDraws += 1;
      // CR 614.11a: the draws that replace it follow in the same resolution (no question comes in the middle of these decks).
      const after1 = events
        .slice(events.indexOf(e) + 1)
        .filter(
          (x) =>
            (x.kind === 'cardDrawn' ||
              x.kind === 'drewFromEmptyLibrary' ||
              x.kind === 'drawSkipped') &&
            x.seat === e.seat,
        );
      if (after1.length < e.count) {
        throw new Error(
          `seat ${e.seat}: a draw was replaced by ${e.count} and only ${after1.length} followed`,
        );
      }
      // The permanents named are permanents of its controller that replace draws.
      for (const source of e.sources) {
        const name = tokenOrCopyNameOf(before, source);
        if (!DRAWERS.includes(name)) throw new Error(`a draw was replaced by ${name}`);
      }
      // CR 504.1: not the first draw of the draw step.
      if (sawStepDraw && drawsThisStep === 0) firstDrawOfStepReplaced = true;
    }
    if (e.kind === 'counterAdded' && (e.counter === '-1/-1' || e.counter === '+1/+1')) {
      const obj = after.objects[e.object];
      if (obj === undefined) continue;
      const ward = e.counter === '-1/-1' ? 'SYNTHETIC Counter Ward' : 'SYNTHETIC Growth Ward';
      // CR 122.6, 101.2: the ward was there before and after the step, and the creature is its controller's: no such counter, on the battlefield or as it enters.
      if (
        controlled(before, obj.controller, [ward]) > 0 &&
        controlled(after, obj.controller, [ward]) > 0
      ) {
        throw new Error(`a ${e.counter} counter was put on a creature of a player with ${ward}`);
      }
      t.rotsKept += 1;
    }
    if (e.kind === 'resolved') {
      const name = tokenOrCopyNameOf(before, e.object);
      const caster = before.objects[e.object]?.controller;
      if (caster === undefined) continue;
      const k = controlled(before, caster, DOUBLERS);
      if (name === 'SYNTHETIC Muster Call') {
        const soldiers = made.get('Soldier') ?? 0;
        if (soldiers !== 2 * 2 ** k) {
          throw new Error(`Muster Call made ${soldiers} Soldiers with ${k} doublers`);
        }
        if (k > 0) t.doubledTokens += soldiers;
      }
      if (name === 'SYNTHETIC Angel Caller') {
        const angels = made.get('Angel') ?? 0;
        if (angels !== 2 ** k)
          throw new Error(`Angel Caller made ${angels} Angels with ${k} doublers`);
        if (k > 0) t.doubledTokens += angels;
      }
    }
  }
  if (firstDrawOfStepReplaced) throw new Error('the first draw of a draw step was replaced');
}

test(
  `${GAMES} hashatonG3 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = HASHATON_G3_STYLE_PAIRS[g % HASHATON_G3_STYLE_PAIRS.length] ?? [
        'hashatonG3',
        'hashatonG3',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 31500 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 31500 + 2 * g + seat });
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
      total.replacedDraws += t.replacedDraws;
      total.doubledTokens += t.doubledTokens;
      total.rotsKept += t.rotsKept;
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} hashatonG3 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.replacedDraws);
    expectPath(total.doubledTokens);
    for (const name of [
      'SYNTHETIC Twin Reign',
      'SYNTHETIC Draw Reign',
      'SYNTHETIC Token Reign',
      'SYNTHETIC Counter Ward',
      'SYNTHETIC Muster Call',
      'SYNTHETIC Quick Study',
    ]) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(240_000),
);
