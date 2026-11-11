/**
 * The scenario driver: readable verbs over a GameState. Every verb is an applyAction call; the
 * state is replaced only by a result the engine accepted. A rejected verb throws a ScenarioError
 * carrying the engine's message, except through the `try` verbs.
 */

import { applyAction, getLegalActions } from '../api';
import { stateHash } from '../hash';
import type { CardId, ObjectId, SeatId } from '../ids';
import { checkInvariants } from '../invariants';
import { defaultDivision } from '../rules/combat-flow';
import type { Action } from '../state/actions';
import type { ChosenTarget } from '../state/chosen';
import type { GameEvent } from '../state/events';
import type { GameObject, GameState, StepId } from '../state/types';
import { getView } from '../view';
import {
  assignDamageAction,
  attackSpecs,
  declareAttackersAction,
  declareBlockersAction,
} from './combat-refs';
import { describeAction, describePending, dumpState } from './describe';
import { createExpectations } from './expect';
import { playCombat } from './play-combat';
import {
  activateAction,
  castAction,
  findObjects,
  playLandAction,
  type RefContext,
  resolveObject,
  specialAction,
  tapAction,
  toTarget,
} from './refs';
import {
  type ActivateOptions,
  type Actor,
  type CardQuery,
  type CardRef,
  type CastHandle,
  type CastOptions,
  ScenarioError,
  type ScenarioGame,
  type SpecialOptions,
  type TargetRef,
  type TryResult,
  type TryVerbs,
} from './types';

export interface DriverOptions {
  readonly labels?: ReadonlyMap<string, CardId>;
  /** Check checkInvariants after every accepted action. Default true. */
  readonly checkInvariants?: boolean;
  /**
   * Hash the state before and after every action to prove the engine did not mutate its input
   * (SPEC 17.1 A6). Default true.
   */
  readonly checkPurity?: boolean;
  /** Events that already happened (for example those of createGame). */
  readonly events?: readonly GameEvent[];
}

const MAX_PASSES = 2000;

