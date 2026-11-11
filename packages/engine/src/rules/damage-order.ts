/**
 * The effects that modify one damage event and the order they are applied in (CR 616.1, D-191).
 *
 * Damage that would be dealt can be changed by prevention effects (CR 615): the shields of `prevention.ts` and the static
 * `preventDamageToThis` of the permanent that would be dealt it, and by redirection effects (CR 614.9, `damage-redirect.ts`, D-192): a
 * creature that says the damage that would be dealt to its controller and the others it controls is dealt to it instead. When two or more
 * of them apply to the same event, CR 616.1 gives
 * the affected player the choice of which to apply first, and CR 616.1f repeats the process "taking into account only replacement
 * or prevention effects that would now be applicable" until none is left. This file is the one place that decides what applies:
 *
 * - `damageModifiers(state, event)` lists the effects that apply to the event as it is now, in the default order. It is called
 *   again after every step (CR 616.1f), so an effect that has stopped applying (the event is gone, a shield is used up) is no
 *   longer listed.
 * - `applyModifier` applies one of them: a shield for "all" or a static prevention takes all that is left of the event and is not
 *   used up (CR 615.7: it prevents nothing more once the event is gone, and a shield that prevents nothing is not used up); a
 *   numeric shield prevents up to its size, is reduced by what it prevents and is gone at 0 (CR 615.7).
 * - A redirection changes the recipient: the damage is then dealt to the creature, so the shields of the creature now apply (CR 616.2)
 *   and the ones of the first recipient no longer do. Each redirection is applied at most once to an event (CR 614.5, `used`).
 * - The default order is the shields and static abilities that prevent all damage first, which a player would always choose because
 *   they cost nothing to use, then the numeric shields, oldest first (CR 613.7: by timestamp), then the redirections, oldest first:
 *   "prevention first" (the owner's decision of 2026-11-02). It is what `dealDamage` has always done where there is no redirection, and
 *   what an agent that must give a fixed answer gives.
 * - `damageOrderMatters` is an exact search over the orders (at most `MAX_SEARCHED` effects): it says whether the order can change
 *   what the player ends with, where a result is what reaches the recipient (and who the recipient is) and the shields that remain,
 *   written without ids or timestamps so that two equal shields used in either order are the same result, and where a default order
 *   that is at least as good as every other (it prevents all and keeps the numeric shield) is not asked about either.
 */
import type { SeatId } from '../ids';
import type { DamageRecipient } from '../state/combat-types';
import type {
  ChooseOptionDecision,
  DamageReplacementChoice,
  DamageReplacementQuestion,
} from '../state/decisions';
import type { GameEvent } from '../state/events';
import type { GameState } from '../state/types';
import type { DamageEvent, DamageModifier } from './damage-modifier';
import { modifierText, nameOf } from './damage-order-text';
import { redirectKey, redirectsFor } from './damage-redirect';

export type { DamageEvent, DamageModifier } from './damage-modifier';

import {
  isShield,
  type Shield,
  type StaticPrevention,
  shieldApplies,
  staticPreventions,
} from './prevention';
import { sourceInfo } from './source-info';

/** The stable key of a modifier: the answer to the question asks for it, so it must not change between a question and its replay. */
export const staticKey = (p: StaticPrevention): string => `static:${p.object}:${p.index}`;
export const shieldKey = (s: Shield): string => `shield:${s.id}`;

/** More effects than this on one event and the question is asked without searching (it never skips a question that should be asked). */
export const MAX_SEARCHED = 6;

/**
 * The effects that apply to `event` as it is now, in the default order (the file comment). Empty when nothing is left of the event
 * or nothing applies. `used` are the keys of the redirections already applied to the event (CR 614.5). Only a permanent on the
 * battlefield can be dealt damage that a shield stops (CR 120.1a).
 */
