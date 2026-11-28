/**
 * The candidate lines of the turn planner (issue 624, phase 3), best guess first. Every line is built from
 * rules the agent already has, so every candidate is a move it would already consider sensible:
 *
 * In a main phase (`mainLines`):
 *  1. TODAY: today's choice now (`choosePriorityHeuristic`), then today's rules for the rest of the turn.
 *     Always first, so the planner never does worse on its own scoring than today's line.
 *  2. NEXT-BEST SETS: the next payable sets of the same search (`topSets`), in today's order, then today's rules.
 *  3. HOLD: for each instant-speed card in hand, the best set that leaves its cost payable; nothing else is
 *     cast this turn, so its mana stays open through the opponents' turns (removal is cast at their attack).
 *  4. AFTER COMBAT (first main phase only, with a creature that could attack): today's set with its creatures
 *     that lack haste moved to the second main phase.
 *  5. ABILITIES: today's set, then the mana left goes to an activated ability: at the opponent's end step
 *     (repeated while it is payable), after blockers (a creature's ability: once, or while payable), or now
 *     (once, or while payable). The abilities are the best of their ranking (`heuristic-activations.ts`) and
 *     the commander's; the lines of the best one, when it scored better than passing, come right after
 *     today's, ahead of the next-best sets, so the work budget does not cut them. An ability that may be
 *     activated only at sorcery timing (CR 602.5d, 606.3) gets no end-step or after-blockers line.
 *  6. DO NOTHING: pass with everything open (the end-step rules may still use it).
 *
 * In a window (`windowLines`: after blockers, the opponent's end step): today's choice, the best abilities of
 * the ranking once or while payable, and passing.
 */
import type { Action, GameView, ObjectView, PriorityDecision } from '@commander-arena/engine';
import { type Play, spellPlays } from './casual-priority';
import { hasKeyword, isLand, manaValueOf } from './casual-view';
import {
  type Activation,
  keepTop,
  type RankedActivation,
  sorceryOnly,
  taps,
  unranked,
} from './heuristic-activations';
import { canPayAll, ownUnits } from './heuristic-mana';
import type { Line, Window } from './heuristic-plan-sim';
import {
  castAction,
  isInstantSpeed,
  mainPlays,
  order,
  topSets,
  withCommanderRule,
} from './heuristic-sets';
import { isRemovalSpell } from './heuristic-targets';
import type { AgentWeights } from './weights';

/** Bounds of the candidate list (not weights): sets, held cards and abilities tried. */
const MORE_SETS = 3;
const HOLDS = 2;
const ABILITIES = 2;
/** "While payable": an ability is repeated at most this often in one line. */
const REPEAT = 3;

const line = (
  label: string,
  acts: Line['acts'],
  rest: Line['rest'] = {},
  extra: Partial<Pick<Line, 'holdRemoval' | 'reserve'>> = {},
): Line => ({
  label,
  acts,
  rest,
  holdRemoval: extra.holdRemoval ?? [],
  reserve: extra.reserve ?? null,
});

const times = (a: Action, n: number): Action[] => Array.from({ length: n }, () => a);

const costOf = (o: ObjectView): readonly string[] => o.castCost ?? o.manaCost ?? [];

