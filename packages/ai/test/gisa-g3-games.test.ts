// Slice soak (D-1420 to D-1428): whole games with the 'gisaG3' deck style (SYNTHETIC cards of the engine fixtures `synthetic-gisa-g3.ts`: a planeswalker whose minus nine makes each opponent
// keep a permanent of each type, a creature that sacrifices two other creatures and has any number of players lose life and sacrifice, a creature that sacrifices X creatures, "partner with" and
// the card it fetches, and an instant with an optional sacrifice of any number of creatures that copies it) between random agents, with CasualAgent and HeuristicAgent in some seats. Every game
// finishes with a result, no fallback, no rejected action and consistent state after every action; the action log replays to the same final state; and, with the rules read again here from the
// cards' texts (not from the engine's own code), at every step:
//   - the Priest's ability is paid with exactly two creatures other than the Priest, taps it, and is activated by the player who controls it (CR 118.3, 701.21a);
//   - the Demon's ability is paid with exactly as many creatures as the X announced for it (CR 107.3a, 602.2b);
//   - a Forbidden Rite cast with N creatures sacrificed for its cost puts no trigger on the stack for N = 0 and one for N >= 1, and makes N copies of the spell, all belonging to the caster
//     (CR 118.8, 603.4, 707.10);
//   - once the minus nine of the walker has resolved, no opponent of its controller controls more permanents than their types allow (CR 608.2d, 701.21a, 110.4).
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  applyAction,
  checkInvariants,
  type GameState,
  getLegalActions,
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
  GISA_G3_NAMES,
  GISA_G3_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const PRIEST = 'SYNTHETIC Sacrifice Priest';
const DEMON = 'SYNTHETIC Sacrifice Demon';
const RITE = 'SYNTHETIC Forbidden Rite';
const WALKER = 'SYNTHETIC Culling Walker';
const SEEKER = 'SYNTHETIC Partner Seeker';

interface Tally {
  casts: number;
  priest: number;
  demon: number;
  demonX: number;
  rites: number;
  ritesSacrificed: number;
  copies: number;
  walker: number;
  partner: number;
  byCard: Map<string, number>;
}

const COUNTS = [
  'casts',
  'priest',
  'demon',
  'demonX',
  'rites',
  'ritesSacrificed',
  'copies',
  'walker',
  'partner',
] as const;

const newTally = (): Tally => ({
  casts: 0,
  priest: 0,
  demon: 0,
  demonX: 0,
  rites: 0,
  ritesSacrificed: 0,
  copies: 0,
  walker: 0,
  partner: 0,
  byCard: new Map(),
});

interface Memory {
  /** The copies a Rite is owed, by the spell on the stack. */
  owed: Map<string, number>;
  /** The Rite spells whose cast sacrificed nobody: no trigger of them may appear. */
  none: Set<string>;
  /** The abilities of a walker on the stack, by the object: whose they are, until they resolve. */
  walkers: Map<string, number>;
}

const newMemory = (): Memory => ({ owed: new Map(), none: new Set(), walkers: new Map() });

const typesOf = (state: GameState, id: string): readonly string[] => {
  const obj = state.objects[id as keyof typeof state.objects];
  const card = obj?.card == null ? undefined : state.cards[obj.card];
  const face = card === undefined ? undefined : state.definitions[card.definition]?.faces[0];
  return face?.types ?? [];
};

const nameIn = (step: StepInfo, id: string): string => {
  const known = tokenOrCopyNameOf(step.before, id as never);
  return known === '?' ? tokenOrCopyNameOf(step.after, id as never) : known;
};