export function damageModifiers(
  state: GameState,
  event: DamageEvent,
  used: readonly string[] = [],
): readonly DamageModifier[] {
  if (event.amount <= 0) return [];
  const { source, to, combat } = event;
  const statics: DamageModifier[] = staticPreventions(state, to, combat).map((prevention) => ({
    kind: 'prevent',
    key: staticKey(prevention),
    origin: { kind: 'static', prevention },
  }));
  const redirects = (): DamageModifier[] =>
    redirectsFor(state, to, used).map((redirect) => ({
      kind: 'redirect',
      key: redirectKey(redirect),
      origin: { kind: 'redirect', redirect },
    }));
  if (!state.continuousEffects.some(isShield)) return [...statics, ...redirects()];
  if (to.kind === 'object' && state.objects[to.id]?.zone !== 'battlefield') return statics;
  const fits = state.continuousEffects
    .filter(isShield)
    .filter((s) => shieldApplies(state, s, source, to, combat));
  const toModifier = (shield: Shield): DamageModifier => ({
    kind: 'prevent',
    key: shieldKey(shield),
    origin: { kind: 'shield', shield },
  });
  return [
    ...statics,
    ...fits.filter((s) => s.change.amount === 'all').map(toModifier),
    ...fits.filter((s) => s.change.amount !== 'all').map(toModifier),
    ...redirects(),
  ];
}

/**
 * A damage event partway through its process: who would be dealt what is left of it (`to`, which a redirection changes), what was
 * prevented, how many effects were applied, the shields now in the state, the redirections already applied (CR 614.5) and the events
 * of the recipients before this one. `lane` is what the current recipient has had applied: its prevented damage is reported when the
 * recipient changes or the process ends (CR 615.6).
 */
export interface Settling {
  /** The event as it began: its source and whether it is combat damage stay the same through the process. */
  readonly event: DamageEvent;
  readonly state: GameState;
  readonly to: DamageRecipient;
  readonly amount: number;
  readonly prevented: number;
  readonly applied: number;
  readonly used: readonly string[];
  readonly lane: { readonly applied: number; readonly prevented: number };
  readonly events: readonly GameEvent[];
}

export const beginSettling = (state: GameState, event: DamageEvent): Settling => ({
  event,
  state,
  to: event.to,
  amount: event.amount,
  prevented: 0,
  applied: 0,
  used: [],
  lane: { applied: 0, prevented: 0 },
  events: [],
});

/** The event as it is at this point of the process: the recipient it would be dealt to now and what is left of it. */
const eventAt = (event: DamageEvent, current: Settling): DamageEvent => ({
  ...event,
  to: current.to,
  amount: current.amount,
});

/** The effects that apply to the event at this point of the process, in the default order. */
const modifiersAt = (event: DamageEvent, current: Settling): readonly DamageModifier[] =>
  damageModifiers(current.state, eventAt(event, current), current.used);

/** The `damagePrevented` event of the current recipient (CR 615.6), or none when nothing was applied to it. */
const laneEvents = (current: Settling): readonly GameEvent[] =>
  current.lane.applied === 0
    ? []
    : [
        {
          kind: 'damagePrevented',
          source: current.event.source,
          to: current.to,
          amount: current.lane.prevented,
          combat: current.event.combat,
        },
      ];

