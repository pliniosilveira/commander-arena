// Slice soak (D-405 to D-408): whole games with the 'danithaG5' deck style (SYNTHETIC cards of the engine fixtures `synthetic-danitha-g5.ts`: a search with "then shuffle
// and put that card on top", an Aura that may move onto each creature that enters, an Aura and a creature with a "Blight N" cost, and Auras that can be cast at flash timing when they
// target a commander, with bodies and removal) between random agents, with CasualAgent and HeuristicAgent in some seats. Every game finishes with a result, no fallback, no rejected
// action and consistent state after every action; the action log replays to the same final state; and, with the rules read again here from the cards' texts (not from the engine's own
// code), at every step:
//   - an activation of a blight cost puts exactly N -1/-1 counters on one creature that its player controlled (CR 701.68a), the creatures the question offers are all theirs and none
//     can't-have the counters (CR 701.68a, 122.6), and the source Aura that is sacrificed with it is in a graveyard when the ability goes on the stack (CR 602.2b);
//   - the Aura that moves onto a creature that entered (an `attached` event of the Wandering Aura or the Loyal Wanderer) is attached to a creature that its enchant ability allows (CR 303.4j),
//     and the Aura that may enchant only its controller's creatures never ends on another player's;
//   - a search of the group ends with the card found on top of the library of the searcher (CR 701.24b), after the shuffle;
//   - a Warding Aura cast when its caster could not cast a sorcery (not their main phase, or something on the stack) has a commander as its target (CR 601.3b, 601.3d).
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
  DANITHA_G5_NAMES,
  DANITHA_G5_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const BLIGHT_COUNTS = new Map([
  ['SYNTHETIC Blighting Aura', 1],
  ['SYNTHETIC Blight Scholar', 2],
]);
const MOVERS = new Set(['SYNTHETIC Wandering Aura', 'SYNTHETIC Loyal Wanderer']);
const FLASH_AURAS = new Set(['SYNTHETIC Warding Aura']);
/** A spell with the permission but no target: the condition can never hold, so it is only ever cast at its controller's sorcery timing. */
const IDLE_FLASH = 'SYNTHETIC Idle Flash Spell';

interface Tally {
  blights: number;
  blightQuestions: number;
  attaches: number;
  searches: number;
  flashCasts: number;
  commanderFlashes: number;
  /** The seats whose Aura cast has begun outside their sorcery timing (the cast takes several steps: the timing is that of the first). */
  flashing: Set<number>;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  blights: 0,
  blightQuestions: 0,
  attaches: 0,
  searches: 0,
  flashCasts: 0,
  commanderFlashes: 0,
  flashing: new Set(),
  byCard: new Map(),
});

/** Whether `seat` could cast a sorcery in `state` (CR 307.1): its own main phase, nothing on the stack. */
function sorceryTiming(state: GameState, seat: number): boolean {
  return (
    state.turn.activeSeat === seat &&
    (state.turn.step === 'precombatMain' || state.turn.step === 'postcombatMain') &&
    state.stack.length === 0
  );
}

function controllerOf(state: GameState, id: ObjectId): number | undefined {
  return state.objects[id]?.controller;
}

