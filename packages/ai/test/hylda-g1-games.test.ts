// Slice soak (D-510 to D-514): whole games with the 'hyldaG1' deck style (SYNTHETIC cards of the engine fixtures `synthetic-hylda-g1.ts`: the creature whose payment makes a modal
// reflexive ability when its controller taps an untapped creature of an opponent, the creature that pays {1}{U} when it attacks to tap a creature, the creature that taps and stuns and draws
// once each turn, the enchantment that draws when a creature of an opponent becomes tapped but not as an attacker, the creature that taps one creature of each opponent, the creature that
// taps permanents when its controller scries, the creature that gives protection from a card type, and the tap and scry helpers) between random agents, with CasualAgent and HeuristicAgent in
// some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every action; the action log replays to the same final state; and, with the rules
// read again here from CR 701.26a, 508.1f, 603.2c, 701.22 and the cards' texts (not from the engine's own code), at every step:
//   - a `tapped` event is the change of a permanent from untapped to tapped, once for the permanent in a step (CR 701.26a), and one that says it was declared as an attacker happens in
//     the step that declares that creature as an attacker (CR 508.1f);
//   - a Frost Warlock or a Chill Sentry on the battlefield triggers once for each untapped creature of an opponent its controller taps (CR 603.2, 701.26a);
//   - a Watchful Circle triggers once for each creature of an opponent that becomes tapped and is not declared as an attacker (CR 603.2, 508.1f);
//   - a Numbing Merfolk's draw triggers at most once each turn, and only after its controller tapped untapped creatures of the opponents (CR 603.2c);
//   - a Tide Pilot triggers once each time its controller scries a card or more, and its trigger has at most as many targets as the cards looked at (CR 701.22, 603.3d).
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
import { cardNameOf, faceOf } from './game-names';
import { HYLDA_G1_STYLE_PAIRS, type StepInfo, smallGameConfig, stepGame } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const WARLOCK = 'SYNTHETIC Frost Warlock';
const SENTRY = 'SYNTHETIC Chill Sentry';
const MERFOLK = 'SYNTHETIC Numbing Merfolk';
const CIRCLE = 'SYNTHETIC Watchful Circle';
const PILOT = 'SYNTHETIC Tide Pilot';

/** The abilities that are owed a trigger for each event of the step: the name of the card and the index of the ability. */
const OWED = new Set([`${WARLOCK}:0`, `${SENTRY}:2`, `${CIRCLE}:0`, `${PILOT}:1`]);

interface Tally {
  tappedByYou: number;
  attackerTaps: number;
  reflexives: number;
  modesChosen: number;
  merfolkDraws: number;
  circleTriggers: number;
  scryTriggers: number;
  protections: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  tappedByYou: 0,
  attackerTaps: 0,
  reflexives: 0,
  modesChosen: 0,
  merfolkDraws: 0,
  circleTriggers: 0,
  scryTriggers: 0,
  protections: 0,
  byCard: new Map(),
});

/** What each trigger source is still owed: the events it must trigger for, minus the abilities it did trigger (or lost for want of a target). */
interface Memory {
  owed: Map<string, number>;
  merfolk: Set<string>;
}

const controllerIn = (state: GameState, id: ObjectId) =>
  (state.objects[id] ?? state.lki[id]?.object)?.controller;

/** Whether the object is a creature, read from its token characteristics or the printed face of its card (the decks have no other change of type). */
function isCreature(state: GameState, id: ObjectId): boolean {
  const obj = state.objects[id] ?? state.lki[id]?.object;
  if (obj === undefined) return false;
  if (obj.token !== null) return obj.token.characteristics.types.includes('creature');
  return faceOf(state, id)?.types.includes('creature') ?? false;
}

function owe(memory: Memory, key: string, delta: number): void {
  const owed = (memory.owed.get(key) ?? 0) + delta;
  expect(owed, `${key}: triggered only for an event it reads`).toBeGreaterThanOrEqual(0);
  memory.owed.set(key, owed);
}

