// Slice soak (D-1440 to D-1444): whole games with the 'gisaG5' deck style (SYNTHETIC cards of the engine fixtures `synthetic-gisa-g5.ts`: a creature with decayed, the sorceries that give
// decayed until end of turn and put a decayed counter, the artifact that grows corpse counters and is sacrificed for that many decayed Zombies, the creature with the end step trigger
// that has an intervening "if you control no creatures with decayed", the Zombie with cycling and the life loss counted on the Zombies of the battlefield, and the creature that escapes
// with two +1/+1 counters) between random agents, with CasualAgent and HeuristicAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent
// state after every action; the action log replays to the same final state; and, with the rules read again here from the cards' texts (not from the engine's own code), at every step:
//   - a creature with decayed never blocks (CR 702.147a), and one that attacks is no longer on the battlefield when the next phase begins (it is sacrificed at end of combat);
//   - a Husk Raiser's ability is put on the stack only when its controller controls no creature with decayed (CR 603.4);
//   - the activation of a Corpse Vault makes a Zombie for each corpse counter it had when it was sacrificed, no more (CR 113.7a);
//   - the life lost to a cycled Rot Cycler's ability is the number of Zombies on the battlefield (CR 702.29c);
//   - a Grave Strider that was cast for its escape cost enters with two +1/+1 counters and one cast from the hand with none (CR 702.138c).
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
  GISA_G5_NAMES,
  GISA_G5_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const VAULT = 'SYNTHETIC Corpse Vault';
const RAISER = 'SYNTHETIC Husk Raiser';
const CYCLER = 'SYNTHETIC Rot Cycler';
const STRIDER = 'SYNTHETIC Grave Strider';

interface Tally {
  decayedAttacks: number;
  sacrificedAtEnd: number;
  decayedBlocks: number;
  raiserTriggers: number;
  vaultActivations: number;
  vaultTokens: number;
  cycles: number;
  lifeLost: number;
  escapes: number;
  handCasts: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  decayedAttacks: 0,
  sacrificedAtEnd: 0,
  decayedBlocks: 0,
  raiserTriggers: 0,
  vaultActivations: 0,
  vaultTokens: 0,
  cycles: 0,
  lifeLost: 0,
  escapes: 0,
  handCasts: 0,
  byCard: new Map(),
});

/** What the games remember between steps. */
interface Memory {
  /** The creatures that attacked with decayed, to be gone when the combat is over. */
  attacked: Set<ObjectId>;
  /** The Zombies a Corpse Vault ability on the stack will make: the corpse counters it had. */
  vault: Map<ObjectId, number>;
  /** The Rot Cycler abilities on the stack. */
  cycler: Set<ObjectId>;
  /** The spells cast for an escape cost, and the Grave Striders cast from a hand. */
  escaped: Set<ObjectId>;
  fromHand: Set<ObjectId>;
}

const newMemory = (): Memory => ({
  attacked: new Set(),
  vault: new Map(),
  cycler: new Set(),
  escaped: new Set(),
  fromHand: new Set(),
});

/** The permanent as its controller sees it: the types, subtypes and keywords the layers leave it. */
function viewOf(state: GameState, id: ObjectId) {
  const controller = state.objects[id]?.controller;
  if (controller === undefined) return undefined;
  return getView(state, controller).battlefield.find((o) => o.id === id);
}

const hasDecayed = (state: GameState, id: ObjectId): boolean =>
  viewOf(state, id)?.keywords.includes('decayed') === true;

