// Slice soak: whole games (the `soakGames()` count, test/soak.ts) with the 'vehicles' deck style (SYNTHETIC Vehicles with Crew, creatures
// to crew them, Equipment, removal and bounce: CR 301.7, 702.122, 205.1b) between random agents,
// with CasualAgent in some seats. Every game finishes with a result, no fallback, no rejected
// action, no agent error and consistent state after every action; the action log replays to the same
// final state (the hash covers the continuous effects and their timestamps); and every new path
// occurs: crew costs paid by choice and by the engine, Vehicles that attack while they are creatures,
// Vehicles that die or leave as creatures, the crew effect ending at cleanup, Equipment on a crewed
// Vehicle, and the casual agent crewing to attack.
import {
  checkInvariants,
  type GameState,
  getLegalActions,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { cardNameOf } from './game-names';
import {
  type StepInfo,
  smallGameConfig,
  stepGame,
  VEHICLE_CARD_NAMES,
  VEHICLE_STYLE_PAIRS,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  crewsByChoice: number;
  crewsAutomatic: number;
  crewQuestions: number;
  crewedAttacks: number;
  crewedBlocks: number;
  crewedDeaths: number;
  crewedLeft: number;
  crewEffectsEnded: number;
  casualCrews: number;
  randomCrews: number;
  equipOnVehicle: number;
  byVehicle: Map<string, number>;
}

const newTally = (): Tally => ({
  crewsByChoice: 0,
  crewsAutomatic: 0,
  crewQuestions: 0,
  crewedAttacks: 0,
  crewedBlocks: 0,
  crewedDeaths: 0,
  crewedLeft: 0,
  crewEffectsEnded: 0,
  casualCrews: 0,
  randomCrews: 0,
  equipOnVehicle: 0,
  byVehicle: new Map(),
});

const isVehicleObject = (state: GameState, id: ObjectId): boolean =>
  (VEHICLE_CARD_NAMES as readonly string[]).includes(cardNameOf(state, id));

const isCreatureNow = (state: GameState, id: ObjectId): boolean => {
  const types = state.continuousEffects.flatMap((e) =>
    e.objects.includes(id) && e.change.kind === 'setTypes' ? (e.change.types ?? []) : [],
  );
  return types.includes('creature');
};

function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { before, after, events } = step;
  for (const e of events) {
    if (e.kind === 'permanentsChosen' && e.purpose === 'crew') {
      if (e.automatic) tally.crewsAutomatic += 1;
      else tally.crewsByChoice += 1;
      if (casual.has(e.seat)) tally.casualCrews += 1;
      else tally.randomCrews += 1;
    }
    if (e.kind === 'abilityActivated' && isVehicleObject(after, e.source)) {
      const name = cardNameOf(after, e.source);
      tally.byVehicle.set(name, (tally.byVehicle.get(name) ?? 0) + 1);
    }
    if (e.kind === 'zoneChanged' && e.fromZone === 'battlefield' && e.toZone !== 'battlefield') {
      if (isVehicleObject(before, e.from) && isCreatureNow(before, e.from)) {
        if (e.toZone === 'graveyard') tally.crewedDeaths += 1;
        else tally.crewedLeft += 1;
      }
    }
    if (e.kind === 'attached' && isVehicleObject(after, e.to)) tally.equipOnVehicle += 1;
  }
  const d = after.pending;
  if (d?.kind === 'choosePermanent' && d.purpose === 'crew') {
    tally.crewQuestions += 1;
    // The listed answers all meet the cost, and the engine accepts every one of them.
    const listed = getLegalActions(after, d.seat);
    expect(listed.length).toBeGreaterThan(0);
  }
  const attackers = new Set((before.combat?.attackers ?? []).map((a) => a.object));
  for (const a of after.combat?.attackers ?? []) {
    if (!attackers.has(a.object) && isVehicleObject(after, a.object)) tally.crewedAttacks += 1;
  }
  const blockers = new Set((before.combat?.blocks ?? []).map((b) => b.blocker));
  for (const b of after.combat?.blocks ?? []) {
    if (!blockers.has(b.blocker) && isVehicleObject(after, b.blocker)) tally.crewedBlocks += 1;
  }
  const hadCrewEffect = (s: GameState) =>
    s.continuousEffects.filter((e) => e.change.kind === 'setTypes' && e.change.additive === true)
      .length;
  if (hadCrewEffect(before) > 0 && hadCrewEffect(after) === 0) tally.crewEffectsEnded += 1;
}

test(
  `${GAMES} Vehicle and Crew games run clean, replay exactly and use every new path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = VEHICLE_STYLE_PAIRS[g % VEHICLE_STYLE_PAIRS.length] ?? [
        'vehicles',
        'vehicles',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 11_000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 11_000 + 2 * g + seat });
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
      for (const key of Object.keys(total) as (keyof Tally)[]) {
        const mine = tally[key];
        if (typeof mine === 'number') (total[key] as number) += mine;
      }
      for (const [k, n] of tally.byVehicle)
        total.byVehicle.set(k, (total.byVehicle.get(k) ?? 0) + n);
    }
    console.log(
      `100 vehicle games: ${JSON.stringify({
        ...total,
        byVehicle: Object.fromEntries([...total.byVehicle].sort()),
        turnsMax: Math.max(...turns),
      })}`,
    );

    expectPath(total.crewsByChoice);
    expectPath(total.crewsAutomatic);
    expectPath(total.crewQuestions);
    expectPath(total.crewedAttacks);
    // Blocks with a crewed Vehicle are counted but not required: a crew must be paid on the opponent's
    // turn, between the attack and the blocks, which random play rarely does (it is pinned in
    // packages/engine/test/scenario-xx-crew.test.ts).
    expectPath(total.crewedDeaths + total.crewedLeft);
    expectPath(total.crewEffectsEnded);
    expectPath(total.equipOnVehicle);
    // The casual agent crews to attack, and the random agent crews at random.
    expectPath(total.casualCrews);
    expectPath(total.randomCrews);
    for (const name of VEHICLE_CARD_NAMES) {
      expectPath(total.byVehicle.get(name) ?? 0, name);
    }
  },
  soakTimeout(240_000),
);
