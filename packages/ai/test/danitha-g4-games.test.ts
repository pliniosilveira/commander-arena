// Slice soak (D-1240 to D-1245): whole games with the 'danithaG4' deck style (SYNTHETIC cards of the engine fixtures `synthetic-danitha-g4.ts`: Auras with Umbra armor, one that
// enchants only a modified creature, and the creature that pumps the other modified creatures and makes Auras and Equipment cheaper, with regeneration, removal and bodies) between
// random agents, with CasualAgent and HeuristicAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every action; the
// action log replays to the same final state; and, with the rules read again here from the cards' texts (not from the engine's own code), at every step:
//   - when Umbra armor is used (an `umbraArmorUsed` event) the creature was enchanted by that Aura, has no damage marked afterwards, was not destroyed (it is still on the battlefield),
//     and the Aura is no longer on it (CR 702.89a);
//   - a question of the order of replacement effects of a destruction (`chooseOption` of purpose `replacement` with a `destroy`) goes to the controller of the creature, lists at
//     least two effects, and its options are a regeneration shield and Umbra Auras attached to that creature (CR 616.1);
//   - an Umbra Mantle that is cast has a modified creature as its target, as the creature was when it was cast: a counter on it, an Equipment attached, or an Aura its controller
//     controls attached (CR 700.9, 303.4a).
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
import { cardNameOf, tokenOrCopyNameOf } from './game-names';
import {
  DANITHA_G4_NAMES,
  DANITHA_G4_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const UMBRA_AURAS = new Set([
  'SYNTHETIC Umbra Hide',
  'SYNTHETIC Umbra Veil',
  'SYNTHETIC Umbra Mantle',
]);
const MANTLE = 'SYNTHETIC Umbra Mantle';
const EQUIPMENT = new Set(['SYNTHETIC Blade']);

interface Tally {
  umbraUsed: number;
  questions: number;
  mantles: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({ umbraUsed: 0, questions: 0, mantles: 0, byCard: new Map() });

/** CR 700.9, read from the cards' texts: a counter, an Equipment, or an Aura the permanent's controller controls attached to it. */
function modified(state: GameState, id: ObjectId): boolean {
  const obj = state.objects[id];
  if (obj === undefined || obj.zone !== 'battlefield') return false;
  if (Object.values(obj.counters).some((n) => n > 0)) return true;
  return state.battlefield.some((other) => {
    const o = state.objects[other];
    if (o === undefined || o.attachedTo !== id) return false;
    const name = cardNameOf(state, other);
    if (EQUIPMENT.has(name)) return true;
    return o.controller === obj.controller && !EQUIPMENT.has(name);
  });
}

function checkRules(t: Tally, step: StepInfo): void {
  const { before, after, events } = step;
  const pending = after.pending;
  if (
    pending?.kind === 'chooseOption' &&
    pending.purpose === 'replacement' &&
    pending.replacement?.destroy !== undefined
  ) {
    t.questions += 1;
    const { object } = pending.replacement.destroy;
    expect(after.objects[object]?.zone, 'the creature is still on the battlefield').toBe(
      'battlefield',
    );
    expect(pending.seat, 'the controller of the creature chooses (CR 616.1)').toBe(
      after.objects[object]?.controller,
    );
    expect(pending.options.length, 'two or more effects apply').toBeGreaterThanOrEqual(2);
    for (const choice of pending.replacement.choices) {
      if (choice.kind === 'umbra') {
        const aura = choice.object;
        expect(aura !== undefined && after.objects[aura]?.attachedTo === object).toBe(true);
        expect(UMBRA_AURAS.has(cardNameOf(after, aura as ObjectId))).toBe(true);
      }
    }
  }
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrCopyNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      if (name === MANTLE) {
        t.mantles += 1;
        const targets = after.objects[e.object]?.stack?.chosenTargets ?? [];
        expect(targets).toHaveLength(1);
        for (const target of targets) {
          if (target.kind !== 'object') continue;
          // The spell is on the stack, so the Mantle itself is not attached yet: the creature is modified by something else.
          expect(modified(before, target.id), `${MANTLE} targets a modified creature`).toBe(true);
        }
      }
    }
    if (e.kind === 'umbraArmorUsed') {
      t.umbraUsed += 1;
      expect(UMBRA_AURAS.has(cardNameOf(before, e.aura)), 'the Aura has Umbra armor').toBe(true);
      expect(before.objects[e.aura]?.attachedTo, 'it enchanted the creature').toBe(e.object);
      const creature = after.objects[e.object];
      expect(creature?.zone, 'the creature was not destroyed').toBe('battlefield');
      expect(creature?.damage, 'its damage was removed').toBe(0);
      expect(after.objects[e.aura]?.zone ?? 'gone', 'the Aura is destroyed').not.toBe(
        'battlefield',
      );
      expect(
        events.some((d) => d.kind === 'died' && d.object === e.object),
        'the creature did not die',
      ).toBe(false);
    }
    if (e.kind === 'abilityActivated') {
      const name = cardNameOf(before, e.source);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    }
  }
}

test(
  `${GAMES} danithaG4 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = DANITHA_G4_STYLE_PAIRS[g % DANITHA_G4_STYLE_PAIRS.length] ?? [
        'danithaG4',
        'danithaG4',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent and HeuristicAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 204000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 204000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 204000 + 2 * g + seat });
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
      for (const key of ['umbraUsed', 'questions', 'mantles'] as const) total[key] += t[key];
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} danithaG4 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.umbraUsed);
    // Every Aura of the group was cast at least once somewhere in the games; the Mantle needs a modified creature, which the Auras and Equipment make.
    for (const name of DANITHA_G4_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(300_000),
);
