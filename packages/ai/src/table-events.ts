/**
 * The events of a table game (issue 482 follow-up): what the measuring report of `table-report.ts` reads.
 * An observer sits on the `onAction` hook of `runGame` and turns the applied actions into plain,
 * JSON-serialisable events: who was eliminated and why, how each attack was aimed, what each block let
 * through and what each removal spell was aimed at. It changes nothing and reads views and states only,
 * so a run with and without it plays the same game.
 *
 * Simplifications, all on the side of the measurement and none in the game:
 *  - `unblocked` and `avoidable` count the declared power of the attackers aimed at the defender (double
 *    strike twice, `hitDamage`); trample excess and prevention are not simulated.
 *  - `avoidable` is the unblocked damage of attackers that a creature the defender left out of its blocks
 *    could have blocked (a menace attacker needs two such creatures).
 *  - a block event exists only when the engine asked the defender: with no creature able to block, there is no
 *    declaration, and the damage that nothing could stop is not in `unblocked`.
 *  - the removal target is the first object of the chosen targets; a player target is `null`.
 */
import type { Action, AttackTarget, GameState, GameView, SeatId } from '@commander-arena/engine';
import { getView } from '@commander-arena/engine';
import { findObject, isCreature } from './casual-view';
import { COMMANDER_LETHAL, commanderClock, POISON_LETHAL } from './evaluate';
import { futureAttackers, hitDamage } from './heuristic-danger';
import { isRemovalSpell, threatValue } from './heuristic-targets';
import type { ActionStep } from './runner';
import { DEFAULT_WEIGHTS } from './weights';

export type EliminationCause = 'life' | 'poison' | 'commander' | 'decked' | 'concede' | 'other';

/** One group of an attack: the creatures sent at one target. */
export interface AttackGroup {
  /** The player attacked, or null when the target is a planeswalker or a battle. */
  readonly seat: SeatId | null;
  readonly attackers: number;
  readonly power: number;
  /** The life of the player attacked as the attack was declared (0 for a permanent). */
  readonly life: number;
}

/** An opponent as an attack was declared. */
export interface OpponentRow {
  readonly seat: SeatId;
  readonly life: number;
  /** The power of the creatures it could attack with next turn: what it would put on the table, before any block. */
  readonly incoming: number;
}

export type TableEvent =
  | {
      readonly kind: 'attack';
      readonly turn: number;
      readonly seat: SeatId;
      /** Creatures sent, and the creatures that could have gone. */
      readonly attackers: number;
      readonly candidates: number;
      readonly power: number;
      /** Every creature that could attack did. */
      readonly allIn: boolean;
      readonly groups: readonly AttackGroup[];
      /** The attacker's life as it declared. */
      readonly life: number;
      /** Its untapped creatures that stay home (they can block on the next turn). */
      readonly home: number;
      /** The opponents still in the game: their life, and the power their creatures could send next turn (`futureAttackers`). */
      readonly opponents: readonly OpponentRow[];
    }
  | {
      readonly kind: 'block';
      readonly turn: number;
      /** The defender. */
      readonly seat: SeatId;
      readonly life: number;
      readonly attackersAtMe: number;
      readonly blockers: number;
      readonly candidates: number;
      /** Damage of the attackers aimed at the defender that no creature blocked. */
      readonly unblocked: number;
      /** The part of `unblocked` that a creature left out of the blocks could have blocked. */
      readonly avoidable: number;
      /** The unblocked damage was at least the life: the defender is dead if nothing else intervenes. */
      readonly lethal: boolean;
    }
  | {
      readonly kind: 'removal';
      readonly turn: number;
      readonly seat: SeatId;
      readonly spell: string;
      /** The permanent targeted, or null (no object target). */
      readonly target: string | null;
      readonly targetOwner: SeatId | null;
      /** `threatValue` of the target at the default weights: the number the AI ranks removal targets by. */
      readonly targetValue: number;
      readonly targetToken: boolean;
      /** The seat the target was attacking when the spell was cast, or null when it was not attacking a player. */
      readonly attackingSeat: SeatId | null;
      /** The best `threatValue` among the opposing permanents at that moment. */
      readonly bestValue: number;
    }
  | {
      readonly kind: 'eliminated';
      readonly turn: number;
      readonly seat: SeatId;
      readonly cause: EliminationCause;
      readonly life: number;
      readonly poison: number;
      readonly commander: number;
      readonly library: number;
      /** The place the seat finishes in: 4 for the first of four to go, and so on. */
      readonly place: number;
    };

