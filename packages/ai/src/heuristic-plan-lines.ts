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
 *     (repeated while it is payable), after blockers (a creature's ability: once, or while payable), or now.
 *  6. DO NOTHING: pass with everything open (the end-step rules may still use it).
 *
 * In a window (`windowLines`: after blockers, the opponent's end step): today's choice, each ability once or
 * while payable, and passing.
 */
import type { Action, GameView, ObjectView, PriorityDecision } from '@commander-arena/engine';
import { type Play, spellPlays } from './casual-priority';
import { hasKeyword, isLand, manaValueOf } from './casual-view';
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

type Activation = Extract<Action, { kind: 'activate' }>;

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

/** The activated abilities of the agent's own permanents that the engine lists now, by object id. */
export function ownActivations(view: GameView, d: PriorityDecision): Activation[] {
  return d.options
    .filter((o): o is Activation => o.kind === 'activate')
    .filter((o) => view.battlefield.some((p) => p.id === o.object && p.controller === view.viewer))
    .map((o) => ({ kind: 'activate' as const, object: o.object, abilityIndex: o.abilityIndex }))
    .sort((a, b) =>
      a.object < b.object ? -1 : a.object > b.object ? 1 : a.abilityIndex - b.abilityIndex,
    );
}

const costOf = (o: ObjectView): readonly string[] => o.castCost ?? o.manaCost ?? [];

/** Whether an ability taps its permanent (it can be activated once until the permanent untaps). */
const taps = (view: GameView, a: Activation): boolean =>
  view.battlefield
    .find((o) => o.id === a.object)
    ?.activated?.find((x) => x.abilityIndex === a.abilityIndex)
    ?.ability.cost.some((c) => c.kind === 'tap') === true;

/** The lines of a main phase (`now` is 'main1' or 'main2'); `today` is today's choice for this decision. */
export function mainLines(
  view: GameView,
  d: PriorityDecision,
  now: Window,
  today: { action: Action; reserve?: readonly string[] },
  activations: Set<string>,
  weights: AgentWeights,
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
    const rest: Line['rest'] =
      later === null ? { [now]: 'pass' } : { [now]: 'pass', [later]: 'pass' };
    lines.push(
      line(`hold:${held.obj.name}`, { [now]: casts(set) }, rest, {
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
  // 5. Abilities with the mana today's set leaves.
  const base = casts(best);
  for (const a of ownActivations(view, d).slice(0, ABILITIES)) {
    const id = `${a.object}#${a.abilityIndex}`;
    const creature = view.battlefield.some(
      (o) => o.id === a.object && o.types.includes('creature'),
    );
    const quiet: Line['rest'] =
      later === null ? { [now]: 'pass' } : { [now]: 'pass', [later]: 'pass' };
    const most = taps(view, a) ? 1 : REPEAT;
    lines.push(line(`end:${id}`, { [now]: base, theirEnd: times(a, most) }, quiet));
    if (creature && now === 'main1') {
      lines.push(line(`blocks:${id}`, { [now]: base, afterBlocks: [a] }, { [now]: 'pass' }));
      if (most > 1) {
        lines.push(
          line(`blocks*:${id}`, { [now]: base, afterBlocks: times(a, most) }, { [now]: 'pass' }),
        );
      }
    }
    lines.push(line(`now:${id}`, { [now]: [...base, a] }, { [now]: 'pass' }));
  }
  // 6. Do nothing.
  lines.push(
    line('nothing', {}, later === null ? { [now]: 'pass' } : { [now]: 'pass', [later]: 'pass' }),
  );
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
): Line[] {
  const lines: Line[] = [line('today', { [now]: [today] })];
  for (const a of ownActivations(view, d).slice(0, ABILITIES + 1)) {
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
