/**
 * What the combat animation layer draws (issue 9, D-228), from the events the page already receives,
 * and when. Two pure steps:
 *
 * 1. `combatBeats` reads the steps of one snapshot and says what happens, in the order a player
 *    should see it: the attackers' hits, then the blockers' (and other damage), then what follows
 *    from them (life gained, life lost, poison), then the deaths. One beat is one thing on screen:
 *    "this recipient takes 4", "this seat gains 3", "this creature dies".
 * 2. `scheduleBeats` gives each beat a start time: beats start a stagger apart so each can be seen,
 *    a death waits for the hit that killed it to land, and the whole snapshot is capped, so a board
 *    wipe plays its last beats together instead of taking a minute. A speed factor scales every time.
 *
 * The layer (`CombatEffects.tsx`) measures the page and plays the animations. Everything here is
 * public (damage and deaths are announced to both players) and none of it depends on the game's pace.
 */
import type { GameView, ObjectId, SeatId } from '@commander-arena/engine';
import type { AppliedStep } from '../../game/protocol';

export type EffectTarget =
  | { readonly kind: 'object'; readonly id: ObjectId }
  | { readonly kind: 'player'; readonly seat: SeatId };

export type Beat =
  | {
      /** A recipient took damage: the attackers (or other sources) lunge, a burst, a number. */
      readonly kind: 'hit';
      readonly key: string;
      readonly to: EffectTarget;
      /** Damage, or poison counters for infect damage to a player (`poison`). */
      readonly amount: number;
      readonly poison: boolean;
      /** True when the recipient is a planeswalker: the number reads as loyalty lost. */
      readonly loyalty: boolean;
      /** The permanents that dealt it and lunge at it (combat damage only, at most `MAX_LUNGERS`). */
      readonly sources: readonly ObjectId[];
    }
  | { readonly kind: 'gain'; readonly key: string; readonly seat: SeatId; readonly amount: number }
  | { readonly kind: 'loss'; readonly key: string; readonly seat: SeatId; readonly amount: number }
  | {
      readonly kind: 'poison';
      readonly key: string;
      readonly seat: SeatId;
      readonly amount: number;
    }
  | { readonly kind: 'died'; readonly key: string; readonly id: ObjectId; readonly name: string };

/** A beat with its timing, in milliseconds from the snapshot, already scaled by the speed. */
export type PlannedBeat = Beat & {
  readonly start: number;
  readonly duration: number;
  /** When, after `start`, the blow lands (a hit), the number appears (the others), or the crack ends (a death). */
  readonly impact: number;
};

export interface Plan {
  readonly beats: readonly PlannedBeat[];
  /** When the last beat ends: how long the autopilot may be asked to wait. */
  readonly totalMs: number;
}

/** The most beats one snapshot draws: a board wipe must not put a hundred elements on the page. */
export const MAX_BEATS = 24;
/** How many attackers lunge at one recipient. */
export const MAX_LUNGERS = 4;

/** Timing at Normal speed, in milliseconds. */
export const TIMING = {
  /** A hit with a lunge: wind up, strike, impact at `impact`, number lingers until `duration`. */
  hitLunge: { duration: 1800, impact: 500 },
  /** A hit with no attacker to show (a spell, a trigger): a short anticipation. */
  hit: { duration: 1500, impact: 200 },
  /** A number on a player or a counter change that follows a hit. */
  after: { duration: 1400, impact: 150 },
  /** A death: crack for the first quarter, then dissolve. */
  died: { duration: 2000, impact: 500 },
  /** Between the starts of two beats in a row. */
  stagger: 450,
  /** A death starts this long after the blow that killed the creature lands. */
  deathLag: 250,
  /** The whole snapshot ends by here: later beats start together. */
  cap: 4000,
} as const;

const targetKey = (t: EffectTarget): string => (t.kind === 'player' ? `p${t.seat}` : t.id);

/** Order of the beats of one step: attackers' hits, other hits, what follows, deaths. */
const GROUP = { attackerHit: 0, otherHit: 1, after: 2, died: 3 } as const;

interface Ordered {
  readonly step: number;
  readonly group: number;
  readonly beat: Beat;
}

/** Whether `id` was attacking in `before` (or is the active player's, when combat was not yet shown). */
function attacked(before: GameView | null, id: ObjectId): boolean {
  if (before === null) return false;
  if (before.combat?.attackers.some((a) => a.object === id)) return true;
  if (before.combat !== null && before.combat.attackers.length > 0) return false;
  return before.battlefield.find((o) => o.id === id)?.controller === before.activeSeat;
}

/**
 * The beats of the steps of one snapshot, in the order they should play. Damage dealt to the same
 * recipient inside one step is added into one beat (three attackers hitting a player show one
 * number, and all three lunge); damage of 0 shows nothing. Life gained, life lost and poison are
 * shown only in a step that dealt damage (lifelink, infect and the like): paying life for a land is
 * not combat. A permanent that died is named from `before`, the view the page had before these
 * steps; one that is not there (it came and died in the same snapshot) is left out.
 */
