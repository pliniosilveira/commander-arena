// Slice soak (D-1400 to D-1404): whole games with the 'gisaG1' deck style (SYNTHETIC cards of the engine fixtures `synthetic-gisa-g1.ts`: a Zombie with Afflict 3 that gives it to the
// other Zombies and mills and returns a creature card after a Zombie dealt combat damage, a Zombie that gives the other Zombie creatures swampwalk, a Zombie that taps an untapped
// Zombie to make a land a Swamp or give a creature swampwalk, an enchantment that amasses and gives a big Zombie token lifelink, and a plain Zombie, with removal, burn and bodies)
// between random agents, with CasualAgent and HeuristicAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every
// action; the action log replays to the same final state; and, with the rules read again here from the cards' texts (not from the engine's own code), at every step:
//   - a creature that becomes blocked has as many afflict triggers as it has instances: its own (the Monarch) and one for each other Monarch its controller controls when it is a
//     Zombie (CR 702.130a, 702.130b);
//   - nobody blocks a Zombie that another Walk Master gives swampwalk when the defending player controls a Swamp (CR 702.14c, 509.1b);
//   - the trigger of the second main phase is put on the stack only in a turn in which a Zombie dealt combat damage to a player (CR 603.4, 120.2a);
//   - when the Scout's ability that targets a land resolves, the land is a Swamp and only a Swamp of the land types (CR 305.7).
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  applyAction,
  checkInvariants,
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
import {
  GISA_G1_NAMES,
  GISA_G1_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const MONARCH = 'SYNTHETIC Afflict Monarch';
const MASTER = 'SYNTHETIC Walk Master';
const SCOUT = 'SYNTHETIC Trail Scout';
const LAND_TYPES = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];

interface Tally {
  afflictBlocks: number;
  afflictTriggers: number;
  monarchTwoInstances: number;
  swampwalkChecks: number;
  swampwalkStopped: number;
  main2Triggers: number;
  scoutLands: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  afflictBlocks: 0,
  afflictTriggers: 0,
  monarchTwoInstances: 0,
  swampwalkChecks: 0,
  swampwalkStopped: 0,
  main2Triggers: 0,
  scoutLands: 0,
  byCard: new Map(),
});

function checkRules(t: Tally, zombieDamageTurns: Set<number>, step: StepInfo): void {
  const { before, after, events } = step;
  const view = getView(before, 0);
  const nameOf = (id: ObjectId) => tokenOrCopyNameOf(before, id);

  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrCopyNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    }
    // CR 120.2a: combat damage to a player by a Zombie (what the source was as it dealt it: it is still on the battlefield, damage is dealt at once).
    if (e.kind === 'damageDealt' && e.combat && e.to.kind === 'player') {
      const source = view.battlefield.find((o) => o.id === e.source);
      if (source?.subtypes.includes('Zombie') === true) zombieDamageTurns.add(before.turn.number);
    }
    if (e.kind === 'blockersDeclared') {
      const attackers = new Set(e.blocks.map((b) => b.attacker));
      for (const attacker of attackers) {
        const obj = view.battlefield.find((o) => o.id === attacker);
        if (obj === undefined) continue;
        const isZombie = obj.subtypes.includes('Zombie');
        const own = nameOf(attacker) === MONARCH ? 1 : 0;
        const granted = isZombie
          ? view.battlefield.filter(
              (o) =>
                o.id !== attacker && o.controller === obj.controller && nameOf(o.id) === MONARCH,
            ).length
          : 0;
        const expected = own + granted;
        if (expected === 0) continue;
        t.afflictBlocks += 1;
        if (expected >= 2) t.monarchTwoInstances += 1;
        const waiting =
          after.stack.filter((id) => after.objects[id]?.stack?.source === attacker).length +
          after.pendingTriggers.filter((p) => p.source === attacker).length;
        expect(waiting, `afflict triggers of a blocked ${nameOf(attacker)}`).toBe(expected);
        t.afflictTriggers += waiting;
      }
      // CR 702.14c: swampwalk given by another Master.
      for (const block of e.blocks) {
        const attacker = view.battlefield.find((o) => o.id === block.attacker);
        const blocker = view.battlefield.find((o) => o.id === block.blocker);
        if (attacker === undefined || blocker === undefined) continue;
        t.swampwalkChecks += 1;
        const given =
          attacker.subtypes.includes('Zombie') &&
          attacker.types.includes('creature') &&
          view.battlefield.some((o) => o.id !== attacker.id && nameOf(o.id) === MASTER);
        const swamp = view.battlefield.some(
          (o) =>
            o.controller === blocker.controller &&
            o.types.includes('land') &&
            o.subtypes.includes('Swamp'),
        );
        expect(given && swamp, `${attacker.name} was blocked despite swampwalk`).toBe(false);
      }
    }
    if (e.kind === 'resolved') {
      const obj = before.objects[e.object];
      if (obj?.stack?.kind === 'ability' && nameOf(obj.stack.source ?? e.object) === SCOUT) {
        const target = obj.stack.chosenTargets?.[0];
        if (target?.kind === 'object') {
          const land = getView(after, 0).battlefield.find((o) => o.id === target.id);
          if (land?.types.includes('land') === true) {
            t.scoutLands += 1;
            expect(
              land.subtypes.filter((s) => LAND_TYPES.includes(s)),
              'the land is a Swamp and only a Swamp',
            ).toEqual(['Swamp']);
          }
        }
      }
    }
  }

  // CR 603.4: the trigger of the second main phase waits on the stack only in a turn in which a Zombie dealt combat damage to a player.
  if (after.turn.step === 'postcombatMain') {
    for (const id of after.stack) {
      if (before.stack.includes(id)) continue;
      const obj = after.objects[id];
      if (obj?.stack?.kind !== 'ability') continue;
      if (tokenOrCopyNameOf(after, obj.stack.source ?? id) !== MONARCH) continue;
      t.main2Triggers += 1;
      expect(zombieDamageTurns.has(after.turn.number), 'a Zombie dealt combat damage').toBe(true);
    }
  }
}

test(
  `${GAMES} gisaG1 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = GISA_G1_STYLE_PAIRS[g % GISA_G1_STYLE_PAIRS.length] ?? ['gisaG1', 'gisaG1'];
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
      const zombieDamageTurns = new Set<number>();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, zombieDamageTurns, step);
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
        'afflictBlocks',
        'afflictTriggers',
        'monarchTwoInstances',
        'swampwalkChecks',
        'swampwalkStopped',
        'main2Triggers',
        'scoutLands',
      ] as const) {
        total[key] += t[key];
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} gisaG1 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.afflictBlocks);
    expectPath(total.afflictTriggers);
    expectPath(total.swampwalkChecks);
    for (const name of GISA_G1_NAMES) {
      // The enchantment and the plain Zombie are cast like any spell; the rest too.
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(300_000),
);
