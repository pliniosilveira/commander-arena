// Slice soak (issue 43, group 1 of the Galadriel deck): whole games with the 'galadrielG1' deck style (SYNTHETIC cards of the engine fixtures `synthetic-galadriel-g1.ts`: the creature that
// scries when a creature of its controller enters and makes the Ring tempt its controller the second time that ability resolves in a turn, the creature that scries 3 when the Ring tempts
// its controller and may reveal the top card whenever its controller scries, the creature that draws whenever its controller scries or surveils, the two sorceries that reveal the top card,
// the planeswalker whose printed loyalty is X, the instant that destroys an artifact, an enchantment or a creature with flying, and a surveil) between random agents, with CasualAgent and
// HeuristicAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every action; the action log replays to the same final state;
// and, with the rules read again here from CR 701.22, 701.25, 603.2c, 608.2c, 701.54a, 306.5b, 107.3m and the cards' texts (not from the engine's own code), at every step:
//   - an Archon Seer on the battlefield triggers once for each scry and once for each surveil of its controller (CR 603.2c, 701.22, 701.25);
//   - a Rivendell Warden makes the Ring tempt its controller exactly once for a turn in which one of its abilities resolved twice or more, the second time (CR 608.2c, 701.54a): the
//     abilities of the Warden for itself and for another creature count together, a third resolution tempts nothing, and no other source of the Ring is in the decks;
//   - a Lorien Lady triggers once for each scry of its controller, and once for each time the Ring tempts its controller when the creature chosen is another creature (CR 603.4, 701.54a);
//   - a Seer of Elements that enters from the stack has as many loyalty counters as the X announced for its spell (CR 306.5b, 107.3m), and none (it dies) for X = 0 (CR 704.5i).
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  applyAction,
  checkInvariants,
  type GameState,
  getLegalActions,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import {
  type Agent,
  CasualAgent,
  HeuristicAgent,
  RandomLegalAgent,
  replayGame,
} from '../src/index';
import { cardNameOf } from './game-names';
import { GALADRIEL_G1_STYLE_PAIRS, type StepInfo, smallGameConfig, stepGame } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const WARDEN = 'SYNTHETIC Rivendell Warden';
const LADY = 'SYNTHETIC Lorien Lady';
const SEER = 'SYNTHETIC Archon Seer';
const WALKER = 'SYNTHETIC Seer of Elements';

interface Tally {
  scryTriggers: number;
  surveilTriggers: number;
  wardenResolutions: number;
  tempts: number;
  ladyRing: number;
  ladyScry: number;
  walkersX: number;
  walkersDead: number;
  loyaltyUsed: number;
  revealed: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  scryTriggers: 0,
  surveilTriggers: 0,
  wardenResolutions: 0,
  tempts: 0,
  ladyRing: 0,
  ladyScry: 0,
  walkersX: 0,
  walkersDead: 0,
  loyaltyUsed: 0,
  revealed: 0,
  byCard: new Map(),
});

/** What each trigger source is still owed, the resolutions of each Warden in a turn, and the tempts the Wardens still owe. */
interface Memory {
  owed: Map<string, number>;
  /** The stack object of a Warden's ability: the Warden and the turn it triggered in. */
  wardenAbilities: Map<ObjectId, { source: ObjectId; turn: number }>;
  resolutions: Map<string, number>;
  owedTempts: number;
}

const controllerIn = (state: GameState, id: ObjectId) =>
  (state.objects[id] ?? state.lki[id]?.object)?.controller;

function owe(memory: Memory, key: string, delta: number): void {
  const owed = (memory.owed.get(key) ?? 0) + delta;
  expect(owed, `${key}: triggered only for an event it reads`).toBeGreaterThanOrEqual(0);
  memory.owed.set(key, owed);
}

