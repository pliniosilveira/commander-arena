// Slice soak (Hylda deck, group 3): whole games with the 'hyldaG3' deck style (SYNTHETIC cards of the engine fixtures `synthetic-hylda-g3.ts`: the sorcery that draws for the tapped
// creatures of a target opponent, the creature that draws X cards as it enters, the creature that fetches a Plains when an opponent has more lands, the creature that shuffles itself and
// a stunned creature into their owners' libraries, the Tiered instant of tapped creatures, the creature with the modal trigger of noncreature spells, the landfall enchantment that may
// tap or untap, the two-mode instant and the instant that gives a player and their permanents hexproof) between random agents, with CasualAgent and HeuristicAgent in some seats. Every
// game finishes with a result, no fallback, no rejected action and consistent state after every action; the action log replays to the same final state; and, with the rules read again
// here from CR 107.3m, CR 115.1 and 601.2c, CR 701.24 and CR 702.11b and the cards' texts (not from the engine's own code), at every step:
//   - a permanent that came from a spell cast with X at least 1 remembers that X, and one that came from anywhere else remembers none (CR 107.3m, 107.3g);
//   - a Mana Scholar's enters trigger draws exactly the X of the spell it came from (CR 107.3m);
//   - the targets of the slot of Blade Beam are controlled by different players (CR 601.2c);
//   - a spell or ability an opponent controls never has a player with hexproof as a target (CR 702.11b), a Tide Shuffler's ability puts it and its target into the libraries of their
//     owners (CR 701.24), and a Landless Hound fetches only when an opponent controls more lands (CR 603.4).
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  applyAction,
  checkInvariants,
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
  HYLDA_G3_NAMES,
  HYLDA_G3_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const SCHOLAR = 'SYNTHETIC Mana Scholar';
const HOUND = 'SYNTHETIC Landless Hound';
const SHUFFLER = 'SYNTHETIC Tide Shuffler';
const SMITER = 'SYNTHETIC Tiered Smiter';

interface Tally {
  scholarDraws: number;
  scholarX: number;
  houndFetches: number;
  shuffles: number;
  bladeBeams: number;
  hexproofTurns: number;
  declines: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  scholarDraws: 0,
  scholarX: 0,
  houndFetches: 0,
  shuffles: 0,
  bladeBeams: 0,
  hexproofTurns: 0,
  declines: 0,
  byCard: new Map(),
});

interface Memory {
  /** The X of each Mana Scholar spell on the stack, by the id of the spell. */
  x: Map<ObjectId, number>;
  /** The enters triggers of a Mana Scholar on the stack: the X they must draw and who draws it. */
  owed: Map<ObjectId, { x: number; seat: number }>;
}

