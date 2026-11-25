// Slice soak: whole games with decks of the SYNTHETIC initiative and venture cards (CR 726, 701.49, 309) between random agents, with CasualAgent in some seats. Every game finishes with a result,
// no fallback, no rejected action, no agent error and consistent state after every action; the action log replays to the same final state; the initiative and the dungeon of every player are
// public (the views of both seats show what the state holds); and every path of the slice occurs (checked from 100 games up). The count is `soakGames()` (D-126).
import { checkInvariants, getView, stateHash } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { COMMANDERS, deckFromMix, type StepInfo, stepGame } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const INITIATIVE_NAMES = [
  'SYNTHETIC Initiative Herald',
  'SYNTHETIC Initiative Flash',
  'SYNTHETIC Initiative Gift',
  'SYNTHETIC Delve Into Undercity',
  'SYNTHETIC Mass Venture',
] as const;
const BODIES = ['Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Serra Angel'] as const;

/** The initiative cards three times each, with bodies to attack and block with, and the basic lands the black and white cards need. */
function config(seed: number) {
  const deck = (offset: number) =>
    deckFromMix({
      commander: COMMANDERS[(seed + offset) % COMMANDERS.length] ?? COMMANDERS[0],
      lands: [
        ...Array.from({ length: 6 }, () => 'Plains'),
        ...Array.from({ length: 6 }, () => 'Swamp'),
      ],
      spells: [...INITIATIVE_NAMES, ...INITIATIVE_NAMES, ...INITIATIVE_NAMES, ...BODIES, ...BODIES],
    });
  return { seed, decks: [deck(0), deck(1)] };
}

interface Tally {
  taken: number;
  takenAgain: number;
  stolen: number;
  upkeepVentures: number;
  ventured: number;
  enteredDungeon: number;
  forks: number;
  completed: number;
  viewsWithInitiative: number;
  viewsWithDungeon: number;
}

const newTally = (): Tally => ({
  taken: 0,
  takenAgain: 0,
  stolen: 0,
  upkeepVentures: 0,
  ventured: 0,
  enteredDungeon: 0,
  forks: 0,
  completed: 0,
  viewsWithInitiative: 0,
  viewsWithDungeon: 0,
});

function note(tally: Tally, step: StepInfo): void {
  const { after, before, events } = step;
  // CR 726.1, 309.4: the initiative and every player's dungeon are public, and both seats see the same.
  if (after.actionCount % 3 === 0) {
    for (const seat of [0, 1] as const) {
      const view = getView(after, seat);
      if (view.initiative !== after.initiative) throw new Error('the view says another initiative');
      if (view.initiative !== undefined) tally.viewsWithInitiative += 1;
      for (const s of view.seats) {
        if (s.dungeon?.room !== after.seats[s.id]?.dungeon?.room) {
          throw new Error('the view says another room');
        }
        if (s.dungeon !== undefined) tally.viewsWithDungeon += 1;
      }
    }
  }
  if (before.pending?.kind === 'chooseOption' && before.pending.purpose === 'dungeonRoom') {
    tally.forks += 1;
  }
  for (const e of events) {
    if (e.kind === 'initiativeTaken') {
      tally.taken += 1;
      if (e.from === e.seat) tally.takenAgain += 1;
      const resolved = events.find((x) => x.kind === 'resolved');
      const object = resolved?.kind === 'resolved' ? resolved.object : null;
      const inherent = object === null ? undefined : before.objects[object]?.stack?.inherent;
      if (inherent === 'initiativeSteal') tally.stolen += 1;
    }
    if (e.kind === 'ventured') {
      tally.ventured += 1;
      if (e.from === null) tally.enteredDungeon += 1;
      const resolved = events.find((x) => x.kind === 'resolved');
      const object = resolved?.kind === 'resolved' ? resolved.object : null;
      if (object !== null && before.objects[object]?.stack?.inherent === 'initiativeUpkeep') {
        tally.upkeepVentures += 1;
      }
    }
    if (e.kind === 'dungeonCompleted') tally.completed += 1;
  }
}

test(
  `${GAMES} initiative games run clean, replay exactly and use every path of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const cfg = config(g);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 7300 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 7300 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const tally = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(cfg, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        note(tally, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(cfg, log)), tag).toBe(stateHash(run.state));
      for (const key of Object.keys(tally) as (keyof Tally)[]) total[key] += tally[key];
    }
    console.log(`${GAMES} initiative games: ${JSON.stringify(total)}`);
    expectPath(total.taken);
    expectPath(total.takenAgain);
    expectPath(total.ventured);
    expectPath(total.enteredDungeon);
    expectPath(total.forks);
    expectPath(total.viewsWithInitiative);
    expectPath(total.viewsWithDungeon);
  },
  soakTimeout(240_000),
);
