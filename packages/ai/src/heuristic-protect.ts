/**
 * Protection spells of the HeuristicAgent: "Target permanent you control gains hexproof and indestructible
 * until end of turn" and the like (a helpful instant that keeps a permanent of the agent's from a spell or
 * ability).
 *
 * WHEN: in response to an opponent's spell or ability on the stack that names a permanent of the agent's
 * as a target. Each protection play is cast on the sample, and the stack resolves; the best is cast when it
 * beats passing by `protection.margin` (the removal fizzles on the sample, so the permanent is still there).
 *
 * WHO: `protectedTarget` picks the permanent to protect: one that an opponent's object on the stack names,
 * the commander first, then the most valuable; with no threat, the most valuable permanent that is not a
 * land. A land is the choice only when it is all that is legal.
 *
 * The numbers named `protection.*` are fields of `AgentWeights` (`weights.ts`).
 */
import type {
  Action,
  ChosenTarget,
  GameView,
  ObjectView,
  PayManaDecision,
} from '@commander-arena/engine';
import { isHelpfulSpell } from './casual-helpful';
import { type Play, spendOf } from './casual-priority';
import { findObject, isCreature, isLand, withoutReminder } from './casual-view';
import { creatureValue } from './evaluate';
import type { Think } from './heuristic-budget';
import { type Answer, scoreCast } from './heuristic-delta';
import { canPayAll, costSymbols, type Unit, unitsOf } from './heuristic-mana';
import type { AgentWeights } from './weights';

const PROTECTS = /hexproof|indestructible|shroud|protection from|regenerat|phase out/i;

/** An instant that protects its target. */
export const isProtectionSpell = (o: ObjectView): boolean =>
  isHelpfulSpell(o) && PROTECTS.test(withoutReminder(o.oracleText));

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const worthOf = (o: ObjectView, weights: AgentWeights): number =>
  (isCreature(o)
    ? creatureValue({ ...o, power: o.power ?? 0, toughness: o.toughness ?? 0 }, weights)
    : weights.protection.permanentValue) + (o.isCommander ? weights.protection.commanderBonus : 0);

/** The permanents of the agent's that an opponent's object on the stack names as a target. */
export function threatened(view: GameView): ObjectView[] {
  const ids = new Set<string>();
  for (const o of view.stack) {
    if (o.controller === view.viewer) continue;
    for (const t of o.targets) if (t.kind === 'object') ids.add(t.id);
  }
  return view.battlefield.filter((o) => o.controller === view.viewer && ids.has(o.id));
}

/** The permanent among `legal` that a protection spell goes on, or null when none of them is the agent's. */
export function protectedTarget(
  view: GameView,
  legal: readonly ChosenTarget[],
  weights: AgentWeights,
): ChosenTarget | null {
  const mine = legal.flatMap((t) => {
    const o = t.kind === 'object' ? findObject(view, t.id) : undefined;
    return o !== undefined && o.controller === view.viewer ? [{ t, o }] : [];
  });
  const threats = new Set(threatened(view).map((o) => o.id));
  const rank = (x: { o: ObjectView }): number =>
    (threats.has(x.o.id) ? 1000 : 0) + (isLand(x.o) ? -100 : 0) + worthOf(x.o, weights);
  const best = [...mine].sort((a, b) => rank(b) - rank(a) || byId(a.o.id, b.o.id))[0];
  return best?.t ?? null;
}

/** The protection play to make in response to the opponent's object on top of the stack, or null. */
export function protectionPlay(
  view: GameView,
  plays: readonly Play[],
  think: Think,
  answer: Answer,
  castAction: (p: Play) => Action,
): Play | null {
  const top = view.stack[view.stack.length - 1];
  if (top === undefined || top.controller === view.viewer) return null;
  if (threatened(view).length === 0) return null;
  const candidates = plays
    .filter((p) => isProtectionSpell(p.obj))
    .sort((a, b) => (a.obj.manaCost?.length ?? 0) - (b.obj.manaCost?.length ?? 0))
    .slice(0, 3);
  if (candidates.length === 0) return null;
  const sample = think.sample();
  if (sample === undefined || sample.pending?.kind !== 'priority') return null;
  const search = think.budget.search();
  const base = scoreCast(sample, view.viewer, null, answer, think);
  if (base === null) return null;
  let best: { play: Play; score: number } | undefined;
  for (const [i, play] of candidates.entries()) {
    if (search.expired(i + 1) !== null) break;
    const score = scoreCast(sample, view.viewer, castAction(play), answer, think);
    if (
      score !== null &&
      score > base + think.weights.protection.margin &&
      (best === undefined || score > best.score)
    ) {
      best = { play, score };
    }
  }
  return best?.play ?? null;
}