export function combatBeats(
  steps: readonly AppliedStep[],
  before: GameView | null,
): readonly Beat[] {
  const out: Ordered[] = [];
  steps.forEach((step, index) => {
    const damage = new Map<
      string,
      { to: EffectTarget; amount: number; sources: ObjectId[]; combat: boolean }
    >();
    const gain = new Map<SeatId, number>();
    const lost = new Map<SeatId, number>();
    const poisoned = new Map<SeatId, number>();
    for (const event of step.events) {
      if (event.kind === 'damageDealt' && event.amount > 0) {
        const key = targetKey(event.to);
        const entry = damage.get(key) ?? { to: event.to, amount: 0, sources: [], combat: false };
        entry.amount += event.amount;
        if (event.combat) {
          entry.combat = true;
          if (!entry.sources.includes(event.source)) entry.sources.push(event.source);
        }
        damage.set(key, entry);
      } else if (event.kind === 'lifeGained' && event.amount > 0) {
        gain.set(event.seat, (gain.get(event.seat) ?? 0) + event.amount);
      } else if (event.kind === 'lifeChanged' && event.to < event.from) {
        lost.set(event.seat, (lost.get(event.seat) ?? 0) + event.from - event.to);
      } else if (event.kind === 'poisonChanged' && event.to > event.from) {
        poisoned.set(event.seat, (poisoned.get(event.seat) ?? 0) + event.to - event.from);
      } else if (event.kind === 'died') {
        const name = before?.battlefield.find((o) => o.id === event.object)?.name;
        if (name !== undefined) {
          out.push({
            step: index,
            group: GROUP.died,
            beat: { kind: 'died', key: `d${index}-${event.object}`, id: event.object, name },
          });
        }
      }
    }
    for (const [key, entry] of damage) {
      const seat = entry.to.kind === 'player' ? entry.to.seat : null;
      // Infect: damage to a player that put poison counters on them and took no life (CR 120.3b).
      const poison = seat !== null && (lost.get(seat) ?? 0) === 0 && (poisoned.get(seat) ?? 0) > 0;
      const target = entry.to;
      const asLoyalty =
        target.kind === 'object' &&
        before?.battlefield.find((o) => o.id === target.id)?.types.includes('planeswalker') ===
          true;
      const sources = entry.sources.slice(0, MAX_LUNGERS);
      let amount = entry.amount;
      if (seat !== null) {
        if (poison) {
          amount = poisoned.get(seat) ?? 0;
          poisoned.set(seat, 0);
        } else {
          // Life lost that the damage does not explain (a trigger that came with it) is its own beat.
          lost.set(seat, Math.max(0, (lost.get(seat) ?? 0) - entry.amount));
        }
      }
      out.push({
        step: index,
        group:
          sources.length > 0 && sources.every((s) => attacked(before, s))
            ? GROUP.attackerHit
            : GROUP.otherHit,
        beat: {
          kind: 'hit',
          key: `h${index}-${key}`,
          to: entry.to,
          amount,
          poison,
          loyalty: asLoyalty,
          sources,
        },
      });
    }
    // What follows damage; nothing of it is shown in a step without damage.
    if (damage.size > 0) {
      for (const [seat, amount] of gain) {
        out.push({
          step: index,
          group: GROUP.after,
          beat: { kind: 'gain', key: `g${index}-${seat}`, seat, amount },
        });
      }
      for (const [seat, amount] of lost) {
        if (amount > 0) {
          out.push({
            step: index,
            group: GROUP.after,
            beat: { kind: 'loss', key: `l${index}-${seat}`, seat, amount },
          });
        }
      }
      for (const [seat, amount] of poisoned) {
        if (amount > 0) {
          out.push({
            step: index,
            group: GROUP.after,
            beat: { kind: 'poison', key: `x${index}-${seat}`, seat, amount },
          });
        }
      }
    }
  });
  out.sort((a, b) => a.step - b.step || a.group - b.group);
  return out.slice(0, MAX_BEATS).map((o) => o.beat);
}

const timingOf = (beat: Beat): { duration: number; impact: number } =>
  beat.kind === 'died'
    ? TIMING.died
    : beat.kind === 'hit'
      ? beat.sources.length > 0
        ? TIMING.hitLunge
        : TIMING.hit
      : TIMING.after;

/**
 * Starts for `beats`, in the order given. `scale` is the speed (1 Normal, 0.5 Fast, 1.5 Slow) and
 * multiplies every time, the cap included. Beats start `stagger` apart; a death starts after the hit
 * on the same permanent lands (or after its own turn in the queue, whichever is later); no beat
 * starts so late that it would end after the cap, so the tail of a big combat plays together. The
 * one exception is a death that must wait for its killing blow: it may end a little after the cap.
 */
export function scheduleBeats(beats: readonly Beat[], scale: number): Plan {
  const cap = TIMING.cap * scale;
  const landed = new Map<string, number>();
  const planned: PlannedBeat[] = [];
  beats.forEach((beat, index) => {
    const { duration, impact } = timingOf(beat);
    // No beat starts so late that it would end after the cap: the tail of a long queue plays together.
    let start = Math.max(0, Math.min(index * TIMING.stagger * scale, cap - duration * scale));
    // A death never starts before the blow that killed the creature has landed, even past the cap.
    const blow = beat.kind === 'died' ? landed.get(beat.id) : undefined;
    if (blow !== undefined) start = Math.max(start, blow + TIMING.deathLag * scale);
    const entry = {
      ...beat,
      start: Math.round(start),
      duration: Math.round(duration * scale),
      impact: Math.round(impact * scale),
    };
    if (beat.kind === 'hit' && beat.to.kind === 'object') {
      landed.set(beat.to.id, entry.start + entry.impact);
    }
    planned.push(entry);
  });
  const totalMs = planned.reduce((end, b) => Math.max(end, b.start + b.duration), 0);
  return { beats: planned, totalMs };
}

/** The plan of one snapshot at the speed `scale`. */
export function planCombat(
  steps: readonly AppliedStep[],
  before: GameView | null,
  scale: number,
): Plan {
  return scheduleBeats(combatBeats(steps, before), scale);
}