function checkRules(t: Tally, step: StepInfo, memory: Memory): void {
  const { before, after, events } = step;
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrCopyNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      if (name === STRIDER) {
        if (e.alternative === 'escape') memory.escaped.add(e.object);
        else if (e.fromZone === 'hand') memory.fromHand.add(e.object);
      }
    }
    if (e.kind === 'attackersDeclared') {
      for (const a of e.attackers) {
        if (hasDecayed(after, a.object)) {
          t.decayedAttacks += 1;
          memory.attacked.add(a.object);
        }
      }
    }
    if (e.kind === 'blockersDeclared') {
      for (const b of e.blocks) {
        t.decayedBlocks += hasDecayed(after, b.blocker) ? 1 : 0;
        expect(hasDecayed(after, b.blocker), 'a creature with decayed does not block').toBe(false);
      }
    }
    // The combat is over when the postcombat main phase begins: every creature that attacked with decayed has been sacrificed (CR 702.147a).
    if (e.kind === 'stepBegan' && (e.step === 'postcombatMain' || e.step === 'end')) {
      for (const id of memory.attacked) {
        expect(
          after.battlefield.includes(id),
          'it attacked with decayed: gone at end of combat',
        ).toBe(false);
        t.sacrificedAtEnd += 1;
      }
      memory.attacked.clear();
    }
    if (e.kind === 'abilityTriggered') {
      const name = cardNameOf(after, e.source);
      // The printed ability is the end step trigger; a Raiser that has decayed has the keyword's attack trigger after it (the expansions follow the printed abilities).
      if (name === RAISER && e.abilityIndex === 0) {
        t.raiserTriggers += 1;
        t.byCard.set(RAISER, (t.byCard.get(RAISER) ?? 0) + 1);
        const controlsDecayed = after.battlefield.some(
          (id) => after.objects[id]?.controller === e.seat && hasDecayed(after, id),
        );
        expect(
          controlsDecayed,
          'the end step trigger needs: you control no creature with decayed',
        ).toBe(false);
      }
      if (name === CYCLER) memory.cycler.add(e.stackObject);
    }
    if (e.kind === 'abilityActivated' && cardNameOf(before, e.source) === VAULT) {
      // The sacrifice of the cost is the Vault's last-known state: the counters it had (CR 113.7a).
      const counters = after.lki[e.source]?.object.counters.corpse ?? 0;
      if (e.abilityIndex === 2 && e.stackObject !== null) {
        t.vaultActivations += 1;
        t.byCard.set(VAULT, (t.byCard.get(VAULT) ?? 0) + 1);
        memory.vault.set(e.stackObject, counters);
      }
    }
    if (e.kind === 'cycled' && cardNameOf(after, e.object) === CYCLER) {
      t.cycles += 1;
      t.byCard.set(CYCLER, (t.byCard.get(CYCLER) ?? 0) + 1);
    }
    if (e.kind === 'resolved') {
      const expected = memory.vault.get(e.object);
      if (expected !== undefined) {
        const made = events.filter((x) => x.kind === 'tokenCreated' && x.name === 'Zombie').length;
        t.vaultTokens += made;
        expect(made, 'a Zombie for each corpse counter the Vault had').toBe(expected);
        memory.vault.delete(e.object);
      }
      if (memory.cycler.delete(e.object)) {
        const loss = events.find((x) => x.kind === 'lifeChanged' && x.to < x.from);
        if (loss?.kind === 'lifeChanged') {
          const zombies = after.battlefield.filter((id) =>
            viewOf(after, id)?.subtypes.includes('Zombie'),
          ).length;
          t.lifeLost += 1;
          expect(loss.from - loss.to, 'life lost equals the Zombies on the battlefield').toBe(
            zombies,
          );
        }
      }
    }
    if (e.kind === 'zoneChanged' && e.fromZone === 'stack' && e.toZone === 'battlefield') {
      const escaped = memory.escaped.delete(e.from);
      const hand = memory.fromHand.delete(e.from);
      const counters = after.objects[e.to]?.counters['+1/+1'] ?? 0;
      if (escaped) {
        t.escapes += 1;
        expect(counters, 'escaped: two +1/+1 counters').toBe(2);
      }
      if (hand) {
        t.handCasts += 1;
        expect(counters, 'cast from the hand: no counters').toBe(0);
      }
    }
  }
}

test(
  `${GAMES} gisaG5 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = GISA_G5_STYLE_PAIRS[g % GISA_G5_STYLE_PAIRS.length] ?? ['gisaG5', 'gisaG5'];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 241000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 241000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 241000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const memory = newMemory();
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
        'decayedAttacks',
        'sacrificedAtEnd',
        'decayedBlocks',
        'raiserTriggers',
        'vaultActivations',
        'vaultTokens',
        'cycles',
        'lifeLost',
        'escapes',
        'handCasts',
      ] as const) {
        total[key] += t[key];
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} gisaG5 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.decayedAttacks, 'a creature with decayed attacks');
    expectPath(total.sacrificedAtEnd, 'a creature with decayed is sacrificed at end of combat');
    expectPath(total.raiserTriggers, 'the end step trigger of a Husk Raiser');
    // The rarer paths: the cards that need a graveyard or a build-up. Checked at 100 games, where the style plays them.
    expectPath(total.vaultActivations, 'a Corpse Vault is sacrificed');
    expectPath(total.cycles, 'a Rot Cycler is cycled');
    expectPath(total.escapes, 'a Grave Strider escapes');
    expectPath(total.handCasts, 'a Grave Strider is cast from the hand');
    for (const name of GISA_G5_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(600_000),
);
