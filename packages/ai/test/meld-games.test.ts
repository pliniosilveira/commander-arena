// Slice soak (D-991, D-993): whole games from states with a meld pair, with the SYNTHETIC cards of the engine's fixtures (SYNTHETIC Dusk Squire and SYNTHETIC Dawn Squire meld into
// SYNTHETIC Twilight Titan at the beginning of their controller's end step; removal spells wait in the opponent's hand), between every kind of agent. Every game finishes with a result,
// no fallback, no rejected action and consistent state after every action; the action log replays to the same final state; and the rules of the slice are restated from the events and the
// state, apart from the engine: two cards that meld become one object that both represent (the second card has no object of its own), a melded permanent that leaves the battlefield
// is one `died` or one departure and two cards arrive, and the question of the order of the two cards (CR 712.21a, 712.21b) goes to their owner and is answered with one of
// its options, the first for a casual or greedy agent. The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  type Action,
  applyAction,
  checkInvariants,
  type GameEvent,
  type GameState,
  stateHash,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import {
  type Agent,
  CasualAgent,
  GreedyAgent,
  HeuristicAgent,
  RandomLegalAgent,
  replayGame,
} from '../src/index';
import { type StepInfo, smallGameConfig, stepGame } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };
const DUSK = 'SYNTHETIC Dusk Squire';
const DAWN = 'SYNTHETIC Dawn Squire';
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

/** Seat 0 has the pair on the battlefield at its main phase; seat 1 has removal and mana. `commander`: the card with the ability is seat 0's commander; `melded`: they are melded already. */
function startState(variant: number): GameState {
  const commander = variant % 2 === 1;
  const melded = variant % 4 >= 2;
  const b = scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield('Plains', 'Plains', 'Swamp', 'Swamp')
    .battlefield(DUSK, {
      label: 'dusk',
      ...(melded ? { meldedWith: 'dawn' } : {}),
      ...(commander ? { commander: true } : {}),
    })
    .battlefield(DAWN, { label: 'dawn' })
    .seat(1)
    .library(...LIBRARY)
    .battlefield('Swamp', 'Swamp', 'Swamp', 'Island', 'Island')
    .hand('Murder', 'Unsummon', 'SYNTHETIC Meld Exile', 'SYNTHETIC Meld Tuck');
  return b.at('precombatMain', { active: 0, priority: 0 }).build().state;
}

type Kind = 'random' | 'casual' | 'greedy' | 'heuristic';
const KINDS: readonly Kind[] = ['random', 'casual', 'greedy', 'heuristic'];

function make(kind: Kind, seed: number): Agent & { fallbacks: readonly unknown[] } {
  return kind === 'casual'
    ? new CasualAgent({ seed })
    : kind === 'greedy'
      ? new GreedyAgent({ seed })
      : kind === 'heuristic'
        ? new HeuristicAgent({ seed })
        : new RandomLegalAgent({ seed });
}

interface Tally {
  melded: number;
  diedOnce: number;
  twoCards: number;
  orderAsked: number;
  commanderAsked: number;
}

const newTally = (): Tally => ({
  melded: 0,
  diedOnce: 0,
  twoCards: 0,
  orderAsked: 0,
  commanderAsked: 0,
});

function checkRules(t: Tally, kinds: readonly [Kind, Kind], step: StepInfo): void {
  const { before, after, events } = step;
  for (const e of events) {
    if (e.kind === 'melded') {
      t.melded += 1;
      // One object that both cards represent: the second card has no object of its own.
      const permanent = after.objects[e.permanent];
      expect(permanent?.zone === 'battlefield' || permanent === undefined).toBe(true);
      if (permanent !== undefined) {
        expect(permanent.meldedWith).toBeDefined();
        expect(permanent.face).toBe(1);
      }
    }
  }
  // A melded permanent that left: one `died` (when it went to a graveyard) and two cards, the second event flagged (CR 712.21).
  const left = new Set<string>();
  for (const e of events) {
    if (
      e.kind === 'zoneChanged' &&
      e.fromZone === 'battlefield' &&
      before.objects[e.from]?.meldedWith !== undefined
    ) {
      left.add(e.from);
    }
  }
  for (const id of left) {
    const moves = events.filter(
      (e): e is Extract<GameEvent, { kind: 'zoneChanged' }> =>
        e.kind === 'zoneChanged' && e.from === id,
    );
    // Two cards, except the commander card going to the command zone and the other to its zone: still two moves.
    expect(moves, `the permanent ${id} became two cards`).toHaveLength(2);
    expect(moves.filter((m) => m.component === true)).toHaveLength(1);
    t.twoCards += 1;
    const died = events.filter((e) => e.kind === 'died' && e.object === id);
    if (moves.every((m) => m.toZone === 'graveyard')) {
      expect(died).toHaveLength(1);
      t.diedOnce += 1;
    }
  }
  // The order of the two cards: asked of their owner, answered with an option, the first by a casual or greedy agent (CR 712.21a, 712.21b).
  const asked = before.pending;
  if (asked?.kind === 'chooseOption' && asked.purpose === 'meldOrder') {
    t.orderAsked += 1;
    expect(step.seat).toBe(asked.seat);
    expect(asked.options).toHaveLength(2);
    if (step.action.kind !== 'chooseOption') throw new Error(`answered with ${step.action.kind}`);
    expect(asked.options).toContain(step.action.option);
    const kind = kinds[step.seat];
    if (kind === 'casual' || kind === 'greedy') expect(step.action.option).toBe(asked.options[0]);
  }
  if (asked?.kind === 'commanderZone') t.commanderAsked += 1;
  void after;
}

const add = (total: Tally, t: Tally): void => {
  for (const key of Object.keys(t) as (keyof Tally)[]) total[key] += t[key];
};

test(
  `${GAMES} meld games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const kinds: readonly [Kind, Kind] = [
        KINDS[g % 4] ?? 'random',
        KINDS[(g >> 2) % 4] ?? 'random',
      ];
      const start = startState(g);
      const config = smallGameConfig(g);
      const agents = [make(kinds[0], 41000 + 2 * g), make(kinds[1], 41001 + 2 * g)] as const;
      const log: { seat: number; action: Action }[] = [];
      const t = newTally();
      const run = await stepGame(
        config,
        agents,
        LIMITS,
        (step) => {
          log.push({ seat: step.seat, action: step.action });
          checkRules(t, kinds, step);
          const problems = checkInvariants(step.after);
          if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
        },
        start,
      );
      const tag = `game ${g} (${kinds.join(' v ')})`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      let replayed = start;
      for (const { seat, action } of log) {
        const r = applyAction(replayed, seat, action);
        if (!r.ok) throw new Error(`${tag}: replay rejected ${action.kind}: ${r.error}`);
        replayed = r.state;
      }
      expect(stateHash(replayed), tag).toBe(stateHash(run.state));
      add(total, t);
    }
    console.log(`${GAMES} meld games: ${JSON.stringify(total)}`);
    expectPath(total.melded, 'a meld');
    expectPath(total.twoCards, 'a melded permanent that left as two cards');
  },
  soakTimeout(300_000),
);

test('a game from the state is deterministic: the same seeds give the same game', async () => {
  const run = async () => {
    const start = startState(2);
    const config = smallGameConfig(7);
    const agents = [make('heuristic', 5), make('casual', 6)] as const;
    const log: { seat: number; action: StepInfo['action'] }[] = [];
    const done = await stepGame(
      config,
      agents,
      LIMITS,
      (s) => log.push({ seat: s.seat, action: s.action }),
      start,
    );
    return stateHash(done.state);
  };
  expect(await run()).toBe(await run());
  void replayGame;
});