function checkRules(t: Tally, step: StepInfo, memory: Memory): void {
  const { before, after, events } = step;
  const turn = before.turn.number;
  // What each source on the battlefield is owed for the events of this step: credit first, since the ability can go on the stack in the step of the event.
  for (const id of after.battlefield) {
    const name = cardNameOf(after, id);
    const seat = controllerIn(after, id);
    if (seat === undefined) continue;
    const key = (index: number) => `${name}:${id}:${index}`;
    const scries = events.filter((e) => e.kind === 'scried' && e.seat === seat).length;
    const surveils = events.filter((e) => e.kind === 'surveiled' && e.seat === seat).length;
    if (name === SEER) {
      owe(memory, key(0), scries);
      owe(memory, key(1), surveils);
    }
    if (name === LADY) {
      owe(memory, key(1), scries);
      // CR 701.54a, 603.4: the creature chosen is another creature than the Lady.
      const another = events.filter(
        (e) => e.kind === 'ringTempted' && e.seat === seat && e.bearer !== null && e.bearer !== id,
      ).length;
      owe(memory, key(0), another);
    }
  }
  // The resolutions come first: the Ring tempts the player in the middle of the resolution, whose event ends the step's list (CR 608.2c).
  for (const e of events) {
    if (e.kind !== 'resolved') continue;
    const ability = memory.wardenAbilities.get(e.object);
    if (ability === undefined) continue;
    t.wardenResolutions += 1;
    const key = `${ability.turn}:${ability.source}`;
    const count = (memory.resolutions.get(key) ?? 0) + 1;
    memory.resolutions.set(key, count);
    // The second time, and only the second, the Ring tempts the controller.
    if (count === 2) memory.owedTempts += 1;
  }
  for (const e of events) {
    if (e.kind === 'abilityTriggered') {
      const known = cardNameOf(before, e.source);
      const name = known === '?' ? cardNameOf(after, e.source) : known;
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      const key = `${name}:${e.source}:${e.abilityIndex}`;
      if (name === SEER) {
        owe(memory, key, -1);
        if (e.abilityIndex === 0) t.scryTriggers += 1;
        if (e.abilityIndex === 1) t.surveilTriggers += 1;
      }
      if (name === LADY) {
        owe(memory, key, -1);
        if (e.abilityIndex === 0) t.ladyRing += 1;
        if (e.abilityIndex === 1) t.ladyScry += 1;
      }
      if (name === WARDEN) memory.wardenAbilities.set(e.stackObject, { source: e.source, turn });
    }
    if (e.kind === 'ringTempted') {
      t.tempts += 1;
      memory.owedTempts -= 1;
      expect(
        memory.owedTempts,
        'the Ring tempts only for a second resolution of a Warden',
      ).toBeGreaterThanOrEqual(0);
    }
    if (e.kind === 'cardsRevealed') t.revealed += 1;
    if (e.kind === 'abilityActivated' && cardNameOf(before, e.source) === WALKER)
      t.loyaltyUsed += 1;
    // CR 306.5b, 107.3m: the planeswalker with X loyalty enters with X loyalty counters, the X of its spell.
    if (
      e.kind === 'zoneChanged' &&
      e.toZone === 'battlefield' &&
      e.fromZone === 'stack' &&
      cardNameOf(after, e.to) === WALKER
    ) {
      const x = before.objects[e.from]?.stack?.x ?? 0;
      const entered = after.objects[e.to];
      if (x === 0) {
        t.walkersDead += 1;
        expect(entered?.zone === 'battlefield', 'X = 0: no counters, and it dies (CR 704.5i)').toBe(
          false,
        );
      } else {
        t.walkersX += 1;
        expect(entered?.counters.loyalty, `X = ${x}: enters with X loyalty counters`).toBe(x);
      }
    }
  }
}

test(
  `${GAMES} galadrielG1 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = GALADRIEL_G1_STYLE_PAIRS[g % GALADRIEL_G1_STYLE_PAIRS.length] ?? [
        'galadrielG1',
        'galadrielG1',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 261000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 261000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 261000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const memory: Memory = {
        owed: new Map(),
        wardenAbilities: new Map(),
        resolutions: new Map(),
        owedTempts: 0,
      };
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step, memory);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
        if (step.index % 97 === 0) {
          const listed = getLegalActions(step.before, step.seat);
          expect(
            listed.some((a) => JSON.stringify(a) === JSON.stringify(step.action)) ||
              applyAction(step.before, step.seat, step.action).ok,
          ).toBe(true);
        }
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      // A tempt still owed at the end of the game can only be one whose Ring-bearer question was open as the game ended.
      expect(memory.owedTempts, tag).toBeLessThanOrEqual(1);
      for (const key of [
        'scryTriggers',
        'surveilTriggers',
        'wardenResolutions',
        'tempts',
        'ladyRing',
        'ladyScry',
        'walkersX',
        'walkersDead',
        'loyaltyUsed',
        'revealed',
      ] as const) {
        total[key] += t[key];
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} galadrielG1 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.scryTriggers, 'a scry that triggers the Archon Seer');
    expectPath(total.surveilTriggers, 'a surveil that triggers the Archon Seer');
    expectPath(total.wardenResolutions, 'an ability of the Rivendell Warden that resolves');
    expectPath(total.tempts, 'the Ring tempts a player');
    expectPath(total.ladyScry, 'a scry that triggers the Lorien Lady');
    expectPath(total.walkersX, 'a planeswalker with X loyalty that enters');
    expectPath(total.revealed, 'a card revealed from the top of a library');
  },
  soakTimeout(600_000),
);
