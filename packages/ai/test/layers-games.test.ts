// Slice soak: whole games (the `soakGames()` count, test/soak.ts) with the 'layers' deck style (SYNTHETIC pump, "becomes a blue Frog",
// keyword grant, type change, flicker and prowess cards: CR 613, 400.7, 702.108) between random
// agents, with CasualAgent in some seats. Every game finishes with a result, no fallback, no
// rejected action, no agent error and consistent state after every action; the action log replays to
// the same final state (the hash covers the continuous effects and their timestamps); and every new
// path occurs: effects of each layer created, flickers (an object exiled and put back as a new
// object), prowess triggers, effects ended at cleanup, and the casual agent casting the helpful
// spells on its own creatures.
import { checkInvariants, type ObjectId, stateHash } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { cardNameOf } from './game-names';
import {
  LAYER_CARD_NAMES,
  LAYER_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  byChange: Map<string, number>;
  flickers: number;
  prowessTriggers: number;
  effectsEnded: number;
  casualOwnPump: number;
  casualOnOpponent: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  byChange: new Map(),
  flickers: 0,
  prowessTriggers: 0,
  effectsEnded: 0,
  casualOwnPump: 0,
  casualOnOpponent: 0,
  byCard: new Map(),
});

function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { before, after, events } = step;
  for (const effect of after.continuousEffects) {
    if (before.continuousEffects.some((e) => e.id === effect.id)) continue;
    tally.byChange.set(effect.change.kind, (tally.byChange.get(effect.change.kind) ?? 0) + 1);
  }
  if (before.continuousEffects.length > 0 && after.continuousEffects.length === 0) {
    tally.effectsEnded += 1;
  }
  const exiled = new Set<ObjectId>();
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = cardNameOf(after, e.object);
      tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
      if (name === 'SYNTHETIC Growth Spurt' && casual.has(e.seat)) {
        // The pump's target is chosen as the spell is cast; read it from the spell on the stack.
        const target = after.objects[e.object]?.stack?.chosenTargets[0];
        const hit = target?.kind === 'object' ? after.objects[target.id] : undefined;
        if (hit !== undefined && hit.controller === e.seat) tally.casualOwnPump += 1;
        if (hit !== undefined && hit.controller !== e.seat) tally.casualOnOpponent += 1;
      }
    }
    if (e.kind === 'zoneChanged' && e.fromZone === 'battlefield' && e.toZone === 'exile') {
      exiled.add(e.to);
    }
    if (e.kind === 'zoneChanged' && e.fromZone === 'exile' && e.toZone === 'battlefield') {
      if (exiled.has(e.from)) tally.flickers += 1;
    }
    if (
      e.kind === 'abilityTriggered' &&
      cardNameOf(after, e.source) === 'SYNTHETIC Prowess Adept'
    ) {
      tally.prowessTriggers += 1;
    }
  }
}

test(
  `${GAMES} layer, flicker and prowess games run clean, replay exactly and use every new path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = LAYER_STYLE_PAIRS[g % LAYER_STYLE_PAIRS.length] ?? ['layers', 'layers'];
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
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      turns.push(run.state.turn.number);
      for (const [k, n] of tally.byChange) total.byChange.set(k, (total.byChange.get(k) ?? 0) + n);
      for (const [k, n] of tally.byCard) total.byCard.set(k, (total.byCard.get(k) ?? 0) + n);
      total.flickers += tally.flickers;
      total.prowessTriggers += tally.prowessTriggers;
      total.effectsEnded += tally.effectsEnded;
      total.casualOwnPump += tally.casualOwnPump;
      total.casualOnOpponent += tally.casualOnOpponent;
    }
    console.log(
      `100 layer games: ${JSON.stringify({
        byChange: Object.fromEntries([...total.byChange].sort()),
        byCard: Object.fromEntries([...total.byCard].sort()),
        flickers: total.flickers,
        prowessTriggers: total.prowessTriggers,
        effectsEnded: total.effectsEnded,
        casualOwnPump: total.casualOwnPump,
        casualOnOpponent: total.casualOnOpponent,
        turnsMax: Math.max(...turns),
      })}`,
    );

    for (const kind of [
      'modifyPt',
      'setPt',
      'loseAllAbilities',
      'setTypes',
      'setColors',
      'grantKeyword',
    ]) {
      expectPath(total.byChange.get(kind) ?? 0, kind);
    }
    expectPath(total.flickers);
    expectPath(total.prowessTriggers);
    expectPath(total.effectsEnded);
    // The casual agent puts the pump on its own creature, never on the opponent's.
    expectPath(total.casualOwnPump);
    expect(total.casualOnOpponent).toBe(0);
    for (const name of LAYER_CARD_NAMES) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(240_000),
);