function checkRules(t: Tally, step: StepInfo, memory: Memory): void {
  const { before, after, events } = step;
  const turn = before.turn.number;
  const declared = new Set<ObjectId>();
  for (const e of events) {
    if (e.kind === 'attackersDeclared') for (const a of e.attackers) declared.add(a.object);
  }
  // CR 701.26a: a `tapped` event changes an untapped permanent to tapped, once for it in a step.
  const tappedHere = new Set<ObjectId>();
  const tapsByYou = new Map<number, number>();
  const notAttackerTaps = new Map<number, number>();
  for (const e of events) {
    if (e.kind !== 'tapped') continue;
    expect(tappedHere.has(e.object), 'a permanent is tapped once in a step').toBe(false);
    tappedHere.add(e.object);
    const was = before.objects[e.object];
    if (was !== undefined) expect(was.tapped, 'only an untapped permanent is tapped').toBe(false);
    if (e.attacker === true) {
      t.attackerTaps += 1;
      expect(declared.has(e.object), 'declared as an attacker in this step (CR 508.1f)').toBe(true);
    }
    const owner = controllerIn(after, e.object);
    if (owner === undefined || !isCreature(after, e.object)) continue;
    if (e.by !== undefined && e.by !== owner) {
      tapsByYou.set(e.by, (tapsByYou.get(e.by) ?? 0) + 1);
      t.tappedByYou += 1;
    }
    if (e.attacker !== true) notAttackerTaps.set(owner, (notAttackerTaps.get(owner) ?? 0) + 1);
  }
  // What each source on the battlefield is owed for the events of this step: credit first, since the ability can go on the stack in the step of the event.
  for (const id of after.battlefield) {
    const name = cardNameOf(after, id);
    const seat = controllerIn(after, id);
    if (seat === undefined) continue;
    const key = (index: number) => `${name}:${id}:${index}`;
    if (name === WARLOCK) owe(memory, key(0), tapsByYou.get(seat) ?? 0);
    if (name === SENTRY) owe(memory, key(2), tapsByYou.get(seat) ?? 0);
    if (name === CIRCLE) {
      const theirs = [...notAttackerTaps].reduce(
        (n, [owner, taps]) => (owner === seat ? n : n + taps),
        0,
      );
      owe(memory, key(0), theirs);
    }
    if (name === PILOT) {
      const scried = events.filter(
        (e) => e.kind === 'scried' && e.seat === seat && e.top + e.bottom > 0,
      ).length;
      owe(memory, key(1), scried);
    }
  }
  for (const e of events) {
    if (e.kind === 'abilityTriggered' || e.kind === 'abilityRemoved') {
      const known = cardNameOf(before, e.source);
      const name = known === '?' ? cardNameOf(after, e.source) : known;
      if (e.kind === 'abilityTriggered') {
        t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
        if (e.abilityIndex === -1 && (name === WARLOCK || name === SENTRY)) t.reflexives += 1;
        if (name === MERFOLK && e.abilityIndex === 1) {
          t.merfolkDraws += 1;
          const once = `${turn}:${e.source}`;
          expect(memory.merfolk.has(once), 'the Numbing Merfolk draws once each turn at most').toBe(
            false,
          );
          memory.merfolk.add(once);
        }
        if (name === CIRCLE && e.abilityIndex === 0) t.circleTriggers += 1;
        if (name === PILOT && e.abilityIndex === 1) {
          t.scryTriggers += 1;
          // The trigger can go on the stack in a step after the scry; with the scry in the same step the cards looked at bound the targets.
          const looked = events.flatMap((s) =>
            s.kind === 'scried' && s.seat === e.seat ? [s.top + s.bottom] : [],
          );
          const targets = after.objects[e.stackObject]?.stack?.chosenTargets ?? [];
          if (looked.length > 0)
            expect(
              targets.length,
              'up to as many targets as the cards looked at',
            ).toBeLessThanOrEqual(Math.max(...looked));
        }
      }
      if (e.abilityIndex >= 0 && OWED.has(`${name}:${e.abilityIndex}`))
        owe(memory, `${name}:${e.source}:${e.abilityIndex}`, -1);
    }
    if (e.kind === 'modesChosen') t.modesChosen += 1;
    if (e.kind === 'optionChosen' && e.purpose === 'protectionCardType') t.protections += 1;
  }
}

test(
  `${GAMES} hyldaG1 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = HYLDA_G1_STYLE_PAIRS[g % HYLDA_G1_STYLE_PAIRS.length] ?? [
        'hyldaG1',
        'hyldaG1',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 251000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 251000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 251000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const memory: Memory = { owed: new Map(), merfolk: new Set() };
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
        'tappedByYou',
        'attackerTaps',
        'reflexives',
        'modesChosen',
        'merfolkDraws',
        'circleTriggers',
        'scryTriggers',
        'protections',
      ] as const) {
        total[key] += t[key];
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} hyldaG1 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.tappedByYou, 'a creature of an opponent tapped by a player');
    expectPath(total.attackerTaps, 'an attacker tapped as it is declared');
    expectPath(total.protections, 'a card type chosen for protection');
    expectPath(total.reflexives, 'a reflexive ability of a paid trigger');
    expectPath(total.modesChosen, 'the modes of a reflexive ability');
  },
  soakTimeout(600_000),
);