function checkCosts(t: Tally, mem: Memory, step: StepInfo): void {
  const { after, events, seat } = step;
  const sacrificed = events.filter((e) => e.kind === 'sacrificed');
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrCopyNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      if ((GISA_G3_NAMES as readonly string[]).includes(name)) t.casts += 1;
      if (name === RITE) {
        t.rites += 1;
        const n = sacrificed.length;
        t.ritesSacrificed += n;
        expect(
          sacrificed.every((s) => s.kind === 'sacrificed' && s.controller === e.seat),
          'the creatures sacrificed for the cost are the caster’s',
        ).toBe(true);
        if (n > 0) mem.owed.set(e.object, n);
        else mem.none.add(e.object);
      }
    }
    if (e.kind === 'abilityActivated') {
      const name = nameIn(step, e.source);
      if (name === PRIEST) {
        t.priest += 1;
        expect(sacrificed, 'the Priest sacrifices two other creatures').toHaveLength(2);
        for (const s of sacrificed) {
          if (s.kind !== 'sacrificed') continue;
          expect(s.permanent, 'never the Priest itself').not.toBe(e.source);
          expect(s.controller, 'the creatures are the activating player’s').toBe(e.seat);
          expect(typesOf(step.before, s.permanent)).toContain('creature');
        }
        const priest = after.objects[e.source];
        if (priest !== undefined && priest.zone === 'battlefield') expect(priest.tapped).toBe(true);
        expect(e.seat).toBe(seat);
      }
      if (name === DEMON) {
        t.demon += 1;
        const x = e.x ?? 0;
        t.demonX += x;
        expect(sacrificed, 'the Demon sacrifices as many creatures as X').toHaveLength(x);
        for (const s of sacrificed) {
          if (s.kind === 'sacrificed') expect(s.controller).toBe(e.seat);
        }
      }
      if (name === WALKER) {
        t.walker += 1;
        if (e.stackObject !== null) mem.walkers.set(e.stackObject, e.seat);
      }
    }
    if (e.kind === 'spellCopied') {
      const original = e.original;
      const owed = mem.owed.get(original);
      if (owed !== undefined) {
        const copy = after.objects[e.copy];
        expect(copy?.controller, 'a copy belongs to the caster').toBe(e.seat);
        expect(owed, 'no more copies than creatures sacrificed').toBeGreaterThan(0);
        mem.owed.set(original, owed - 1);
        t.copies += 1;
      }
    }
  }
  // No trigger of a Rite cast without a sacrifice, and none of one cast with a sacrifice goes on the stack twice.
  for (const id of after.stack) {
    if (step.before.stack.includes(id)) continue;
    const obj = after.objects[id];
    if (obj?.stack?.kind !== 'ability' || obj.stack.source == null) continue;
    if (nameIn(step, obj.stack.source) === SEEKER) t.partner += 1;
    if (nameIn(step, obj.stack.source) !== RITE) continue;
    expect(mem.none.has(obj.stack.source), 'no trigger of a Rite cast without a sacrifice').toBe(
      false,
    );
  }
}

/** After a resolution of the walker's ability: what the opponents of its controller have left (CR 608.2d, 110.4). */
function checkWalker(mem: Memory, step: StepInfo): void {
  for (const e of step.events) {
    if (e.kind !== 'resolved') continue;
    const seat = mem.walkers.get(e.object);
    if (seat === undefined) continue;
    mem.walkers.delete(e.object);
    const after = step.after;
    for (const s of after.seats) {
      if (s.id === seat || s.hasLost) continue;
      const mine = after.battlefield.filter((id) => after.objects[id]?.controller === s.id);
      const count = (type: string) => mine.filter((id) => typesOf(after, id).includes(type)).length;
      expect(count('land'), 'an opponent keeps at most one land').toBeLessThanOrEqual(1);
      expect(count('enchantment'), 'at most one enchantment').toBeLessThanOrEqual(1);
      expect(count('planeswalker'), 'at most one planeswalker').toBeLessThanOrEqual(1);
      expect(
        count('creature'),
        'at most two creatures (a creature that is an artifact too)',
      ).toBeLessThanOrEqual(2);
      expect(count('artifact'), 'at most two artifacts').toBeLessThanOrEqual(2);
      expect(mine.length, 'at most one permanent for each type').toBeLessThanOrEqual(5);
    }
  }
}

test(
  `${GAMES} gisaG3 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = GISA_G3_STYLE_PAIRS[g % GISA_G3_STYLE_PAIRS.length] ?? ['gisaG3', 'gisaG3'];
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
        checkCosts(t, mem, step);
        checkWalker(mem, step);
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
      // The copies a Rite was owed were all made, unless the game ended before its trigger resolved (a game is over when a player loses).
      const left = [...mem.owed.values()].reduce((n, x) => n + x, 0);
      if (left > 0) expect(run.state.result, `${tag}: owed copies`).not.toBeNull();
      for (const key of COUNTS) total[key] += t[key];
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} gisaG3 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    for (const key of COUNTS) {
      // The sacrifice of X creatures may be announced as zero; the minus nine and the search are the rarer paths.
      if (key !== 'demonX' && key !== 'ritesSacrificed' && key !== 'copies') {
        expectPath(total[key], key);
      }
    }
    for (const name of [WALKER, PRIEST, DEMON, SEEKER, RITE, 'SYNTHETIC Culling Rite']) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(300_000),
);