/** The lines of a main phase (`now` is 'main1' or 'main2'); `today` is today's choice for this decision. */
export function mainLines(
  view: GameView,
  d: PriorityDecision,
  now: Window,
  today: { action: Action; reserve?: readonly string[] },
  activations: Set<string>,
  weights: AgentWeights,
  /** The agent's own activations, best first (`rankActivations`); unranked when left out. */
  ranked?: readonly RankedActivation[],
): Line[] {
  const later: Window | null = now === 'main1' ? 'main2' : null;
  const lines: Line[] = [
    line('today', { [now]: [today.action] }, {}, { reserve: today.reserve ?? null }),
  ];
  const units = ownUnits(view);
  const castable = spellPlays(view, d, activations);
  const plays = withCommanderRule(view, mainPlays(view, castable, weights), units, weights);
  const sets = topSets(view, plays, units, weights, null, MORE_SETS + 1);
  const best = sets[0] ?? [];
  const casts = (set: readonly Play[]): Action[] => order(view, set, weights).map(castAction);
  const quiet: Line['rest'] =
    later === null ? { [now]: 'pass' } : { [now]: 'pass', [later]: 'pass' };
  // 5. Abilities with the mana today's set leaves (built here, pushed in two parts).
  const base = casts(best);
  // An ability's lines, the latest use first: on a tie the planner keeps the earlier line, so a pump waits
  // for the blockers rather than being spent before them.
  const abilityLines = (a: Activation): Line[] => {
    const id = `${a.object}#${a.abilityIndex}`;
    const most = taps(view, a) ? 1 : REPEAT;
    const out: Line[] = [];
    if (!sorceryOnly(view, a)) {
      out.push(line(`end:${id}`, { [now]: base, theirEnd: times(a, most) }, quiet));
      const creature = view.battlefield.some(
        (o) => o.id === a.object && o.types.includes('creature'),
      );
      if (creature && now === 'main1') {
        out.push(line(`blocks:${id}`, { [now]: base, afterBlocks: [a] }, { [now]: 'pass' }));
        if (most > 1) {
          out.push(
            line(`blocks*:${id}`, { [now]: base, afterBlocks: times(a, most) }, { [now]: 'pass' }),
          );
        }
      }
    }
    out.push(line(`now:${id}`, { [now]: [...base, a] }, { [now]: 'pass' }));
    if (most > 1) {
      out.push(line(`now*:${id}`, { [now]: [...base, ...times(a, most)] }, { [now]: 'pass' }));
    }
    return out;
  };
  const [top, ...more] = keepTop(ranked ?? unranked(view, d), ABILITIES);
  // The best ability's lines come first when it scored better than passing on the sample.
  const late: Line[] = [];
  if (top !== undefined) {
    const early = top.gain !== null && top.gain > 0;
    (early ? lines : late).push(...abilityLines(top.action));
  }
  for (const r of more) late.push(...abilityLines(r.action));
  // 2. The next-best sets.
  for (const [i, set] of sets.slice(1).entries()) {
    lines.push(line(`set${i + 2}`, { [now]: casts(set) }));
  }
  // 3. Hold lines: the cost of an instant-speed card in hand stays payable all turn. The hand is read, not
  // the options: a counterspell is not listed while nothing is on the stack to counter.
  const hand = view.seats.find((s) => s.id === view.viewer)?.hand ?? [];
  const instants = hand
    .filter((o) => !isLand(o) && isInstantSpeed(o) && canPayAll([costOf(o)], units))
    .sort((a, b) => manaValueOf(b) - manaValueOf(a) || (a.id < b.id ? -1 : 1))
    .slice(0, HOLDS);
  for (const card of instants) {
    const held = { obj: card };
    const hold = costOf(card);
    const others = plays.filter((p) => p.obj.id !== held.obj.id);
    const set = topSets(view, others, units, weights, hold, 1)[0] ?? [];
    lines.push(
      line(`hold:${held.obj.name}`, { [now]: casts(set) }, quiet, {
        reserve: hold,
        holdRemoval: isRemovalSpell(held.obj) ? [held.obj.id] : [],
      }),
    );
  }
  // 4. After combat: the creatures that cannot help this combat wait for the second main phase.
  const attacker = view.battlefield.some(
    (o) =>
      o.controller === view.viewer && o.types.includes('creature') && !o.tapped && !o.summoningSick,
  );
  if (later !== null && attacker) {
    const slow = best.filter(
      (p) => p.obj.types.includes('creature') && !hasKeyword(p.obj, 'haste'),
    );
    if (slow.length > 0) {
      const fast = best.filter((p) => !slow.includes(p));
      lines.push(
        line('after-combat', { [now]: casts(fast), [later]: casts(slow) }, { [now]: 'pass' }),
      );
    }
  }
  lines.push(...late);
  // 6. Do nothing.
  lines.push(line('nothing', {}, quiet));
  return dedupe(lines);
}

/** Drops lines that are the same as an earlier one (the same actions and rests). */
function dedupe(lines: readonly Line[]): Line[] {
  const seen = new Set<string>();
  return lines.filter((l) => {
    const k = JSON.stringify([l.acts, l.rest, l.holdRemoval, l.reserve]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The lines of a window (after blockers, the opponent's end step), with today's choice first. */
export function windowLines(
  view: GameView,
  d: PriorityDecision,
  now: Window,
  today: Action,
  /** The agent's own activations, best first (`rankActivations`); unranked when left out. */
  ranked?: readonly RankedActivation[],
): Line[] {
  const lines: Line[] = [line('today', { [now]: [today] })];
  for (const { action: a } of keepTop(ranked ?? unranked(view, d), ABILITIES + 1)) {
    const id = `${a.object}#${a.abilityIndex}`;
    lines.push(line(`once:${id}`, { [now]: [a] }, { [now]: 'pass' }));
    if (!taps(view, a)) {
      lines.push(line(`twice:${id}`, { [now]: times(a, 2) }, { [now]: 'pass' }));
      lines.push(line(`all:${id}`, { [now]: times(a, REPEAT) }, { [now]: 'pass' }));
    }
  }
  lines.push(line('nothing', {}, { [now]: 'pass' }));
  return dedupe(lines);
}
