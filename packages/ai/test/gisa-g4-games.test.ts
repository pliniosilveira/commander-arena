// Slice soak (D-1430 to D-1433): whole games with the 'gisaG4' deck style (SYNTHETIC cards of the engine fixtures `synthetic-gisa-g4.ts`: a Whip that returns a creature card from the
// graveyard with haste and a delayed exile, the Tools that make the abilities of creature cards in your graveyard cost {1} less, a creature with an ability that works from the hand with
// a reveal cost, and a Vacuum with a linked exile that is sacrificed to put the creature cards back as 1/1 Spirits) between random agents, with CasualAgent and HeuristicAgent in some
// seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every action; the action log replays to the same final state; and, with the
// rules read again here from the cards' texts (not from the engine's own code), at every step:
//   - the activation of the hand ability of Prey Hunter reveals the card (a public event with its name), leaves it in the hand, is made only in the turn of its controller and is not a
//     cast (CR 701.20a, 602.5b, 113.6b);
//   - after the enters trigger of a Prey Hunter resolves, no creature of an opponent of its controller has a prey counter (CR 603.2);
//   - a creature the Whip returned has left the battlefield by the next cleanup step, and by no way but exile (CR 603.7c, 614.1a), and is never in a graveyard while it waits;
//   - the creatures the Vacuum puts onto the battlefield from exile enter under its controller's control with a flying counter, and are 1/1 Spirits (CR 607.2a, 613.1d, 613.4b).
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  applyAction,
  checkInvariants,
  type GameState,
  getLegalActions,
  getView,
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
import { tokenOrCopyNameOf } from './game-names';
import { GISA_G4_STYLE_PAIRS, type StepInfo, smallGameConfig, stepGame } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const WHIP = 'SYNTHETIC Grave Whip';
const HUNTER = 'SYNTHETIC Prey Hunter';
const VACUUM = 'SYNTHETIC Soul Vacuum';
const TOOLS = 'SYNTHETIC Grave Tools';

interface Tally {
  reveals: number;
  prey: number;
  hunterTriggers: number;
  whipCasts: number;
  whipReturns: number;
  whipExiled: number;
  vacuumExiles: number;
  vacuumSpirits: number;
  unearthWithTools: number;
  byCard: Map<string, number>;
}

const COUNTS = [
  'reveals',
  'prey',
  'hunterTriggers',
  'whipCasts',
  'whipReturns',
  'whipExiled',
  'vacuumExiles',
  'vacuumSpirits',
  'unearthWithTools',
] as const;

const newTally = (): Tally => ({
  reveals: 0,
  prey: 0,
  hunterTriggers: 0,
  whipCasts: 0,
  whipReturns: 0,
  whipExiled: 0,
  vacuumExiles: 0,
  vacuumSpirits: 0,
  unearthWithTools: 0,
  byCard: new Map(),
});

interface Memory {
  /** The creatures the Whip returned that are still on the battlefield, with the turn they came back. */
  returned: Map<ObjectId, number>;
  /** The abilities of a Prey Hunter on the stack. */
  hunterTriggers: Set<string>;
  /** The reveals of a Prey Hunter from the hand seen so far, and the activations of its hand ability. */
  reveals: number;
  activations: number;
}

const newMemory = (): Memory => ({
  returned: new Map(),
  hunterTriggers: new Set(),
  reveals: 0,
  activations: 0,
});

/** The abilities and spells of an action's step by the name of their source. */
function sourceNameOf(state: GameState, id: ObjectId): string {
  const obj = state.objects[id];
  const source = obj?.stack?.source;
  return source == null ? tokenOrCopyNameOf(state, id) : tokenOrCopyNameOf(state, source);
}

function checkHunter(t: Tally, mem: Memory, step: StepInfo): void {
  const { before, after, events } = step;
  for (const e of events) {
    if (e.kind === 'abilityActivated') {
      const name = tokenOrCopyNameOf(before, e.source);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      const source = before.objects[e.source];
      if (name === HUNTER && source?.zone === 'hand') {
        // Only in the controller's turn, with the card revealed and still in the hand.
        expect(
          after.turn.activeSeat,
          'a hand ability of Prey Hunter is activated in its own turn',
        ).toBe(step.seat);
        // The cost is paid before the mana is (an earlier step of the activation), so the reveal was seen by now.
        mem.activations += 1;
        expect(mem.reveals, 'the cost reveals the card').toBeGreaterThanOrEqual(mem.activations);
        expect(after.objects[e.source]?.zone, 'the card stays in the hand').toBe('hand');
        expect(
          events.some((x) => x.kind === 'spellCast'),
          'it is an ability, not a cast',
        ).toBe(false);
        t.reveals += 1;
      }
    }
    if (e.kind === 'counterAdded' && e.counter === 'prey') t.prey += 1;
    if (e.kind === 'cardsRevealed' && e.from === 'hand' && e.names.includes(HUNTER))
      mem.reveals += 1;
  }
  // The enters trigger of a Prey Hunter on the stack, and then resolved.
  for (const id of after.stack) {
    const obj = after.objects[id];
    if (obj?.stack?.kind === 'ability' && sourceNameOf(after, id) === HUNTER) {
      const source = obj.stack.source != null ? after.objects[obj.stack.source] : undefined;
      if (source?.zone === 'battlefield') mem.hunterTriggers.add(id);
    }
  }
  for (const e of events) {
    if (e.kind !== 'resolved' || !mem.hunterTriggers.has(e.object)) continue;
    mem.hunterTriggers.delete(e.object);
    const stack = before.objects[e.object]?.stack;
    const controller = before.objects[e.object]?.controller;
    if (stack?.kind !== 'ability' || controller === undefined) continue;
    t.hunterTriggers += 1;
    for (const id of after.battlefield) {
      const obj = after.objects[id];
      if (obj === undefined || obj.controller === controller) continue;
      const creature = getView(after, controller).battlefield.find((o) => o.id === id);
      if (creature?.types.includes('creature') !== true) continue;
      expect(
        obj.counters.prey ?? 0,
        'no creature of an opponent keeps a prey counter after the enters trigger resolved',
      ).toBe(0);
    }
  }
}

