// Slice soak (D-1310 to D-1315): whole games with the 'featherG2' deck style (SYNTHETIC cards of the engine fixtures `synthetic-feather-g2.ts`: the creature that gives commander
// creatures +2/+2 and indestructible, the bite with "another target creature", the damage spell with two amounts to two targets, the creature with the trigger of three events and
// "Monstrosity 5", the modal counter-and-untap spell and the land that is for sorcery timing after an instant or sorcery) between random agents, with CasualAgent and HeuristicAgent in
// some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every action; the action log replays to the same final state; and, with the
// rules read again here from the cards' texts (not from the engine's own code), at every step:
//   - a commander creature on the battlefield of a player who controls a Commander Guard has indestructible, and a creature that is no commander and has none of its own does not (CR 903.3);
//   - the two targets of a Hammer Blow are two different creatures and the first is one of the caster's (CR 115.3); the two targets of a Twin Strike are a creature the caster does not
//     control and one they control;
//   - a creature becomes monstrous once: the event comes with five +1/+1 counters on a creature that was not monstrous, never twice for the same permanent (CR 701.37a);
//   - the counter ability of the land is activated in the main phase of its controller with the stack empty, after that player cast an instant or sorcery spell in the same turn
//     (CR 602.5b, 602.5d);
//   - the modes of a Way Light that is cast are one mode, and its targets are what the mode names: a creature or Vehicle, or a permanent the caster controls (CR 700.2).
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
import { cardNameOf, tokenOrCopyNameOf } from './game-names';
import {
  FEATHER_G2_NAMES,
  FEATHER_G2_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const GUARD = 'SYNTHETIC Commander Guard';
const HAMMER = 'SYNTHETIC Hammer Blow';
const TWIN = 'SYNTHETIC Twin Strike';
const TOY = 'SYNTHETIC Spike Toy';
const WAY = 'SYNTHETIC Way Light';
const HALL = 'SYNTHETIC Oracle Hall';
/** The spells of the decks that are an instant or a sorcery, read from their texts. */
const INSTANTS_AND_SORCERIES = new Set([
  HAMMER,
  TWIN,
  WAY,
  'Lightning Bolt',
  'Murder',
  'Divination',
]);
/** The creatures of the decks that have indestructible of their own. */
const OWN_INDESTRUCTIBLE = new Set([TOY]);

interface Tally {
  guards: number;
  hammers: number;
  twins: number;
  monstrous: number;
  hallCounters: number;
  ways: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  guards: 0,
  hammers: 0,
  twins: 0,
  monstrous: 0,
  hallCounters: 0,
  ways: 0,
  byCard: new Map(),
});