const asPlayer = (t: AttackTarget): SeatId | null => (t.kind === 'player' ? t.seat : null);

function attackEvent(step: ActionStep, view: GameView, action: Action): TableEvent | null {
  if (action.kind !== 'declareAttackers') return null;
  const decision = view.pending;
  const candidates = decision?.kind === 'declareAttackers' ? decision.candidates.length : 0;
  const groups = new Map<string, { seat: SeatId | null; attackers: number; power: number }>();
  let power = 0;
  for (const a of action.attacks) {
    const o = findObject(view, a.attacker);
    const hit = o === undefined ? 0 : hitDamage(o);
    power += hit;
    const seat = asPlayer(a.target);
    const key =
      seat === null ? `p:${a.target.kind === 'permanent' ? a.target.object : ''}` : `s:${seat}`;
    const g = groups.get(key) ?? { seat, attackers: 0, power: 0 };
    groups.set(key, { seat, attackers: g.attackers + 1, power: g.power + hit });
  }
  const going = new Set(action.attacks.map((a) => a.attacker));
  const home = view.battlefield.filter(
    (o) => o.controller === step.seat && isCreature(o) && !o.tapped && !going.has(o.id),
  ).length;
  const opponents = view.seats
    .filter((s) => s.id !== step.seat && !s.hasLost)
    .map((s) => ({
      seat: s.id,
      life: s.life,
      incoming: futureAttackers(view, s.id).reduce((n, o) => n + hitDamage(o), 0),
    }));
  return {
    kind: 'attack',
    turn: view.turn,
    seat: step.seat,
    attackers: action.attacks.length,
    candidates,
    power,
    allIn: action.attacks.length > 0 && action.attacks.length >= candidates,
    groups: [...groups.values()].map((g) => ({
      ...g,
      life: g.seat === null ? 0 : (view.seats.find((s) => s.id === g.seat)?.life ?? 0),
    })),
    life: view.seats.find((s) => s.id === step.seat)?.life ?? 0,
    home,
    opponents,
  };
}

function blockEvent(step: ActionStep, view: GameView, action: Action): TableEvent | null {
  const decision = view.pending;
  if (action.kind !== 'declareBlockers' || decision?.kind !== 'declareBlockers') return null;
  const me = step.seat;
  const used = new Set(action.blocks.map((b) => b.blocker));
  const blocked = new Set(action.blocks.map((b) => b.attacker));
  let unblocked = 0;
  let avoidable = 0;
  let atMe = 0;
  for (const a of decision.attackers) {
    if (a.target.kind !== 'player' || a.target.seat !== me) continue;
    atMe += 1;
    if (blocked.has(a.attacker)) continue;
    const o = findObject(view, a.attacker);
    const hit = o === undefined ? 0 : hitDamage(o);
    unblocked += hit;
    const free = decision.candidates.filter(
      (c) => !used.has(c.blocker) && c.canBlock.includes(a.attacker),
    );
    if (free.length >= a.minBlockers) avoidable += hit;
  }
  const life = view.seats.find((s) => s.id === me)?.life ?? 0;
  return {
    kind: 'block',
    turn: view.turn,
    seat: me,
    life,
    attackersAtMe: atMe,
    blockers: used.size,
    candidates: decision.candidates.length,
    unblocked,
    avoidable,
    lethal: unblocked >= life && unblocked > 0,
  };
}

