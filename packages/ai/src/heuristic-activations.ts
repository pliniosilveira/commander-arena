/**
 * The activated abilities of the HeuristicAgent's own permanents, ranked (issue 624). The turn planner can
 * score only a few ability lines within a decision's work budget (`heuristic-plan-lines.ts`), so which
 * abilities get a line decides whether the agent ever uses them. Every ability the engine lists now is
 * activated once on the determinized sample and played out to the start of the next turn with everyone
 * passing (`scoreCast`, the same cheap measure the vetting of today's plays uses); its GAIN is that score
 * less passing's. The planner then tries the best first, and the commander's abilities always.
 *
 * Order: the scored abilities by gain (best first), then the ones the budget did not reach; ties, and
 * everything without a sample, go by the order the objects were created in and the ability's index, never by
 * the text of the id ("o105" before "o23"). The measure is honest about what it misses: a pump or a tapper
 * matters in a combat the pass-out does not play, so a low gain only ranks an ability later, it never drops it.
 *
 * When nothing else is played, at the opponent's end step before the agent's turn or in its main phases, the
 * best ability whose gain beats `main.trickMargin` is today's choice (`heuristic-main.ts`): spare mana is used
 * even when no planning runs, or when the planning is cut before it reaches the ability lines.
 */
import type { Action, GameView, ObjectId, PriorityDecision } from '@commander-arena/engine';
import type { Think } from './heuristic-budget';
import { type Answer, scoreCast } from './heuristic-delta';

export type Activation = Extract<Action, { kind: 'activate' }>;

export interface RankedActivation {
  readonly action: Activation;
  /** The score of activating it on the sample less passing's; null when it was not scored. */
  readonly gain: number | null;
  /** Whether it is an ability of one of the agent's commanders. */
  readonly commander: boolean;
}

/** Creation order of two object ids (`o<number>`): the shorter number is the older object. */
export const idOrder = (a: ObjectId, b: ObjectId): number =>
  a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

const byKey = (a: Activation, b: Activation): number =>
  idOrder(a.object, b.object) || a.abilityIndex - b.abilityIndex;

/** The activated abilities of the agent's own permanents that the engine lists now, in creation order. */
export function ownActivations(view: GameView, d: PriorityDecision): Activation[] {
  return d.options
    .filter((o): o is Activation => o.kind === 'activate')
    .filter((o) => view.battlefield.some((p) => p.id === o.object && p.controller === view.viewer))
    .map((o) => ({ kind: 'activate' as const, object: o.object, abilityIndex: o.abilityIndex }))
    .sort(byKey);
}

const isCommanderAbility = (view: GameView, a: Activation): boolean =>
  view.battlefield.some((o) => o.id === a.object && o.isCommander === true);

/** The own activations unscored, in creation order (no sample, or a host that gives none). */
export function unranked(view: GameView, d: PriorityDecision): RankedActivation[] {
  return ownActivations(view, d).map((action) => ({
    action,
    gain: null,
    commander: isCommanderAbility(view, action),
  }));
}

/** The own activations ranked by their gain on the sample (see the module comment). */
export function rankActivations(
  view: GameView,
  d: PriorityDecision,
  think: Think,
  answer: Answer,
): RankedActivation[] {
  const all = unranked(view, d);
  if (all.length === 0) return all;
  const sample = think.sample();
  if (sample === undefined || sample.pending?.kind !== 'priority') return all;
  if (sample.pending.seat !== view.viewer) return all;
  const search = think.budget.search();
  const base = scoreCast(sample, view.viewer, null, answer, think);
  if (base === null) return all;
  const scored = all.map((r, i) => {
    if (search.expired(i + 1) !== null) return r;
    const score = scoreCast(sample, view.viewer, r.action, answer, think);
    return score === null ? r : { ...r, gain: score - base };
  });
  return scored.sort(
    (a, b) =>
      (a.gain === null ? 1 : 0) - (b.gain === null ? 1 : 0) ||
      (b.gain ?? 0) - (a.gain ?? 0) ||
      byKey(a.action, b.action),
  );
}

/** The first `n` of a ranking, and every commander ability after them (the commander's are always kept). */
export function keepTop(ranked: readonly RankedActivation[], n: number): RankedActivation[] {
  return ranked.filter((r, i) => i < n || r.commander);
}
