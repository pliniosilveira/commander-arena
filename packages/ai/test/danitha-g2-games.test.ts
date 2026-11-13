// Slice soak (D-411, D-412): whole games with the 'danithaMill' deck style (SYNTHETIC cards of the engine fixtures `synthetic-danitha-g2.ts`: creatures with an enters
// trigger and instants that mill cards and ask which card of a kind from among the cards milled to put into the hand, with a counter, life or a Food token as the rider, with bodies
// and removal) between random agents, with CasualAgent and HeuristicAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state
// after every action; the action log replays to the same final state; and, with the rules read again here from the cards' texts (not from the engine's own code), at every step:
//   - the question of the cards milled offers only cards the mill just put into the graveyard (CR 608.2c: "from among them"), all still in the graveyard, and the answer is at most one
//     card, which is then in the hand of the player (CR 701.17a, 400.7);
//   - "If you don't, put a +1/+1 counter on this creature": the counter is put exactly when the answer took no card (CR 608.2c);
//   - "If you put a Town card into your hand this way, you gain 2 life": the life is gained exactly when the card taken is the Town land card;
//   - "If you control a Squirrel or returned a Squirrel card to your hand this way, create a Food token": the token is made exactly when the card taken is the Squirrel card or
//     the player controlled the Squirrel card as a permanent when answering.
// The question is the `move` of old (no new decision kind), so the agents answer only the questions they always do. The count is `soakGames()` (D-126); the path checks run from 100
// games up.
import { checkInvariants, type ObjectId, stateHash } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import {
  type Agent,
  CasualAgent,
  HeuristicAgent,
  RandomLegalAgent,
  replayGame,
} from '../src/index';
import { cardNameOf, stackNameOf, tokenOrFaceNameOf } from './game-names';
import {
  DANITHA_G2_NAMES,
  DANITHA_G2_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const SQUIRREL = 'SYNTHETIC Squirrel Card';
const TOWN = 'SYNTHETIC Town Land';
const COUNTERS = new Set(['SYNTHETIC Mill Three Scout', 'SYNTHETIC Mill Three Chaplain']);
const SOURCES: readonly string[] = DANITHA_G2_NAMES;

interface Tally {
  questions: number;
  taken: number;
  none: number;
  counters: number;
  townLife: number;
  food: number;
  saving: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  questions: 0,
  taken: 0,
  none: 0,
  counters: 0,
  townLife: 0,
  food: 0,
  saving: 0,
  byCard: new Map(),
});

function checkRules(t: Tally, state: { milled: ReadonlySet<ObjectId> }, step: StepInfo): void {
  const { before, after, events, action } = step;
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrFaceNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    }
  }
  // The cards the latest mill put into the graveyard: what "from among them" is.
  const milled = events.filter((e) => e.kind === 'milled');
  if (milled.length > 0) {
    state.milled = new Set(milled.flatMap((e) => (e.kind === 'milled' ? e.objects : [])));
  }
  // The question of the cards milled, raised by this step.
  const asked = after.pending;
  if (
    asked?.kind === 'chooseCards' &&
    asked.purpose === 'move' &&
    asked.zone === 'graveyard' &&
    before.pending !== asked &&
    SOURCES.includes(stackNameOf(after, asked.source))
  ) {
    t.questions += 1;
    for (const id of asked.legal) {
      if (!state.milled.has(id)) throw new Error(`${id} was offered but the mill did not move it`);
      if (after.objects[id]?.zone !== 'graveyard') throw new Error(`${id} is not in the graveyard`);
    }
  }
  // The answer to it, and what the card's riders did.
  const was = before.pending;
  if (
    was?.kind === 'chooseCards' &&
    was.purpose === 'move' &&
    was.zone === 'graveyard' &&
    action.kind === 'chooseCards' &&
    SOURCES.includes(stackNameOf(before, was.source))
  ) {
    const source = stackNameOf(before, was.source);
    if (action.objects.length > 1) throw new Error('more than one card taken');
    const pickedId = action.objects[0];
    const picked = pickedId === undefined ? null : cardNameOf(before, pickedId);
    if (picked === null) t.none += 1;
    else {
      t.taken += 1;
      const hand = after.seats[was.seat]?.hand ?? [];
      if (!hand.some((id) => cardNameOf(after, id) === picked)) {
        throw new Error(`${picked} was taken and is not in the hand`);
      }
    }
    const counters = events.filter((e) => e.kind === 'counterAdded' && e.counter === '+1/+1');
    if (COUNTERS.has(source)) {
      if ((picked === null) !== (counters.length === 1) || counters.length > 1) {
        throw new Error(`${source}: took ${picked}, ${counters.length} counters`);
      }
      t.counters += counters.length;
    }
    const life = events.filter((e) => e.kind === 'lifeGained' && e.seat === was.seat);
    if (source === 'SYNTHETIC Mill Four Greeter') {
      const gained = life.some((e) => e.kind === 'lifeGained' && e.amount === 2);
      if (gained !== (picked === TOWN)) throw new Error(`Greeter: took ${picked}, life ${gained}`);
      if (gained) t.townLife += 1;
    }
    if (source === 'SYNTHETIC Mill Four Saving') {
      if (!life.some((e) => e.kind === 'lifeGained' && e.amount === 1)) {
        throw new Error('Saving: no life gained');
      }
      t.saving += 1;
    }
    if (source === 'SYNTHETIC Mill Four Grab') {
      const controlled = (before.seats[was.seat] ? before.battlefield : []).some(
        (id) => cardNameOf(before, id) === SQUIRREL && before.objects[id]?.controller === was.seat,
      );
      const food = events.filter((e) => e.kind === 'tokenCreated' && e.name === 'Food').length;
      if ((food === 1) !== (picked === SQUIRREL || controlled) || food > 1) {
        throw new Error(`Grab: took ${picked}, controlled ${controlled}, ${food} Food`);
      }
      t.food += food;
    }
  }
}

test(
  `${GAMES} danithaMill games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = DANITHA_G2_STYLE_PAIRS[g % DANITHA_G2_STYLE_PAIRS.length] ?? [
        'danithaMill',
        'danithaMill',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent and HeuristicAgent by game, the rest random.
      const kinds = [
        ['casual', 'random'],
        ['random', 'casual'],
        ['casual', 'heuristic'],
        ['random', 'random'],
      ][g % 4] ?? ['random', 'random'];
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } => {
        const kind = kinds[seat];
        const seed = 42100 + 2 * g + seat;
        return kind === 'casual'
          ? new CasualAgent({ seed })
          : kind === 'heuristic'
            ? new HeuristicAgent({ seed })
            : new RandomLegalAgent({ seed });
      };
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const memory = { milled: new Set<ObjectId>() as ReadonlySet<ObjectId> };
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, memory, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      total.questions += t.questions;
      total.taken += t.taken;
      total.none += t.none;
      total.counters += t.counters;
      total.townLife += t.townLife;
      total.food += t.food;
      total.saving += t.saving;
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} danithaMill games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.questions);
    expectPath(total.taken);
    expectPath(total.saving);
    // Every spell and creature of the slice is cast at least once somewhere in the games.
    for (const name of DANITHA_G2_NAMES.filter((n) => n !== TOWN)) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(240_000),
);
