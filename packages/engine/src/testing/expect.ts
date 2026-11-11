/** Assertions that fail with readable messages. They throw ScenarioError, which any runner reports. */

import { applyAction, getLegalActions } from '../api';
import type { Zone } from '../ast/types';
import { stateHash } from '../hash';
import type { SeatId } from '../ids';
import { checkInvariants } from '../invariants';
import { poolColorCounts } from '../mana/pool';
import type { ManaColor } from '../mana/types';
import { derive } from '../rules/derive';
import { ringBearerOf } from '../rules/ring-bearer';
import type { Action } from '../state/actions';
import type { GameEvent } from '../state/events';
import type { GameState } from '../state/types';
import { combatSpecToAction } from './combat-refs';
import {
  describeAction,
  describeEvent,
  describeObject,
  describePending,
  dumpState,
  nameOf,
} from './describe';
import { createCombatExpectations } from './expect-combat';
import { findObjects, type RefContext, resolveObject, specToAction } from './refs';
import { manaList } from './spec';
import {
  type ActionSpec,
  type EventMatcher,
  type Expectations,
  type ManaSpec,
  ScenarioError,
} from './types';

function fail(message: string, state: GameState): never {
  throw new ScenarioError(`${message}\n--- state ---\n${dumpState(state)}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Partial deep match: every key of the pattern must match; arrays and primitives compare exactly. */
function partialMatch(actual: unknown, pattern: unknown): boolean {
  if (typeof pattern === 'function') return (pattern as (v: unknown) => boolean)(actual);
  if (isRecord(pattern)) {
    if (!isRecord(actual)) return false;
    return Object.entries(pattern).every(([k, v]) => partialMatch(actual[k], v));
  }
  if (Array.isArray(pattern)) {
    return (
      Array.isArray(actual) &&
      actual.length === pattern.length &&
      pattern.every((p, i) => partialMatch(actual[i], p))
    );
  }
  return Object.is(actual, pattern);
}

/** The card an event is about, by name, using last-known information for objects that left. */
function eventCardNames(state: GameState, e: GameEvent): string[] {
  const rec = e as unknown as Record<string, unknown>;
  const names: string[] = [];
  for (const key of ['object', 'from', 'to', 'source']) {
    const id = rec[key];
    if (typeof id !== 'string') continue;
    const obj =
      state.objects[id as keyof GameState['objects']] ??
      state.lki[id as keyof GameState['lki']]?.object;
    if (obj) names.push(nameOf(state, obj));
  }
  return names;
}

function eventMatches(state: GameState, e: GameEvent, matcher: EventMatcher): boolean {
  const { cardName, ...rest } = matcher as { cardName?: unknown } & EventMatcher;
  if (cardName !== undefined && !eventCardNames(state, e).includes(String(cardName))) return false;
  return partialMatch(e, rest);
}

const matcherText = (m: EventMatcher) => JSON.stringify(m);

export function createExpectations(
  ctx: RefContext,
  events: readonly GameEvent[],
  getState: () => GameState,
): Expectations {
  const seatText = (seat: SeatId | undefined) => (seat === undefined ? '' : ` for seat ${seat}`);

  function whereIs(card: string): string {
    const state = getState();
    const there = findObjects(state, { name: card });
    return there.length === 0
      ? `no card named "${card}" exists in the game`
      : `it is at: ${there.map((o) => describeObject(state, o)).join('; ')}`;
  }

  function legalList(seat: SeatId, action: Action): boolean {
    const text = JSON.stringify(action);
    return getLegalActions(getState(), seat).some((a) => JSON.stringify(a) === text);
  }

  const toAction = (seat: SeatId, spec: ActionSpec): Action =>
    combatSpecToAction(ctx, seat, spec) ?? specToAction(ctx, seat, spec);
  const isCombatSpec = (spec: ActionSpec) =>
    typeof spec === 'object' &&
    ('declareAttackers' in spec || 'declareBlockers' in spec || 'assignDamage' in spec);

  const self: Expectations = {
    ...createCombatExpectations(ctx, getState),
    zone(card, zone: Zone, options = {}) {
      const state = getState();
      const matches = findObjects(state, {
        name: card,
        zone,
        ...(options.seat === undefined ? {} : { seat: options.seat }),
      });
      const want = options.count;
      const label = `"${card}" in ${zone}${seatText(options.seat)}`;
      if (want === undefined ? matches.length === 0 : matches.length !== want) {
        fail(
          `Expected ${want === undefined ? 'at least one' : want} of ${label} but found ${matches.length}; ${whereIs(card)}`,
          state,
        );
      }
    },
    noObject(card, options = {}) {
      const state = getState();
      const matches = findObjects(state, {
        name: card,
        ...(options.zone === undefined ? {} : { zone: options.zone }),
        ...(options.seat === undefined ? {} : { seat: options.seat }),
      });
      if (matches.length > 0) {
        fail(
          `Expected no "${card}"${options.zone ? ` in ${options.zone}` : ''}${seatText(options.seat)} but found ${matches
            .map((o) => describeObject(state, o))
            .join('; ')}`,
          state,
        );
      }
    },
    life(seat, life) {
      const state = getState();
      const actual = state.seats[seat]?.life;
      if (actual !== life)
        fail(`Expected seat ${seat} to have ${life} life but it has ${actual}`, state);
    },
    tapped(card, tapped = true) {
      const state = getState();
      const obj = resolveObject(ctx, card);
      if (obj.tapped !== tapped) {
        fail(
          `Expected ${describeObject(state, obj)} to be ${tapped ? 'tapped' : 'untapped'}`,
          state,
        );
      }
    },
    chosen(card, chosen) {
      const state = getState();
      const obj = resolveObject(ctx, card);
      if (JSON.stringify(obj.chosen ?? null) !== JSON.stringify(chosen)) {
        fail(
          `Expected ${describeObject(state, obj)} to have chosen ${JSON.stringify(chosen)} but it has chosen ${JSON.stringify(obj.chosen ?? null)}`,
          state,
        );
      }
    },
    pt(card, power, toughness) {
      const state = getState();
      const obj = resolveObject(ctx, card);
      const d = derive(state, obj);
      if (d.power !== power || d.toughness !== toughness) {
        fail(
          `Expected ${describeObject(state, obj)} to be ${power}/${toughness} but it is ${d.power}/${d.toughness}`,
          state,
        );
      }
    },
    derived(card, expected) {
      const state = getState();
      const obj = resolveObject(ctx, card);
      const d = derive(state, obj);
      const actual: Record<string, readonly string[]> = {
        types: d.types,
        subtypes: d.subtypes,
        colors: d.colors,
        keywords: d.abilities.flatMap((a) => (a.kind === 'keyword' ? [a.keyword.kind] : [])),
      };
      for (const [key, want] of Object.entries(expected)) {
        const have = actual[key] ?? [];
        if (JSON.stringify([...have].sort()) !== JSON.stringify([...want].sort())) {
          fail(
            `Expected ${describeObject(state, obj)} to have ${key} [${[...want].join(', ')}] but it has [${have.join(', ')}]`,
            state,
          );
        }
      }
    },
    attached(card, to) {
      const state = getState();
      const obj = resolveObject(ctx, card);
      const host = to === null ? null : resolveObject(ctx, to);
      const actual = obj.attachedTo;
      if (actual !== (host?.id ?? null)) {
        const now =
          actual === null ? 'nothing' : describeObject(state, state.objects[actual] ?? obj);
        fail(
          `Expected ${describeObject(state, obj)} to be attached to ${host === null ? 'nothing' : describeObject(state, host)} but it is attached to ${now}`,
          state,
        );
      }
    },
    counters(card, counters) {
      const state = getState();
      const obj = resolveObject(ctx, card);
      const actual = Object.fromEntries(Object.entries(obj.counters).filter(([, n]) => n > 0));
      const want = Object.fromEntries(Object.entries(counters).filter(([, n]) => n > 0));
      if (
        JSON.stringify(Object.entries(actual).sort()) !==
        JSON.stringify(Object.entries(want).sort())
      ) {
        fail(
          `Expected ${describeObject(state, obj)} to have counters ${JSON.stringify(want)} but it has ${JSON.stringify(actual)}`,
          state,
        );
      }
    },
    damage(card, damage) {
      const state = getState();
      const obj = resolveObject(ctx, card);
      if (obj.damage !== damage) {
        fail(
          `Expected ${describeObject(state, obj)} to have ${damage} damage marked but it has ${obj.damage}`,
          state,
        );
      }
    },
    pool(seat, mana: ManaSpec) {
      const state = getState();
      const actual = poolColorCounts(state.seats[seat]?.manaPool ?? []);
      const want: Record<ManaColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
      for (const color of manaList(mana)) want[color] += 1;
      const show = (c: Record<ManaColor, number>) =>
        Object.entries(c)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${n}${k}`)
          .join(' ') || 'empty';
      if (show(actual) !== show(want)) {
        fail(
          `Expected seat ${seat}'s mana pool to be ${show(want)} but it is ${show(actual)}`,
          state,
        );
      }
    },
    handSize(seat, size) {
      const state = getState();
      const actual = state.seats[seat]?.hand.length;
      if (actual !== size)
        fail(`Expected seat ${seat} to have ${size} cards in hand but it has ${actual}`, state);
    },
    librarySize(seat, size) {
      const state = getState();
      const actual = state.seats[seat]?.library.length;
      if (actual !== size)
        fail(`Expected seat ${seat}'s library to have ${size} cards but it has ${actual}`, state);
    },
    stack(names) {
      const state = getState();
      const actual = [...state.stack].reverse().map((id) => {
        const obj = state.objects[id];
        return obj ? nameOf(state, obj) : id;
      });
      if (JSON.stringify(actual) !== JSON.stringify(names)) {
        fail(
          `Expected the stack (top first) to be [${names.join(', ')}] but it is [${actual.join(', ')}]`,
          state,
        );
      }
    },
    pending(kind, seat) {
      const state = getState();
      const d = state.pending;
      if (d === null || d.kind !== kind || (seat !== undefined && d.seat !== seat)) {
        fail(
          `Expected a ${kind} decision${seat === undefined ? '' : ` for seat ${seat}`} but the engine is waiting for ${describePending(state, d)}`,
          state,
        );
      }
    },
    step(step, options = {}) {
      const state = getState();
      const t = state.turn;
      if (
        t.step !== step ||
        (options.active !== undefined && t.activeSeat !== options.active) ||
        (options.turn !== undefined && t.number !== options.turn)
      ) {
        fail(
          `Expected step ${step}${options.active === undefined ? '' : ` of seat ${options.active}'s turn`}${options.turn === undefined ? '' : ` (turn ${options.turn})`} but it is ${t.step} of seat ${t.activeSeat}'s turn ${t.number}`,
          state,
        );
      }
    },
    eventLog(matchers, options = {}) {
      const state = getState();
      const pool = events.slice(options.since ?? 0);
      let from = 0;
      for (const m of matchers) {
        const at = pool.findIndex((e, i) => i >= from && eventMatches(state, e, m));
        if (at < 0) {
          const inAnyOrder = pool.some((e) => eventMatches(state, e, m));
          fail(
            `Expected the event log to contain ${matcherText(m)}${inAnyOrder ? ' after the previous matcher (it appears only earlier)' : ''}.\nEvents${options.since ? ` since ${options.since}` : ''}:\n  ${pool.map((e) => describeEvent(state, e)).join('\n  ') || '(none)'}`,
            state,
          );
        }
        from = at + 1;
      }
    },
    noEvent(matcher, options = {}) {
      const state = getState();
      const hit = events.slice(options.since ?? 0).find((e) => eventMatches(state, e, matcher));
      if (hit)
        fail(
          `Expected no event matching ${matcherText(matcher)} but found ${describeEvent(state, hit)}`,
          state,
        );
    },
    gameOver(result) {
      const state = getState();
      const actual = state.result;
      const ok =
        actual !== null &&
        (result === 'draw'
          ? actual.kind === 'draw'
          : actual.kind === 'win' && actual.winner === result.win);
      if (!ok) {
        fail(
          `Expected the game to end in ${result === 'draw' ? 'a draw' : `a win for seat ${result.win}`} but the result is ${JSON.stringify(actual)}`,
          state,
        );
      }
    },
    hasLost(seat, lost = true) {
      const state = getState();
      if (state.seats[seat]?.hasLost !== lost) {
        fail(`Expected seat ${seat} ${lost ? 'to have lost' : 'not to have lost'}`, state);
      }
    },
    monarch(seat) {
      const state = getState();
      if (state.monarch !== seat) {
        fail(
          `Expected ${seat === null ? 'no monarch' : `seat ${seat} to be the monarch`} but ${state.monarch === null ? 'there is none' : `seat ${state.monarch} is`}`,
          state,
        );
      }
    },
    citysBlessing(seat, has = true) {
      const state = getState();
      const actual = state.seats[seat]?.citysBlessing === true;
      if (actual !== has) {
        fail(
          `Expected seat ${seat} ${has ? 'to have' : 'not to have'} the city's blessing but ${actual ? 'it has it' : 'it does not'}`,
          state,
        );
      }
    },
    ringLevel(seat, tempted) {
      const state = getState();
      const actual = state.seats[seat]?.ring?.tempted ?? 0;
      if (actual !== tempted) {
        fail(
          `Expected the Ring to have tempted seat ${seat} ${tempted} times but it has ${actual}`,
          state,
        );
      }
    },
    ringBearer(seat, card) {
      const state = getState();
      const bearer = ringBearerOf(state, seat);
      if (card === null) {
        if (bearer !== null)
          fail(`Expected seat ${seat} to have no Ring-bearer but ${bearer.id} is`, state);
        return;
      }
      const expected = resolveObject(ctx, card);
      if (bearer?.id !== expected.id) {
        fail(
          `Expected ${expected.id} to be the Ring-bearer of seat ${seat} but ${bearer === null ? 'there is none' : `${bearer.id} is`}`,
          state,
        );
      }
    },
    legal(seat, spec) {
      const state = getState();
      const action = toAction(seat, spec);
      // The legal-action list holds only some combat declarations, so for those the engine decides.
      const accepted = isCombatSpec(spec)
        ? applyAction(state, seat, action).ok
        : legalList(seat, action);
      if (!accepted) {
        fail(
          `Expected seat ${seat} ${describeAction(state, action)} to be legal but getLegalActions does not list it (waiting for ${describePending(state, state.pending)})`,
          state,
        );
      }
    },
    illegal(seat, spec) {
      const state = getState();
      const action = toAction(seat, spec);
      const text = describeAction(state, action);
      const before = stateHash(state);
      const result = applyAction(state, seat, action);
      const problems: string[] = [];
      if (result.ok) problems.push('applyAction accepted it');
      if (legalList(seat, action)) problems.push('getLegalActions lists it');
      if (stateHash(state) !== before) problems.push('the state changed');
      if (problems.length > 0) {
        fail(
          `Expected seat ${seat} ${text} to be illegal everywhere, but ${problems.join(' and ')}`,
          state,
        );
      }
    },
    hash(hash) {
      const state = getState();
      const actual = stateHash(state);
      if (actual !== hash)
        fail(`Expected state hash ${hash} but it is ${actual}: the state is not the same`, state);
    },
    position(hash) {
      const state = getState();
      const actual = stateHash({ ...state, actionCount: 0 });
      if (actual !== hash) {
        fail(
          `Expected position hash ${hash} but it is ${actual}: the game position is not the same`,
          state,
        );
      }
    },
    invariants() {
      const state = getState();
      const problems = checkInvariants(state);
      if (problems.length > 0)
        fail(`State invariants are violated:\n  ${problems.join('\n  ')}`, state);
    },
  };
  return self;
}