function checkRules(t: Tally, step: StepInfo): void {
  const { before, after, events } = step;
  // The timing of a cast is that of the step that began it, with the spell still in the hand.
  if (step.action.kind === 'castSpell') {
    const cast = cardNameOf(before, step.action.object);
    if (FLASH_AURAS.has(cast)) {
      if (sorceryTiming(before, step.seat)) t.flashing.delete(step.seat);
      else t.flashing.add(step.seat);
    }
    if (cast === IDLE_FLASH) {
      expect(sorceryTiming(before, step.seat), `${IDLE_FLASH} is cast at sorcery timing only`).toBe(
        true,
      );
    }
  }
  // The question of a blight cost: only the creatures of the player, none that can't have -1/-1 counters.
  const pending = after.pending;
  if (pending?.kind === 'choosePermanent' && pending.purpose === 'blight') {
    t.blightQuestions += 1;
    expect(pending.forCost, 'a blight is a cost').toBe(true);
    expect(pending.min).toBe(1);
    expect(pending.max).toBe(1);
    for (const id of pending.legal) {
      const obj = after.objects[id];
      expect(obj?.zone, 'blight: on the battlefield').toBe('battlefield');
      expect(obj?.controller, 'blight: a creature the player controls').toBe(pending.seat);
      const view = getView(after, pending.seat).battlefield.find((o) => o.id === id);
      expect(view?.types, 'blight: a creature').toContain('creature');
    }
  }
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrCopyNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      if (FLASH_AURAS.has(name) && t.flashing.has(e.seat)) {
        t.flashing.delete(e.seat);
        t.flashCasts += 1;
        const targets = after.objects[e.object]?.stack?.chosenTargets ?? [];
        expect(targets.length, `${name} at flash timing has a target`).toBeGreaterThan(0);
        const battlefield = getView(after, e.seat).battlefield;
        const commander = targets.some(
          (c) =>
            c.kind === 'object' && battlefield.find((o) => o.id === c.id)?.isCommander === true,
        );
        expect(commander, `${name} at flash timing targets a commander`).toBe(true);
        t.commanderFlashes += 1;
      }
    }
    if (e.kind === 'abilityActivated') {
      const name = cardNameOf(before, e.source);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      const count = BLIGHT_COUNTS.get(name);
      if (count !== undefined) {
        t.blights += 1;
        const added = events.filter(
          (c) => c.kind === 'counterAdded' && c.counter === '-1/-1' && c.by === e.seat,
        );
        expect(added.length, `${name}: one creature is blighted`).toBe(1);
        const [one] = added;
        if (one?.kind !== 'counterAdded') throw new Error('counterAdded expected');
        expect(one.count, `${name}: N counters`).toBe(count);
        expect(controllerOf(before, one.object), `${name}: a creature of its player`).toBe(e.seat);
        expect(before.objects[one.object]?.zone).toBe('battlefield');
        if (name === 'SYNTHETIC Blighting Aura') {
          // CR 602.2b: the sacrifice is a cost, paid before the ability is on the stack.
          expect(after.objects[e.source]?.zone ?? 'gone', `${name} is sacrificed`).not.toBe(
            'battlefield',
          );
        }
      }
    }
    if (e.kind === 'attached') {
      const name = cardNameOf(after, e.object);
      if (MOVERS.has(name)) {
        t.attaches += 1;
        const aura = after.objects[e.object];
        const host = after.objects[e.to];
        expect(host?.zone, `${name} is attached to a permanent on the battlefield`).toBe(
          'battlefield',
        );
        if (name === 'SYNTHETIC Loyal Wanderer') {
          // "Enchant creature you control" (CR 702.5a, 303.4j): never moved onto another player's creature.
          expect(host?.controller, `${name} stays on its controller's creatures`).toBe(
            aura?.controller,
          );
        }
      }
    }
    // A search of the group ends with the card found on top of the library, after the shuffle (CR 701.24b).
    if (e.kind === 'zoneChanged' && e.fromZone === 'library' && e.toZone === 'library') {
      const searcher = events.find((s) => s.kind === 'librarySearched');
      const shuffled = events.findIndex((s) => s.kind === 'libraryShuffled');
      if (searcher?.kind === 'librarySearched' && shuffled >= 0) {
        t.searches += 1;
        const owner = after.objects[e.to]?.owner;
        expect(owner).toBe(searcher.seat);
        expect(after.seats[searcher.seat]?.library[0], 'the card found is on top').toBe(e.to);
        expect(events.indexOf(e), 'it is put on top after the shuffle').toBeGreaterThan(shuffled);
      }
    }
  }
}

test(
  `${GAMES} danithaG5 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = DANITHA_G5_STYLE_PAIRS[g % DANITHA_G5_STYLE_PAIRS.length] ?? [
        'danithaG5',
        'danithaG5',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent and HeuristicAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 202000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 202000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 202000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
        // Every action the agent took is one the engine lists for the seat (the engine accepted it above).
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
        'blights',
        'blightQuestions',
        'attaches',
        'searches',
        'flashCasts',
        'commanderFlashes',
      ] as const) {
        total[key] += t[key];
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} danithaG5 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.blights);
    expectPath(total.attaches);
    expectPath(total.searches);
    // Every card of the slice was cast or activated at least once somewhere in the games, except the one only a commander on the board and a removal can bring about.
    for (const name of DANITHA_G5_NAMES) {
      if (FLASH_AURAS.has(name) || name === 'SYNTHETIC Crowd Aura' || name === IDLE_FLASH) continue;
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(300_000),
);