function checkRules(
  t: Tally,
  step: StepInfo,
  state: { cast: Set<string>; monstrous: Set<ObjectId> },
): void {
  const { before, after, events } = step;
  // A Commander Guard makes the commander creatures of its controller indestructible; nothing else it does.
  for (const seat of [0, 1] as const) {
    const guard = after.battlefield.some(
      (id) => cardNameOf(after, id) === GUARD && after.objects[id]?.controller === seat,
    );
    for (const id of after.battlefield) {
      const obj = after.objects[id];
      const view = viewOf(after, id);
      if (obj === undefined || view === undefined || obj.controller !== seat) continue;
      if (!view.types.includes('creature')) continue;
      const commander = obj.card !== null && after.cards[obj.card]?.isCommander === true;
      const name = cardNameOf(after, id);
      const indestructible = view.keywords.includes('indestructible');
      if (guard && commander) {
        t.guards += 1;
        expect(indestructible, `${name} is a commander under a Commander Guard`).toBe(true);
      } else if (!commander && !OWN_INDESTRUCTIBLE.has(name)) {
        expect(indestructible, `${name} is no commander and has none of its own`).toBe(false);
      }
    }
  }
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrCopyNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      if (INSTANTS_AND_SORCERIES.has(name)) state.cast.add(`${before.turn.number}:${e.seat}`);
      const stack = after.objects[e.object]?.stack;
      const targets = (stack?.chosenTargets ?? []).flatMap((c) =>
        c.kind === 'object' ? [c.id] : [],
      );
      if (name === HAMMER) {
        t.hammers += 1;
        expect(targets, `${HAMMER}: two targets`).toHaveLength(2);
        const [first, second] = targets;
        expect(first, `${HAMMER}: two different creatures (CR 115.3)`).not.toBe(second);
        expect(after.objects[first as ObjectId]?.controller, `${HAMMER}: the first is yours`).toBe(
          e.seat,
        );
      }
      if (name === TWIN) {
        t.twins += 1;
        expect(targets, `${TWIN}: two targets`).toHaveLength(2);
        const [first, second] = targets;
        expect(
          after.objects[first as ObjectId]?.controller,
          `${TWIN}: the first is not yours`,
        ).not.toBe(e.seat);
        expect(after.objects[second as ObjectId]?.controller, `${TWIN}: the second is yours`).toBe(
          e.seat,
        );
      }
      if (name === WAY) {
        t.ways += 1;
        const modes = stack?.chosenModes ?? [];
        expect(modes, `${WAY}: one mode`).toHaveLength(1);
        const [target] = targets;
        if (modes[0] === 0 && target !== undefined) {
          const view = viewOf(after, target);
          expect(
            view?.types.includes('creature') === true ||
              view?.subtypes.includes('Vehicle') === true,
            `${WAY}: a creature or Vehicle`,
          ).toBe(true);
        }
        if (modes[0] === 1 && target !== undefined) {
          expect(after.objects[target]?.controller, `${WAY}: a permanent you control`).toBe(e.seat);
        }
      }
    }
    if (e.kind === 'becameMonstrous') {
      t.monstrous += 1;
      expect(state.monstrous.has(e.object), 'a permanent becomes monstrous once').toBe(false);
      state.monstrous.add(e.object);
      expect(before.objects[e.object]?.monstrous, 'it was not monstrous').toBeUndefined();
      expect(after.objects[e.object]?.monstrous, 'it is now').toBe(true);
      expect(
        (after.objects[e.object]?.counters['+1/+1'] ?? 0) -
          (before.objects[e.object]?.counters['+1/+1'] ?? 0),
        'five +1/+1 counters',
      ).toBe(5);
    }
    if (e.kind === 'abilityActivated') {
      const name = cardNameOf(before, e.source);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      if (name === HALL && e.abilityIndex === 2) {
        t.hallCounters += 1;
        // The ability is on the stack while it is being activated (CR 602.2a): nothing else is.
        expect(
          before.stack.filter((id) => id !== e.stackObject),
          'the stack was empty (CR 602.5d)',
        ).toHaveLength(0);
        expect(['precombatMain', 'postcombatMain'], 'a main phase').toContain(before.turn.step);
        expect(before.turn.activeSeat, 'in the turn of its controller').toBe(e.seat);
        expect(
          state.cast.has(`${before.turn.number}:${e.seat}`),
          'an instant or sorcery was cast this turn by its controller (CR 602.5b)',
        ).toBe(true);
      }
    }
  }
}

/** The permanent as its controller sees it: the types and keywords the layers leave it. */
function viewOf(state: GameState, id: ObjectId) {
  const controller = state.objects[id]?.controller;
  if (controller === undefined) return undefined;
  return getView(state, controller).battlefield.find((o) => o.id === id);
}

test(
  `${GAMES} featherG2 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = FEATHER_G2_STYLE_PAIRS[g % FEATHER_G2_STYLE_PAIRS.length] ?? [
        'featherG2',
        'featherG2',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 227000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 227000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 227000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const memory = { cast: new Set<string>(), monstrous: new Set<ObjectId>() };
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
      for (const key of [
        'guards',
        'hammers',
        'twins',
        'monstrous',
        'hallCounters',
        'ways',
      ] as const) {
        total[key] += t[key];
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} featherG2 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.hammers, 'Hammer Blow');
    expectPath(total.twins, 'Twin Strike');
    expectPath(total.ways, 'Way Light');
    // The rarer paths: a commander under the Guard, a monstrosity and the land's counter. Checked at 100 games, where the style plays them.
    expectPath(total.guards, 'a commander under a Commander Guard');
    for (const name of FEATHER_G2_NAMES.filter((n) => n !== HALL)) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(600_000),
);