/** Applies one modifier (the file comment): the result is what is left of the event and the shields after it. */
export function applyModifier(current: Settling, modifier: DamageModifier): Settling {
  const { origin } = modifier;
  if (origin.kind === 'redirect') {
    // CR 614.9: the same damage is dealt to the creature instead, by the same source; CR 614.5: this redirection is used for the event.
    const to: DamageRecipient = { kind: 'object', id: origin.redirect.object };
    return {
      ...current,
      to,
      applied: current.applied + 1,
      used: [...current.used, modifier.key],
      lane: { applied: 0, prevented: 0 },
      events: [
        ...current.events,
        ...laneEvents(current),
        {
          kind: 'damageRedirected',
          source: current.event.source,
          from: current.to,
          to,
          amount: current.amount,
          combat: current.event.combat,
        },
      ],
    };
  }
  const lane = (took: number) => ({
    applied: current.lane.applied + 1,
    prevented: current.lane.prevented + took,
  });
  if (origin.kind === 'static' || origin.shield.change.amount === 'all') {
    return {
      ...current,
      amount: 0,
      prevented: current.prevented + current.amount,
      applied: current.applied + 1,
      lane: lane(current.amount),
    };
  }
  const shield = origin.shield;
  const size = shield.change.amount as number;
  const take = Math.min(current.amount, size);
  const left = size - take;
  const continuousEffects = current.state.continuousEffects.flatMap((e) => {
    if (e.id !== shield.id) return [e];
    // CR 615.7: "once the shield has been reduced to 0" it is gone.
    return left === 0 ? [] : [{ ...e, change: { ...shield.change, amount: left } }];
  });
  return {
    ...current,
    state: { ...current.state, continuousEffects },
    amount: current.amount - take,
    prevented: current.prevented + take,
    applied: current.applied + 1,
    lane: lane(take),
  };
}

/** The shields that are interchangeable: the same effect on the same event, whatever their ids and timestamps (two Fog-like shields, two "prevent the next 3" of one kind). */
const groupOf = (e: Shield): string =>
  JSON.stringify([
    e.change.scope,
    e.change.amount === 'all',
    e.change.recipients ?? null,
    e.change.sources ?? null,
    e.change.sourceFilter ?? null,
    e.objects,
    e.players ?? null,
    e.until,
  ]);

/**
 * A shield of the game as the process began, with its group: kept from the start, because a used-up shield is no longer in the state, and
 * all of them are kept, because a redirection can make a shield that did not apply to the event apply to it (CR 616.2).
 */
interface Member {
  readonly id: string;
  readonly group: string;
}

const membersOf = (state: GameState): readonly Member[] =>
  state.continuousEffects.filter(isShield).map((s) => ({ id: s.id, group: groupOf(s) }));

const recipientKey = (to: DamageRecipient): string =>
  to.kind === 'player' ? `p${to.seat}` : `o${to.id}`;

/**
 * One result of the orders: what is left of the event, who it is dealt to and, for each group of interchangeable shields, what each of
 * them has left (descending, 0 for one that is gone, infinity for one that prevents all and is never used up). Written without ids, so
 * that two equal shields used in either order are the same result; with nothing left to deal, the recipient does not matter.
 */
interface Outcome {
  readonly amount: number;
  readonly to: DamageRecipient;
  readonly left: ReadonlyMap<string, readonly number[]>;
  readonly key: string;
}

function summarize(current: Settling, members: readonly Member[]): Outcome {
  const left = new Map<string, number[]>();
  for (const m of members) {
    const e = current.state.continuousEffects.find((c) => c.id === m.id);
    const size = e !== undefined && isShield(e) ? e.change.amount : 0;
    const list = left.get(m.group) ?? [];
    list.push(size === 'all' ? Number.POSITIVE_INFINITY : size);
    left.set(m.group, list);
  }
  for (const list of left.values()) list.sort((a, b) => b - a);
  const key = `${current.amount}|${current.amount > 0 ? recipientKey(current.to) : '-'}|${[...left]
    .map(([g, l]) => `${g}=${l.join(',')}`)
    .sort()
    .join(';')}`;
  return { amount: current.amount, to: current.to, left, key };
}

/**
 * Whether `a` is at least as good for the player as `b`: no more damage reaches the recipient, to the same recipient when any does (damage
 * to a creature and damage to the player are not the same thing), and no shield has less left (a shield kept is a shield for the rest of
 * the turn). Prevent-all first dominates every order that uses a numeric shield for nothing, so that order is never asked about; two
 * results that each keep something the other loses do not dominate each other, and ask.
 */
