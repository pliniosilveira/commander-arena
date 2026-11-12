// Slice soak (D-1000): whole games (the `soakGames()` count, test/soak.ts) with the 'repeatable' deck style (SYNTHETIC cards that say "You may choose the same
// mode more than once": a spell that chooses three, one that chooses two with a destroy mode, a choice of up to two, an enters trigger and an activated
// ability that choose two) between random agents, with CasualAgent in some seats. Every game finishes with a result, no fallback, no rejected action and
// consistent state after every action; the action log replays to the same final state; and, with the rules read again here from the cards' texts (not from the
// engine's own mode code), at every step:
//   - a chooseModes decision offers exactly the multisets of legal modes between the least and the most the text allows, fewest first (CR 700.2, 700.2a, 700.2d),
//     is asked only when more than one is legal, and accepts each of them and refuses one too many;
//   - the modes chosen are on the object on the stack in printed order, repeats included, and the targets asked afterwards have a slot for each instance of each
//     mode, in printed order, the later instances' slots named "<id>#2", "<id>#3" with the same legal targets as the first (CR 601.2c, 700.2d);
//   - when it resolves: a spell or ability one of whose targets is still legal does the effect of every instance whose target is still there, the instances of a
//     mode with no target every time (CR 608.2b, 700.2d); one whose targets are all gone does nothing (CR 608.2b).
import {
  applyAction,
  checkInvariants,
  type GameEvent,
  type GameState,
  getView,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import {
  REPEATABLE_NAMES,
  REPEATABLE_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

type Aim = 'creature' | 'artifact';

/** What one mode says, restated from the cards' texts (src/cards/fixtures/synthetic-repeatable.ts). */
interface ModeFact {
  readonly aim?: Aim;
  readonly id?: string;
  readonly damage?: number;
  readonly draw?: true;
  readonly gain?: number;
  /** Life the target player gains. */
  readonly targetGain?: number;
  readonly destroy?: true;
}
interface ModalFact {
  readonly min: number;
  readonly max: number;
  readonly modes: readonly ModeFact[];
}

const FACTS: Readonly<Record<string, ModalFact>> = {
  'SYNTHETIC Triple Charm': {
    min: 3,
    max: 3,
    modes: [
      { draw: true },
      { aim: 'creature', id: 'hit', damage: 2 },
      { id: 'who', targetGain: 2 },
    ],
  },
  'SYNTHETIC Artifact Charm': {
    min: 2,
    max: 2,
    modes: [{ aim: 'artifact', id: 'art', destroy: true }, { gain: 1 }],
  },
  'SYNTHETIC Up To Charm': { min: 0, max: 2, modes: [{ draw: true }, { gain: 3 }] },
  'SYNTHETIC Repeat Greeter': {
    min: 2,
    max: 2,
    modes: [{ gain: 1 }, { aim: 'creature', id: 'zap', damage: 1 }],
  },
  'SYNTHETIC Repeat Totem': {
    min: 2,
    max: 2,
    modes: [{ draw: true }, { aim: 'creature', id: 'ping', damage: 1 }],
  },
};

interface Tally {
  asked: number;
  repeatsChosen: number;
  emptyChosen: number;
  automatic: number;
  removed: number;
  targetSlotsChecked: number;
  sameTargetTwice: number;
  differentTargets: number;
  resolved: number;
  fizzled: number;
  partial: number;
  drawChecked: number;
  gainChecked: number;
  damageChecked: number;
  byCard: Map<string, number>;
}
const newTally = (): Tally => ({
  asked: 0,
  repeatsChosen: 0,
  emptyChosen: 0,
  automatic: 0,
  removed: 0,
  targetSlotsChecked: 0,
  sameTargetTwice: 0,
  differentTargets: 0,
  resolved: 0,
  fizzled: 0,
  partial: 0,
  drawChecked: 0,
  gainChecked: 0,
  damageChecked: 0,
  byCard: new Map(),
});

/** The name of the card behind an object: the spell's own, or the permanent an ability belongs to. */
function nameOf(state: GameState, id: ObjectId): string {
  const obj = state.objects[id];
  if (obj === undefined) return '';
  const origin = obj.stack?.kind === 'ability' && obj.stack.source !== null ? obj.stack.source : id;
  const card = state.objects[origin];
  if (card === undefined) return state.lki[origin]?.characteristics.name ?? '';
  if (card.token !== null) return card.token.characteristics.name;
  if (card.card === null) return '';
  return state.definitions[state.cards[card.card]?.definition ?? -1]?.faces[card.face]?.name ?? '';
}

/** Whether a mode could be aimed now: its target can be found, read from the view of the controller. */
function aimable(state: GameState, seat: number, aim: Aim | undefined): boolean {
  if (aim === undefined) return true;
  return getView(state, seat).battlefield.some((o) => o.types.includes(aim));
}

/** The multisets the rules allow: legal modes, with repeats, between the least and the most, fewest first. */
function expectedSets(state: GameState, seat: number, fact: ModalFact): number[][] {
  const legal = fact.modes.flatMap((m, i) => (aimable(state, seat, m.aim) ? [i] : []));
  const out: number[][] = [];
  const build = (from: number, picked: number[], size: number): void => {
    if (picked.length === size) {
      out.push([...picked]);
      return;
    }
    for (let k = from; k < legal.length; k += 1) {
      picked.push(legal[k] as number);
      build(k, picked, size);
      picked.pop();
    }
  };
  if (legal.length === 0) return fact.min === 0 ? [[]] : [];
  for (let size = fact.min; size <= fact.max; size += 1) build(0, [], size);
  return out;
}

/** The id of the slot of the `n`th (0 the first) instance of a mode whose slot is `id`. */
const slotId = (id: string, n: number) => (n === 0 ? id : `${id}#${n + 1}`);

/** The slots the chosen multiset should have, in printed order: the mode and the instance of each. */
const slotsOf = (fact: ModalFact, chosen: readonly number[]) => {
  const seen = new Map<number, number>();
  return [...chosen]
    .sort((a, b) => a - b)
    .flatMap((mode) => {
      const n = seen.get(mode) ?? 0;
      seen.set(mode, n + 1);
      const id = fact.modes[mode]?.id;
      return id === undefined
        ? []
        : [{ specId: slotId(id, n), mode, instance: n === 0 ? undefined : n }];
    });
};

function checkAsk(t: Tally, step: StepInfo) {
  const d = step.before.pending;
  if (d?.kind !== 'chooseModes') return;
  const state = step.before;
  const name = nameOf(state, d.source);
  const fact = FACTS[name];
  expect(fact, `${name} is a repeatable modal card`).toBeDefined();
  if (fact === undefined) return;
  expect(d.repeatable, `${name} says it repeats`).toBe(true);
  const sets = expectedSets(state, d.seat, fact);
  expect(d.sets, `${name} legal multisets`).toEqual(sets);
  expect(sets.length, 'asked only when there is a choice').toBeGreaterThan(1);
  expect(d.min).toBe(fact.min);
  expect(d.max).toBe(fact.max);
  for (const modes of sets) {
    expect(applyAction(state, d.seat, { kind: 'chooseModes', modes }).ok, `[${modes}]`).toBe(true);
  }
  // One too many of the first legal mode is refused, and so is a set of a different size.
  const first = sets.find((s) => s.length > 0)?.[0] ?? 0;
  const tooMany = Array.from({ length: fact.max + 1 }, () => first);
  expect(applyAction(state, d.seat, { kind: 'chooseModes', modes: tooMany }).ok).toBe(false);
  if (fact.min > 0) {
    expect(applyAction(state, d.seat, { kind: 'chooseModes', modes: [] }).ok).toBe(false);
  }
  t.asked += 1;
}

function checkAnswer(t: Tally, step: StepInfo) {
  const before = step.before.pending;
  if (before?.kind === 'chooseModes' && step.action.kind === 'chooseModes') {
    const chosen = [...step.action.modes].sort((a, b) => a - b);
    expect(step.after.objects[before.source]?.stack?.chosenModes).toEqual(chosen);
    if (new Set(chosen).size < chosen.length) t.repeatsChosen += 1;
    if (chosen.length === 0) t.emptyChosen += 1;
    const fact = FACTS[nameOf(step.before, before.source)] as ModalFact;
    const next = step.after.pending;
    if (next?.kind === 'targets' && next.source === before.source) {
      const expected = slotsOf(fact, chosen);
      expect(
        next.specs.map((s) => ({ specId: s.specId, mode: s.mode, instance: s.instance })),
        'the slots of the chosen modes, one for each instance',
      ).toEqual(expected);
      // The instances of a mode can each take any target the first can.
      for (const slot of next.specs) {
        const first = next.specs.find((s) => s.mode === slot.mode);
        const ids = (s: typeof slot) => s.legal.map((l) => (l.kind === 'object' ? l.id : l.seat));
        expect(ids(slot), `${slot.specId} lists the same targets`).toEqual(ids(first ?? slot));
        t.targetSlotsChecked += 1;
      }
    }
  }
  // A choice of targets for a mode chosen more than once: the same target for two instances or different ones, both are answers.
  if (step.action.kind === 'chooseTargets' && step.before.pending?.kind === 'targets') {
    const byMode = new Map<number, string[]>();
    for (const slot of step.before.pending.specs) {
      const picked = step.action.targets.filter((x) => x.specId === slot.specId);
      const ids = picked.map((p) => (p.kind === 'object' ? p.id : `p${p.seat}`));
      byMode.set(slot.mode ?? -1, [...(byMode.get(slot.mode ?? -1) ?? []), ...ids]);
    }
    for (const ids of byMode.values()) {
      if (ids.length < 2) continue;
      if (new Set(ids).size < ids.length) t.sameTargetTwice += 1;
      else t.differentTargets += 1;
    }
  }
  for (const e of step.events) {
    if (e.kind === 'modesChosen' && e.automatic) {
      t.automatic += 1;
      // The engine chose by itself: exactly one choice was legal.
      const fact = FACTS[nameOf(step.after, e.source)] as ModalFact;
      const controller = step.after.objects[e.source]?.controller ?? 0;
      expect(expectedSets(step.after, controller, fact), `${e.source}`).toEqual([[...e.modes]]);
    }
    if (e.kind === 'abilityRemoved' && e.reason === 'noLegalModes') {
      t.removed += 1;
      const fact = FACTS[nameOf(step.after, e.source)] as ModalFact;
      expect(expectedSets(step.after, e.seat, fact), 'no legal choice of modes').toEqual([]);
    }
  }
}

const eventsOf = <K extends GameEvent['kind']>(events: readonly GameEvent[], kind: K) =>
  events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

/** What a resolving spell or ability did, read from the events (CR 608.2, 700.2d). */
function checkResolution(t: Tally, step: StepInfo) {
  for (const done of [...eventsOf(step.events, 'resolved'), ...eventsOf(step.events, 'fizzled')]) {
    const obj = step.before.objects[done.object];
    const name = nameOf(step.before, done.object);
    const fact = FACTS[name];
    if (obj === undefined || fact === undefined || obj.stack == null) continue;
    if (obj.stack.chosenModes.length === 0 && fact.min > 0) continue;
    t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    const controller = obj.controller;
    const source = obj.stack.kind === 'ability' ? (obj.stack.source ?? done.object) : done.object;
    const instances = slotsOf(fact, obj.stack.chosenModes);
    const chosenTargets = obj.stack.chosenTargets;
    const alive = (specId: string): boolean => {
      const target = chosenTargets.find((x) => x.specId === specId);
      if (target === undefined) return false;
      return target.kind === 'player' || step.before.battlefield.includes(target.id);
    };
    const seen = new Map<number, number>();
    const run = [...obj.stack.chosenModes]
      .sort((a, b) => a - b)
      .map((mode) => {
        const n = seen.get(mode) ?? 0;
        seen.set(mode, n + 1);
        const m = fact.modes[mode] as ModeFact;
        return { m, specId: m.id === undefined ? null : slotId(m.id, n) };
      });
    const targeted = run.filter((r) => r.specId !== null);
    const noneLeft = targeted.length > 0 && targeted.every((r) => !alive(r.specId as string));
    expect(instances.length).toBe(targeted.length);
    if (done.kind === 'fizzled') {
      expect(noneLeft, `${name} fizzled with a target left`).toBe(true);
      t.fizzled += 1;
      continue;
    }
    expect(noneLeft, `${name} resolved with every target gone`).toBe(false);
    t.resolved += 1;
    if (targeted.some((r) => !alive(r.specId as string))) t.partial += 1;
    let draws = 0;
    let damage = 0;
    const gains = new Map<number, number>();
    const gain = (seat: number, n: number) => gains.set(seat, (gains.get(seat) ?? 0) + n);
    for (const r of run) {
      if (r.specId !== null && !alive(r.specId)) continue; // CR 608.2b: this instance does nothing
      if (r.m.draw === true) draws += 1;
      gain(controller, r.m.gain ?? 0);
      if (r.m.targetGain !== undefined && r.specId !== null) {
        const player = chosenTargets.find((x) => x.specId === r.specId);
        if (player?.kind === 'player') gain(player.seat, r.m.targetGain);
      }
      damage += r.m.damage ?? 0;
    }
    const library = step.before.seats[controller]?.library.length ?? 0;
    if (library >= draws) {
      const drawn = eventsOf(step.events, 'cardDrawn').filter((e) => e.seat === controller);
      expect(drawn.length, `${name} draws once for each instance of its draw mode`).toBe(draws);
      t.drawChecked += draws;
    }
    for (const seat of [0, 1]) {
      const gained = eventsOf(step.events, 'lifeGained')
        .filter((e) => e.seat === seat)
        .reduce((sum, e) => sum + e.amount, 0);
      // Life gained by anything else during this step (a lifelinker's damage cannot happen here) is not expected.
      expect(gained, `${name} gains the life of every instance for seat ${seat}`).toBe(
        gains.get(seat) ?? 0,
      );
    }
    t.gainChecked += [...gains.values()].reduce((a, b) => a + b, 0);
    const dealt = eventsOf(step.events, 'damageDealt')
      .filter((e) => e.source === source && !e.combat)
      .reduce((sum, e) => sum + e.amount, 0);
    expect(dealt, `${name} deals the damage of every instance whose target is there`).toBe(damage);
    t.damageChecked += damage;
  }
}

test(
  `${GAMES} repeatable-mode games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = REPEATABLE_STYLE_PAIRS[g % REPEATABLE_STYLE_PAIRS.length] ?? [
        'repeatable',
        'repeatable',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 18900 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 18900 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkAsk(t, step);
        checkAnswer(t, step);
        checkResolution(t, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      for (const key of Object.keys(t) as (keyof Tally)[]) {
        if (key === 'byCard') {
          for (const [name, n] of t.byCard) {
            total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
          }
        } else {
          (total[key] as number) += t[key] as number;
        }
      }
    }
    console.log(
      `${GAMES} repeatable-mode games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.asked, 'asked');
    expectPath(total.repeatsChosen, 'a mode chosen more than once');
    expectPath(total.targetSlotsChecked, 'target slots of the instances');
    expectPath(total.resolved, 'resolved');
    for (const name of REPEATABLE_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(240_000),
);