function checkWhip(t: Tally, mem: Memory, step: StepInfo): void {
  const { before, after, events } = step;
  for (const e of events) {
    if (e.kind === 'spellCast' && tokenOrCopyNameOf(after, e.object) === WHIP) t.whipCasts += 1;
  }
  // A creature card moved from a graveyard to the battlefield by the resolution of a Whip ability.
  for (const e of events) {
    if (e.kind !== 'resolved') continue;
    const ability = before.objects[e.object];
    if (ability?.stack?.kind !== 'ability' || ability.stack.source == null) continue;
    if (tokenOrCopyNameOf(before, ability.stack.source) !== WHIP) continue;
    for (const z of events) {
      if (z.kind === 'zoneChanged' && z.fromZone === 'graveyard' && z.toZone === 'battlefield') {
        mem.returned.set(z.to, after.turn.number);
        t.whipReturns += 1;
      }
    }
  }
  for (const e of events) {
    if (e.kind !== 'zoneChanged') continue;
    if (mem.returned.has(e.from) && e.fromZone === 'battlefield') {
      mem.returned.delete(e.from);
      // A creature the Whip returned leaves the battlefield only to exile (or the command zone for a commander, which asks first).
      expect(
        ['exile', 'command'].includes(e.toZone),
        `a creature the Whip returned went to ${e.toZone}`,
      ).toBe(true);
      if (e.toZone === 'exile') t.whipExiled += 1;
    }
  }
  // Nothing the Whip returned survives its turn: by the cleanup step of that turn it is gone.
  for (const [id, turn] of mem.returned) {
    if (after.objects[id]?.zone !== 'battlefield') {
      mem.returned.delete(id);
      continue;
    }
    if (after.turn.number > turn) {
      throw new Error(
        `a creature the Whip returned stayed on the battlefield into turn ${after.turn.number}`,
      );
    }
  }
}

function checkVacuum(t: Tally, step: StepInfo): void {
  const { before, after, events } = step;
  for (const e of events) {
    if (e.kind === 'zoneChanged' && e.fromZone === 'graveyard' && e.toZone === 'exile') {
      const source = events.find((x) => x.kind === 'resolved');
      if (source?.kind === 'resolved') {
        const ability = before.objects[source.object];
        if (
          ability?.stack?.kind === 'ability' &&
          ability.stack.source != null &&
          tokenOrCopyNameOf(before, ability.stack.source) === VACUUM
        ) {
          t.vacuumExiles += 1;
        }
      }
    }
    if (e.kind === 'zoneChanged' && e.fromZone === 'exile' && e.toZone === 'battlefield') {
      const resolved = events.find((x) => x.kind === 'resolved');
      if (resolved?.kind !== 'resolved') continue;
      const ability = before.objects[resolved.object];
      const source = ability?.stack?.kind === 'ability' ? ability.stack.source : null;
      if (source == null || tokenOrCopyNameOf(before, source) !== VACUUM) continue;
      const controller = ability?.controller;
      const now = after.objects[e.to];
      expect(
        now?.controller,
        'the creature enters under the control of the Vacuum controller',
      ).toBe(controller);
      expect(now?.counters.flying, 'it has a flying counter').toBe(1);
      const view = getView(after, controller ?? 0).battlefield.find((o) => o.id === e.to);
      expect(view?.power, 'a 1/1').toBe(1);
      expect(view?.toughness, 'a 1/1').toBe(1);
      expect(view?.subtypes, 'a Spirit in addition to its other types').toContain('Spirit');
      t.vacuumSpirits += 1;
    }
  }
}

function checkTools(t: Tally, step: StepInfo): void {
  const { before, events } = step;
  for (const e of events) {
    if (e.kind !== 'abilityActivated') continue;
    const source = before.objects[e.source];
    if (source?.zone !== 'graveyard') continue;
    const tools = before.battlefield.some(
      (id) =>
        before.objects[id]?.controller === step.seat && tokenOrCopyNameOf(before, id) === TOOLS,
    );
    if (tools) t.unearthWithTools += 1;
  }
}

test(
  `${GAMES} gisaG4 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = GISA_G4_STYLE_PAIRS[g % GISA_G4_STYLE_PAIRS.length] ?? ['gisaG4', 'gisaG4'];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 411000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 411000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 411000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const mem = newMemory();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkHunter(t, mem, step);
        checkWhip(t, mem, step);
        checkVacuum(t, step);
        checkTools(t, step);
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
      expect(mem.reveals, `${tag}: every reveal paid for an activation`).toBe(mem.activations);
      for (const key of COUNTS) total[key] += t[key];
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} gisaG4 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    // The Spirits need the Vacuum untapped, a creature card exiled with it and six untapped lands in a main phase of a small deck: the random agents (and the casual one, which has no
    // use for the Vacuum) do not reach it in 100 games, so the engine scenarios prove that path (`scenario-xx-gisa-g4-graveyard.test.ts`); the checks above run when it happens.
    for (const key of COUNTS) {
      if (key !== 'vacuumSpirits') expectPath(total[key], key);
    }
    for (const name of [WHIP, HUNTER, VACUUM]) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(300_000),
);