function removalEvent(step: ActionStep, view: GameView, action: Action): TableEvent | null {
  const decision = view.pending;
  if (action.kind !== 'chooseTargets' || decision?.kind !== 'targets') return null;
  const source = view.stack.find((o) => o.id === decision.source);
  if (source === undefined || !isRemovalSpell(source)) return null;
  const chosen = action.targets.find((t) => t.kind === 'object');
  const target = chosen?.kind === 'object' ? findObject(view, chosen.id) : undefined;
  const attack = view.combat?.attackers.find((a) => a.object === target?.id);
  const opposing = view.battlefield.filter((o) => o.controller !== step.seat);
  return {
    kind: 'removal',
    turn: view.turn,
    seat: step.seat,
    spell: source.name,
    target: target?.name ?? null,
    targetOwner: target?.controller ?? null,
    targetValue: target === undefined ? 0 : threatValue(view, target, DEFAULT_WEIGHTS),
    targetToken: target?.isToken ?? false,
    attackingSeat: attack === undefined ? null : asPlayer(attack.target),
    bestValue: Math.max(0, ...opposing.map((o) => threatValue(view, o, DEFAULT_WEIGHTS))),
  };
}

/** The cause of an elimination, read from the view after it. */
function causeOf(view: GameView, seat: SeatId, action: Action, actor: SeatId): EliminationCause {
  const s = view.seats.find((x) => x.id === seat);
  if (action.kind === 'concede' && actor === seat) return 'concede';
  if (s === undefined) return 'other';
  if (s.poison >= POISON_LETHAL) return 'poison';
  if (commanderClock(view.commanderDamage, seat) >= COMMANDER_LETHAL) return 'commander';
  if (s.life <= 0) return 'life';
  if (s.libraryCount === 0) return 'decked';
  return 'other';
}

/** Turns the steps of one game into events and keeps the order the seats went out in. */
export class TableObserver {
  readonly events: TableEvent[] = [];
  /** Place of each seat that has been eliminated, by seat; the survivors have none yet. */
  private readonly places = new Map<SeatId, number>();
  private readonly seats: number;
  private starter: SeatId | null = null;

  constructor(seats: number) {
    this.seats = seats;
  }

  observe(step: ActionStep): void {
    const { before, after, seat, action } = step;
    // The engine draws the starting seat at random as the game is created (rules/setup.ts), so it is the active seat of the first state.
    this.starter ??= before.turn.activeSeat;
    const view = getView(before, seat);
    const made =
      attackEvent(step, view, action) ??
      blockEvent(step, view, action) ??
      removalEvent(step, view, action);
    if (made !== null) this.events.push(made);
    this.eliminations(before, after, step);
  }

  private eliminations(before: GameState, after: GameState, step: ActionStep): void {
    const out = after.seats.filter(
      (s) => s.hasLost && before.seats.find((b) => b.id === s.id)?.hasLost === false,
    );
    if (out.length === 0) return;
    const view = getView(after, step.seat);
    // Seats that go out together share the worst place still open.
    const place = this.seats - this.places.size;
    for (const s of out) {
      this.places.set(s.id, place);
      this.events.push({
        kind: 'eliminated',
        turn: after.turn.number,
        seat: s.id,
        cause: causeOf(view, s.id, step.action, step.seat),
        life: view.seats.find((x) => x.id === s.id)?.life ?? 0,
        poison: view.seats.find((x) => x.id === s.id)?.poison ?? 0,
        commander: commanderClock(view.commanderDamage, s.id),
        library: view.seats.find((x) => x.id === s.id)?.libraryCount ?? 0,
        place,
      });
    }
  }

  /** The seat that took the first turn (null until a step has been observed). */
  startingSeat(): SeatId | null {
    return this.starter;
  }

  /**
   * The place of each seat at the end of the game, by seat: the place it went out in, 1 for the winner,
   * and 1 shared for every survivor of a game without a winner (a cap or a draw).
   */
  placements(): number[] {
    return Array.from({ length: this.seats }, (_, seat) => this.places.get(seat) ?? 1);
  }
}