function dominates(a: Outcome, b: Outcome): boolean {
  if (a.amount > b.amount) return false;
  if (a.amount > 0 && recipientKey(a.to) !== recipientKey(b.to)) return false;
  for (const [group, theirs] of b.left) {
    const mine = a.left.get(group) ?? [];
    if (theirs.some((size, i) => (mine[i] ?? 0) < size)) return false;
  }
  return true;
}

/**
 * Every result the orders can give (a depth-first search, memoised on what the future depends on: the result so far, who the recipient is
 * and the redirections already used), by key.
 */
function outcomes(
  current: Settling,
  members: readonly Member[],
  memo: Map<string, ReadonlyMap<string, Outcome>>,
): ReadonlyMap<string, Outcome> {
  const here = summarize(current, members);
  const at = `${here.key}#${recipientKey(current.to)}#${[...current.used].sort().join(',')}`;
  const known = memo.get(at);
  if (known !== undefined) return known;
  const options = modifiersAt(current.event, current);
  const found = new Map<string, Outcome>();
  if (options.length === 0) {
    found.set(here.key, here);
  } else {
    for (const option of options) {
      for (const [k, o] of outcomes(applyModifier(current, option), members, memo)) {
        found.set(k, o);
      }
    }
  }
  memo.set(at, found);
  return found;
}

/** What is left of the event, who is dealt it and what is prevented, when the default order follows `from` to its end: the result a player gets by choosing nothing. */
function followDefault(from: Settling): Settling {
  let walk = from;
  for (;;) {
    const [first] = modifiersAt(walk.event, walk);
    if (first === undefined) return walk;
    walk = applyModifier(walk, first);
  }
}

/**
 * Whether the order of the effects that apply to `event` (given as `current`) matters to the affected player (the file comment):
 * false for fewer than two effects, when every order ends the same (two Fogs, two equal shields) and when the default order is at
 * least as good as every other (a shield that prevents all, then a numeric one that is kept); true when another order can be better
 * or worse in a way the default is not, and, without searching, when more than `MAX_SEARCHED` effects apply.
 */
export function damageOrderMatters(
  _event: DamageEvent,
  current: Settling,
  options: readonly DamageModifier[],
): boolean {
  if (options.length < 2) return false;
  if (options.length > MAX_SEARCHED) return true;
  const members = membersOf(current.state);
  const results = outcomes(current, members, new Map());
  if (results.size === 1) return false;
  const byDefault = summarize(followDefault(current), members);
  return ![...results.values()].every((r) => dominates(byDefault, r));
}

/**
 * How a run of damage events (one instruction of a spell or ability, one combat damage step) gets its answers (D-191): `answers` are the
 * keys already given, in the order the questions come, and `used` counts how many the run has read. The run is simulated from the
 * state it began with, so asking again after an answer asks the same questions in the same order. With `ask` false (the rider of a mana
 * ability, which resolves inside a payment and cannot wait for an answer) the default order is used where a question would be asked.
 */
export interface OrderFlow {
  readonly answers: readonly string[];
  used: number;
  readonly ask: boolean;
}

/** A flow that asks, with the answers given so far. */
export const askingFlow = (answers: readonly string[] = []): OrderFlow => ({
  answers,
  used: 0,
  ask: true,
});

/** A flow that never asks: the default order everywhere. */
export const quietFlow = (): OrderFlow => ({ answers: [], used: 0, ask: false });

/**
 * What settling an event gives: the state with the shields used, who is dealt what is still to be dealt (CR 615.6; `to` is not the recipient
 * of the event when a redirection was applied, CR 614.9) and the events (`damagePrevented` for each recipient that had damage prevented and
 * `damageRedirected` for each redirection, in the order they were applied).
 */
export interface Settled {
  readonly kind: 'settled';
  readonly state: GameState;
  readonly to: DamageRecipient;
  readonly remaining: number;
  readonly events: readonly GameEvent[];
}

/** The decision of a replacement question, before the engine gives it its id. */
export type ReplacementDecision = Omit<ChooseOptionDecision, 'id' | 'replacement'> & {
  readonly replacement: DamageReplacementQuestion;
};