/** The text of a mana source that the estimate of `unitsOf` does not read (a restriction, a cost, damage). */
const RESTRICTED = /spend this mana only|damage|\blife\b|sacrifice|unless/i;
/** The most mana sources the payment that holds mana open searches among (2^n subsets). */
const MAX_SOURCES = 10;

/** Whether the agent has a permanent worth holding protection mana for: its commander, or a creature worth `protection.saveValue`. */
export const hasPermanentWorthSaving = (view: GameView, weights: AgentWeights): boolean =>
  view.battlefield.some(
    (o) =>
      o.controller === view.viewer &&
      (o.isCommander === true ||
        (isCreature(o) &&
          creatureValue({ ...o, power: o.power ?? 0, toughness: o.toughness ?? 0 }, weights) >=
            weights.protection.saveValue)),
  );

/**
 * The mana symbols to hold open this turn for a protection spell of the hand, or null: the cheapest
 * protection play, when a permanent worth saving is on the battlefield. The caller keeps the hold only when
 * it costs no mana the turn would otherwise spend (the set it chooses with the hold uses as much).
 */
export function protectionReserve(
  view: GameView,
  plays: readonly Play[],
  weights: AgentWeights,
): readonly string[] | null {
  if (!hasPermanentWorthSaving(view, weights)) return null;
  const cheapest = plays
    .filter((p) => isProtectionSpell(p.obj) && p.free !== true && p.alt === undefined)
    .sort((a, b) => spendOf(a) - spendOf(b) || byId(a.obj.id, b.obj.id))[0];
  return cheapest === undefined ? null : costSymbols(cheapest.obj, spendOf(cheapest));
}

/**
 * Pays `d` by hand with the fewest plain mana sources that pay it and leave the others able to pay `hold`,
 * or null when no such choice exists (the caller then pays automatically). A plain source is a permanent
 * with one mana ability and no choice to make (a basic land, a mana rock); the automatic payment taps any
 * source, so the land a protection spell needs could be the one it taps.
 */
export function payHolding(
  view: GameView,
  d: PayManaDecision,
  hold: readonly string[],
): Action | null {
  if (d.purpose !== undefined) return null;
  const count = new Map<string, number>();
  for (const s of d.manaSources) count.set(s.object, (count.get(s.object) ?? 0) + 1);
  const plain: { source: PayManaDecision['manaSources'][number]; units: Unit[] }[] = [];
  const others: Unit[] = [];
  for (const source of d.manaSources) {
    const o = view.battlefield.find((x) => x.id === source.object);
    // A source with a restriction on its mana or a cost beyond tapping is left to the automatic payment: the estimate of
    // `unitsOf` does not read it (a "Spend this mana only to cast ..." source paid a cost it cannot pay).
    if (o !== undefined && RESTRICTED.test(o.oracleText)) continue;
    const units = o === undefined ? [] : unitsOf(o);
    const simple =
      source.colors === undefined &&
      source.combinations === undefined &&
      source.extraColors === undefined &&
      source.sacrifices === undefined &&
      source.tappables === undefined &&
      count.get(source.object) === 1 &&
      units.length > 0;
    if (simple) plain.push({ source, units });
    else others.push(...units);
  }
  if (plain.length === 0 || plain.length > MAX_SOURCES) return null;
  const masks = Array.from({ length: 1 << plain.length }, (_, m) => m)
    .filter((m) => m > 0)
    .sort((a, b) => bits(a) - bits(b) || a - b);
  for (const mask of masks) {
    const taken = plain.filter((_, i) => (mask & (1 << i)) !== 0);
    const left = plain.filter((_, i) => (mask & (1 << i)) === 0);
    if (
      !canPayAll(
        [d.totalCost],
        taken.flatMap((t) => t.units),
      )
    )
      continue;
    if (!canPayAll([hold], [...left.flatMap((t) => t.units), ...others])) continue;
    return {
      kind: 'payManual',
      taps: taken.map((t) => ({ object: t.source.object, abilityIndex: t.source.abilityIndex })),
    };
  }
  return null;
}

const bits = (n: number): number => {
  let c = 0;
  for (let x = n; x > 0; x >>= 1) c += x & 1;
  return c;
};