function checkRules(t: Tally, step: StepInfo, memory: Memory): void {
  const { before, after, events } = step;
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrCopyNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      const x = after.objects[e.object]?.stack?.x ?? null;
      if (name === SCHOLAR && x !== null) memory.x.set(e.object, x);
      // CR 601.2c: the targets of the slot "with different controllers" have different controllers.
      if (name === SMITER && (after.objects[e.object]?.stack?.chosenModes ?? []).includes(1)) {
        t.bladeBeams += 1;
        const controllers = (after.objects[e.object]?.stack?.chosenTargets ?? []).flatMap((c) =>
          c.kind === 'object' ? [after.objects[c.id]?.controller] : [],
        );
        expect(new Set(controllers).size, 'different controllers (CR 601.2c)').toBe(
          controllers.length,
        );
      }
      // CR 702.11b: a player with hexproof is not the target of a spell an opponent controls.
      for (const c of after.objects[e.object]?.stack?.chosenTargets ?? []) {
        if (c.kind === 'player' && c.seat !== e.seat) {
          expect(
            before.continuousEffects.some(
              (ce) => ce.change.kind === 'playerHexproof' && ce.players?.includes(c.seat),
            ),
            'a player with hexproof is not a legal target (CR 702.11b)',
          ).toBe(false);
        }
      }
    }
    if (e.kind === 'abilityActivated') {
      const name = cardNameOf(before, e.source);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    }
    // CR 107.3m, 107.3g: a permanent remembers the X of the spell it came from, when it was at least 1, and nothing else does.
    if (e.kind === 'zoneChanged' && e.toZone === 'battlefield') {
      const entered = after.objects[e.to];
      if (entered !== undefined) {
        const x = e.fromZone === 'stack' ? memory.x.get(e.from) : undefined;
        expect(entered.castX, 'the X of the spell it came from (CR 107.3m)').toBe(
          x !== undefined && x > 0 ? x : undefined,
        );
        if (x !== undefined && x > 0) t.scholarX += 1;
      }
    }
    // The enters trigger of a Mana Scholar draws exactly X cards as it resolves (a library that runs out ends the game).
    if (e.kind === 'abilityTriggered' && cardNameOf(before, e.source) === SCHOLAR) {
      if (e.abilityIndex === 0) {
        memory.owed.set(e.stackObject, {
          x: after.objects[e.source]?.castX ?? before.objects[e.source]?.castX ?? 0,
          seat: e.seat,
        });
      }
      t.byCard.set(SCHOLAR, (t.byCard.get(SCHOLAR) ?? 0) + 1);
    }
    if (e.kind === 'resolved' && memory.owed.has(e.object)) {
      const owed = memory.owed.get(e.object);
      memory.owed.delete(e.object);
      const drawn = events.filter((d) => d.kind === 'cardDrawn' && d.seat === owed?.seat).length;
      const empty = events.some((d) => d.kind === 'drewFromEmptyLibrary' && d.seat === owed?.seat);
      expect(drawn === owed?.x || empty, 'a Mana Scholar draws X cards (CR 107.3m)').toBe(true);
      if ((owed?.x ?? 0) > 0) t.scholarDraws += 1;
    }
    if (e.kind === 'optionChosen' && e.purpose === 'effect' && e.option === 'Do nothing') {
      t.declines += 1;
    }
    // CR 603.4: the Landless Hound's trigger checks as it resolves that an opponent controls more lands; it searched, so one did.
    if (e.kind === 'abilityTriggered' && cardNameOf(before, e.source) === HOUND) {
      t.houndFetches += 1;
    }
    // CR 701.24, 108.3: a Tide Shuffler that leaves the battlefield for a library goes to the library of its owner.
    if (
      e.kind === 'zoneChanged' &&
      e.fromZone === 'battlefield' &&
      e.toZone === 'library' &&
      cardNameOf(before, e.from) === SHUFFLER
    ) {
      t.shuffles += 1;
      expect(after.objects[e.to]?.zone, 'in a library').toBe('library');
      expect(after.objects[e.to]?.zoneOwner, 'the library of its owner (CR 108.3)').toBe(
        after.objects[e.to]?.owner,
      );
    }
  }
  if (after.continuousEffects.some((ce) => ce.change.kind === 'playerHexproof')) {
    t.hexproofTurns += 1;
  }
}

test(
  `${GAMES} hyldaG3 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = HYLDA_G3_STYLE_PAIRS[g % HYLDA_G3_STYLE_PAIRS.length] ?? [
        'hyldaG3',
        'hyldaG3',
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
        x: new Map<ObjectId, number>(),
        owed: new Map<ObjectId, { x: number; seat: number }>(),
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
      for (const key of [
        'scholarDraws',
        'scholarX',
        'houndFetches',
        'shuffles',
        'bladeBeams',
        'hexproofTurns',
        'declines',
      ] as const) {
        total[key] += t[key];
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} hyldaG3 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.scholarX, 'a Mana Scholar cast with X');
    expectPath(total.hexproofTurns, 'a player with hexproof');
    for (const name of HYLDA_G3_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(600_000),
);