/** Wraps an existing state (from `scenario().build()` or `createGame`) in the driver. */
export function createDriver(initial: GameState, options: DriverOptions = {}): ScenarioGame {
  let state = initial;
  const events: GameEvent[] = [...(options.events ?? [])];
  const log: { seat: SeatId; action: Action }[] = [];
  const labels = options.labels ?? new Map<string, CardId>();
  const checkInv = options.checkInvariants !== false;
  const checkPurity = options.checkPurity !== false;
  const initialActionCount = initial.actionCount;
  const ctx: RefContext = {
    get state() {
      return state;
    },
    labels,
  };

  function summary(): string {
    return `${describePending(state, state.pending)}\n${dumpState(state)}`;
  }

  /** Applies an action; keeps the new state only if the engine accepted it. */
  function tryApply(seat: SeatId, action: Action): TryResult {
    const before = state;
    const hashBefore = checkPurity ? stateHash(before) : '';
    const text = describeAction(before, action);
    const result = applyAction(before, seat, action);
    if (checkPurity && stateHash(before) !== hashBefore) {
      throw new ScenarioError(`applyAction mutated its input state while handling ${text}`);
    }
    if (!result.ok) return { ok: false, error: result.error };
    state = result.state;
    events.push(...result.events);
    log.push({ seat, action });
    if (checkInv) {
      const problems = checkInvariants(state);
      // GameState.actionCount is the length of the action log, so it counts every accepted action,
      // including a cancel that rewinds the rest of the state (SPEC 17.1 A3).
      if (state.actionCount - initialActionCount !== log.length) {
        problems.push(
          `actionCount is ${state.actionCount - initialActionCount} but ${log.length} actions were applied`,
        );
      }
      if (problems.length > 0) {
        throw new ScenarioError(
          `State invariants broke after seat ${seat} ${text}:\n  ${problems.join('\n  ')}\n${dumpState(state)}`,
        );
      }
    }
    return { ok: true, events: result.events };
  }

  function apply(seat: SeatId, action: Action): void {
    const text = describeAction(state, action);
    const r = tryApply(seat, action);
    if (!r.ok) {
      throw new ScenarioError(
        `The engine rejected seat ${seat} ${text}: ${r.error}\nWaiting for: ${summary()}`,
      );
    }
  }

  function pendingOf(kind: string): NonNullable<GameState['pending']> {
    const d = state.pending;
    if (d === null || d.kind !== kind) {
      throw new ScenarioError(
        `Expected a ${kind} decision but the engine is waiting for ${describePending(state, d)}`,
      );
    }
    return d;
  }

  function mapTargets(refs: readonly TargetRef[], divide?: readonly number[]): ChosenTarget[] {
    const d = pendingOf('targets');
    if (d.kind !== 'targets') throw new ScenarioError('unreachable');
    const out: ChosenTarget[] = [];
    let i = 0;
    for (const spec of d.specs) {
      const take = Math.min(spec.max, refs.length - i);
      for (let k = 0; k < take; k += 1) {
        out.push(toTarget(ctx, refs[i + k] as TargetRef, spec.specId));
      }
      i += take;
    }
    if (i < refs.length) {
      throw new ScenarioError(`${refs.length} targets given but the spell has room for ${i}`);
    }
    if (divide === undefined) return out;
    if (divide.length !== out.length) {
      throw new ScenarioError(`${divide.length} shares given for ${out.length} targets`);
    }
    return out.map((t, k) => ({ ...t, share: divide[k] as number }));
  }

  function actor(seat: SeatId): Actor {
    const handle = (): CastHandle => ({
      get stage() {
        const c = state.casting;
        return c === null ? 'cast' : c.stage;
      },
      modes(...modes) {
        pendingOf('chooseModes');
        apply(seat, { kind: 'chooseModes', modes });
        return handle();
      },
      kicker(pay) {
        const d = pendingOf('confirmOptional');
        if (d.kind !== 'confirmOptional' || d.purpose !== 'kicker') {
          throw new ScenarioError('The engine is not asking the kicker question');
        }
        apply(seat, { kind: pay ? 'acceptOptional' : 'declineOptional' });
        return handle();
      },
      gift(promise) {
        const d = pendingOf('confirmOptional');
        if (d.kind !== 'confirmOptional' || d.purpose !== 'gift') {
          throw new ScenarioError('The engine is not asking the gift question');
        }
        apply(seat, { kind: promise ? 'acceptOptional' : 'declineOptional' });
        return handle();
      },
      additionalCost(first) {
        const d = pendingOf('confirmOptional');
        if (d.kind !== 'confirmOptional' || d.purpose !== 'costChoice') {
          throw new ScenarioError('The engine is not asking which additional cost to pay');
        }
        apply(seat, { kind: first ? 'acceptOptional' : 'declineOptional' });
        return handle();
      },
      kicks(count) {
        const d = pendingOf('chooseX');
        if (d.kind !== 'chooseX' || d.purpose !== 'multikicker') {
          throw new ScenarioError(
            'The engine is not asking how many times to pay the multikicker cost',
          );
        }
        apply(seat, { kind: 'chooseX', value: count });
        return handle();
      },
      replicas(count) {
        const d = pendingOf('chooseX');
        if (d.kind !== 'chooseX' || d.purpose !== 'replicate') {
          throw new ScenarioError(
            'The engine is not asking how many times to pay the replicate cost',
          );
        }
        apply(seat, { kind: 'chooseX', value: count });
        return handle();
      },
      x(value) {
        pendingOf('chooseX');
        apply(seat, { kind: 'chooseX', value });
        return handle();
      },
      targets(refs, divide) {
        apply(seat, { kind: 'chooseTargets', targets: mapTargets(refs, divide) });
        return handle();
      },
      payOptions(...cards) {
        const d = pendingOf('choosePayOptions');
        if (d.kind !== 'choosePayOptions') throw new ScenarioError('unreachable');
        const zone = d.mechanism === 'delve' ? 'graveyard' : 'battlefield';
        apply(seat, {
          kind: 'choosePayOptions',
          objects: cards.map((c) => resolveObject(ctx, c, { zones: [zone], seat }).id),
        });
        return handle();
      },
      pay() {
        pendingOf('payMana');
        apply(seat, { kind: 'payAuto' });
        return self;
      },
      payManual(sources) {
        pendingOf('payMana');
        const taps = sources.map((s) => {
          const detailed = typeof s === 'object' && 'source' in s;
          const a = detailed
            ? tapAction(ctx, seat, s.source, {
                ...(s.color !== undefined ? { color: s.color } : {}),
                ...(s.combination !== undefined ? { combination: s.combination } : {}),
                ...(s.ability !== undefined ? { ability: s.ability } : {}),
                ...(s.sacrifice !== undefined ? { sacrifice: s.sacrifice } : {}),
              })
            : tapAction(ctx, seat, s);
          if (a.kind !== 'activateAbility') throw new ScenarioError('not a mana ability');
          return {
            object: a.source,
            abilityIndex: a.abilityIndex,
            ...(detailed && s.color !== undefined ? { color: a.color } : {}),
            ...(detailed && a.combination !== undefined ? { combination: a.combination } : {}),
            ...(a.sacrifice === undefined ? {} : { sacrifice: a.sacrifice }),
          };
        });
        apply(seat, { kind: 'payManual', taps });
        return self;
      },
      cancel() {
        apply(seat, { kind: 'cancel' });
        return self;
      },
    });
    const run = (action: Action): Actor => {
      apply(seat, action);
      return self;
    };
    const tries: TryVerbs = {
      playLand: (card, o) => tryApply(seat, playLandAction(ctx, seat, card, o?.face)),
      cast: (card, o) => tryApply(seat, castAction(ctx, seat, card, o?.alternative, o?.face)),
      tapForMana: (card, o) => tryApply(seat, tapAction(ctx, seat, card, o)),
      activate: (card, o) => tryApply(seat, activateAction(ctx, seat, card, o?.ability)),
      suspend: (card) => tryApply(seat, specialAction(ctx, seat, 'suspend', card)),
      foretell: (card) => tryApply(seat, specialAction(ctx, seat, 'foretell', card)),
      pass: () => tryApply(seat, { kind: 'pass' }),
      declareAttackers: (attacks) => tryApply(seat, declareAttackersAction(ctx, seat, attacks)),
      declareBlockers: (blocks) => tryApply(seat, declareBlockersAction(ctx, seat, blocks)),
      assignDamage: (assignments) => tryApply(seat, assignDamageAction(ctx, assignments)),
      action: (action) => tryApply(seat, action),
    };
    const self: Actor = {
      seat,
      playLand: (card, o) => run(playLandAction(ctx, seat, card, o?.face)),
      cast(card, o: CastOptions = {}) {
        apply(seat, castAction(ctx, seat, card, o.alternative, o.face));
        const h = handle();
        if (o.modes !== undefined && state.casting?.stage === 'modes') h.modes(...o.modes);
        if (o.kicked !== undefined && state.casting?.stage === 'kicker') h.kicker(o.kicked);
        if (o.kicks !== undefined && state.casting?.stage === 'kicker') h.kicks(o.kicks);
        if (o.gift !== undefined && state.pending?.kind === 'confirmOptional') {
          if (state.pending.purpose === 'gift') h.gift(o.gift);
        }
        if (o.replicas !== undefined && state.casting?.stage === 'kicker') h.replicas(o.replicas);
        if (o.additionalCost !== undefined && state.pending?.kind === 'confirmOptional') {
          if (state.pending.purpose === 'costChoice') h.additionalCost(o.additionalCost);
        }
        if (o.x !== undefined && state.casting?.stage === 'x') h.x(o.x);
        if (o.targets !== undefined) h.targets(o.targets, o.divide);
        if (state.casting?.stage === 'payOptions') {
          if (o.payOptions !== undefined) h.payOptions(...o.payOptions);
          else if (o.pay) h.payOptions();
        }
        if (o.pay) {
          if (state.pending?.kind === 'targets') {
            throw new ScenarioError('cast(..., { pay: true }) needs the targets to be given too');
          }
          // Everything may already be paid (the cost was {0}, or Convoke or Delve paid all of it).
          if (state.pending?.kind === 'payMana') h.pay();
        }
        return h;
      },
      activate(card, o: ActivateOptions = {}) {
        apply(seat, activateAction(ctx, seat, card, o.ability));
        const h = handle();
        if (o.modes !== undefined && state.casting?.stage === 'modes') h.modes(...o.modes);
        if (o.x !== undefined && state.casting?.stage === 'x') h.x(o.x);
        if (o.targets !== undefined) h.targets(o.targets);
        if (o.pay) {
          if (state.pending?.kind === 'targets') {
            throw new ScenarioError(
              'activate(..., { pay: true }) needs the targets to be given too',
            );
          }
          if (state.pending?.kind === 'payMana') h.pay();
        }
        return h;
      },
      suspend(card, o: SpecialOptions = {}) {
        apply(seat, specialAction(ctx, seat, 'suspend', card));
        const h = handle();
        if (o.pay && state.pending?.kind === 'payMana') h.pay();
        return h;
      },
      foretell(card, o: SpecialOptions = {}) {
        apply(seat, specialAction(ctx, seat, 'foretell', card));
        const h = handle();
        if (o.pay && state.pending?.kind === 'payMana') h.pay();
        return h;
      },
      tapForMana: (card, o) => run(tapAction(ctx, seat, card, o)),
      pass: () => run({ kind: 'pass' }),
      concede: () => run({ kind: 'concede' }),
      keep: () => run({ kind: 'keepHand' }),
      mulligan: () => run({ kind: 'takeMulligan' }),
      chooseCards: (...cards) => {
        // A search chooses from a library; every other choice of cards is from the hand.
        const d = state.pending;
        const zone = d?.kind === 'chooseCards' ? d.zone : 'hand';
        return run({
          kind: 'chooseCards',
          objects: cards.map((c) => resolveObject(ctx, c, { zones: [zone], seat }).id),
        });
      },
      arrange: ({ top, other = [] }) =>
        run({
          kind: 'arrangeCards',
          top: top.map((c) => resolveObject(ctx, c, { zones: ['library'], seat }).id),
          other: other.map((c) => resolveObject(ctx, c, { zones: ['library'], seat }).id),
        }),
      sendToCommandZone: () => run({ kind: 'moveToCommandZone' }),
      declineCommandZone: () => run({ kind: 'declineCommandZone' }),
      choosePermanents: (...cards) =>
        run({
          kind: 'choosePermanents',
          objects: cards.map((c) => resolveObject(ctx, c, { zones: ['battlefield'], seat }).id),
        }),
      orderTriggers(...order) {
        const d = state.pending;
        if (d?.kind !== 'orderTriggers') {
          throw new ScenarioError(
            `Expected an orderTriggers decision but the engine is waiting for ${describePending(state, d)}`,
          );
        }
        const used = new Set<number>();
        const indices = order.map((entry) => {
          const index =
            typeof entry === 'number'
              ? entry
              : d.triggers.findIndex((t, i) => !used.has(i) && t.sourceName === entry);
          if (index < 0 || index >= d.triggers.length) {
            throw new ScenarioError(`No trigger "${String(entry)}" is waiting to be ordered`);
          }
          used.add(index);
          return index;
        });
        return run({ kind: 'orderTriggers', order: indices });
      },
      accept: () => run({ kind: 'acceptOptional' }),
      decline: () => run({ kind: 'declineOptional' }),
      chooseOption: (option) => run({ kind: 'chooseOption', option }),
      chooseX: (value) => run({ kind: 'chooseX', value }),
      chooseModes: (...modes) => run({ kind: 'chooseModes', modes }),
      declareAttackers: (attacks) => run(declareAttackersAction(ctx, seat, attacks)),
      attack: (attackers, target) =>
        run(declareAttackersAction(ctx, seat, attackSpecs(attackers, target))),
      noAttackers: () => run({ kind: 'declareAttackers', attacks: [] }),
      declareBlockers: (blocks) => run(declareBlockersAction(ctx, seat, blocks)),
      noBlocks: () => run({ kind: 'declareBlockers', blocks: [] }),
      assignDamage: (assignments) => run(assignDamageAction(ctx, assignments)),
      defaultDamage() {
        const d = state.pending;
        if (d?.kind !== 'assignDamage') {
          throw new ScenarioError(
            `Expected an assignDamage decision but the engine is waiting for ${describePending(state, d)}`,
          );
        }
        return run({ kind: 'assignDamage', assignments: defaultDivision(d.choices) });
      },
      chooseTargets: (...refs) => run({ kind: 'chooseTargets', targets: mapTargets(refs) }),
      payAuto: () => run({ kind: 'payAuto' }),
      cancel: () => run({ kind: 'cancel' }),
      choose: (action) => run(action),
      try: tries,
    };
    return self;
  }

  function decidingSeat(): SeatId {
    const d = state.pending;
    if (d === null) throw new ScenarioError(`Nobody is deciding: ${describePending(state, d)}`);
    return d.seat;
  }

  const game = {
    get state() {
      return state;
    },
    events,
    log,
    expect: createExpectations(ctx, events, () => state),
    act: actor,
    get deciding() {
      return decidingSeat();
    },
    pass(seat) {
      apply(seat ?? decidingSeat(), { kind: 'pass' });
      return game;
    },
    passAll() {
      const startedEmpty = state.stack.length === 0;
      const { step, number } = state.turn;
      for (let i = 0; i < MAX_PASSES; i += 1) {
        const d = state.pending;
        if (state.result || d === null || d.kind !== 'priority') return game;
        if (!startedEmpty && state.stack.length === 0) return game;
        if (startedEmpty && (state.turn.step !== step || state.turn.number !== number)) return game;
        apply(d.seat, { kind: 'pass' });
      }
      throw new ScenarioError(`passAll did not finish after ${MAX_PASSES} passes\n${summary()}`);
    },
    advanceTo(step: StepId, o: Parameters<ScenarioGame['advanceTo']>[1] = {}) {
      const want = o.turn === 'next' ? state.turn.number + 1 : o.turn;
      const reached = () =>
        state.turn.step === step && (want === undefined || state.turn.number >= want);
      for (let i = 0; i < MAX_PASSES; i += 1) {
        if (reached()) return game;
        const d = state.pending;
        if (state.result) {
          throw new ScenarioError(`The game ended before reaching ${step}\n${summary()}`);
        }
        // A "walk the turn" helper: nobody attacks and nobody blocks unless told to stop here.
        if (d?.kind === 'declareAttackers' && o.attack !== false) {
          // CR 508.1d: a creature that attacks each combat if able still attacks.
          const attacks = d.mustAttack.flatMap((attacker) => {
            const target = d.candidates.find((c) => c.attacker === attacker)?.targets[0];
            return target === undefined ? [] : [{ attacker, target }];
          });
          apply(d.seat, { kind: 'declareAttackers', attacks });
          continue;
        }
        if (d?.kind === 'declareBlockers' && o.block !== false) {
          apply(d.seat, { kind: 'declareBlockers', blocks: [] });
          continue;
        }
        if (d === null || d.kind !== 'priority') {
          throw new ScenarioError(
            `advanceTo(${step}) stopped in the ${state.turn.step} step: ${describePending(state, d)} must be answered first\n${summary()}`,
          );
        }
        apply(d.seat, { kind: 'pass' });
      }
      throw new ScenarioError(
        `advanceTo(${step}) did not arrive after ${MAX_PASSES} passes\n${summary()}`,
      );
    },
    playCombat: (plan) => playCombat(game, plan),
    choose(a: SeatId | Action, b?: Action): ScenarioGame {
      if (typeof a === 'number') {
        if (b === undefined) throw new ScenarioError('choose(seat, action) needs an action');
        apply(a, b);
      } else {
        apply(decidingSeat(), a);
      }
      return game;
    },
    object: (card: CardRef): GameObject => resolveObject(ctx, card),
    id: (card: CardRef): ObjectId => resolveObject(ctx, card).id,
    find: (query: CardQuery) => findObjects(state, query),
    legalActions: (seat) => getLegalActions(state, seat),
    view: (seat) => getView(state, seat),
    hash: () => stateHash(state),
    positionHash: () => stateHash({ ...state, actionCount: 0 }),
    mark: () => events.length,
    eventsSince: (mark) => events.slice(mark),
    dump: () => dumpState(state),
  } as ScenarioGame;
  return game;
}