/** A question the affected player must answer before the event can be settled. Nothing was changed. */
export interface Asked {
  readonly kind: 'asked';
  readonly decision: ReplacementDecision;
}

/**
 * The affected player of a damage event: the damaged player, or the controller of the damaged permanent (CR 616.1). It is asked again for the
 * recipient the event has at each step, so a redirection to a creature of another player would change the player (the engine redirects only
 * to a creature of the controller of the recipient: `validate-redirect.ts`).
 */
function affectedSeat(state: GameState, to: DamageRecipient): SeatId {
  return to.kind === 'player' ? to.seat : (state.objects[to.id]?.controller ?? 0);
}

/** The question for the effects `options` that apply to the event at `current`: each choice with what happens if it goes first and the rest follow the default order. */
function question(current: Settling, options: readonly DamageModifier[]): ReplacementDecision {
  const { source, combat } = current.event;
  const { to } = current;
  const choices: DamageReplacementChoice[] = options.map((m) => {
    const end = followDefault(applyModifier(current, m));
    const owner =
      m.origin.kind === 'static'
        ? m.origin.prevention.object
        : m.origin.kind === 'redirect'
          ? m.origin.redirect.object
          : undefined;
    return {
      option: m.key,
      kind: m.kind,
      text: modifierText(current.state, m, to),
      ...(owner === undefined ? {} : { object: owner, objectName: nameOf(current.state, owner) }),
      outcome: {
        to: end.to,
        ...(end.to.kind === 'object' ? { toName: nameOf(current.state, end.to.id) } : {}),
        amount: end.amount,
        prevented: end.prevented - current.prevented,
      },
    };
  });
  const info = sourceInfo(current.state, source);
  return {
    kind: 'chooseOption',
    seat: affectedSeat(current.state, to),
    purpose: 'replacement',
    options: options.map((m) => m.key),
    source,
    sourceName: info?.name ?? '',
    sourceOracleText: info?.oracleText ?? '',
    replacement: {
      event: {
        source,
        sourceName: info?.name ?? '',
        to,
        ...(to.kind === 'object' ? { toName: nameOf(current.state, to.id) } : {}),
        amount: current.amount,
        combat,
      },
      choices,
    },
  };
}

/**
 * Settles `event` (CR 616.1): the effects that apply are listed, one is applied, and the list is made again (CR 616.1f), until none is
 * left. With one effect, or when the order cannot matter (`damageOrderMatters`), the default order is used and nothing is asked; otherwise
 * the affected player chooses: the answer comes from `flow` (the question is returned, with nothing changed, when it has none left to
 * give). With a flow that does not ask, the default order is used.
 */
export function settleDamage(state: GameState, event: DamageEvent): Settled;
export function settleDamage(
  state: GameState,
  event: DamageEvent,
  flow: OrderFlow,
): Settled | Asked;
export function settleDamage(
  state: GameState,
  event: DamageEvent,
  flow: OrderFlow = quietFlow(),
): Settled | Asked {
  let current = beginSettling(state, event);
  // Once the order is known not to matter, the rest of the process follows the default order too: every order ends the same.
  let free = false;
  for (;;) {
    const options = modifiersAt(event, current);
    const [first] = options;
    if (first === undefined) break;
    let pick = first;
    if (options.length > 1 && !free) {
      if (!damageOrderMatters(event, current, options)) {
        free = true;
      } else if (flow.ask) {
        const answer = flow.answers[flow.used];
        if (answer === undefined) return { kind: 'asked', decision: question(current, options) };
        flow.used += 1;
        // The answer was checked against the options when it was given; the state is the same now, so it is one of them.
        pick = options.find((m) => m.key === answer) ?? first;
      }
    }
    current = applyModifier(current, pick);
  }
  return {
    kind: 'settled',
    state: current.state,
    to: current.to,
    remaining: current.amount,
    events: [...current.events, ...laneEvents(current)],
  };
}
