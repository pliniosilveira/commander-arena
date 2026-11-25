/**
 * The sets of spells of the HeuristicAgent's main phase (M7c, D-163), shared by `heuristic-main.ts` (the
 * set it casts today) and the turn planner (`heuristic-plan-lines.ts`, the next-best sets and the hold
 * lines): what a play is worth, the sets that use the most mana and are payable, their order, the
 * commander-tax rule and the plays made at sorcery timing. The rules are in the module comment of
 * `heuristic-main.ts`.
 */
import type { Action, GameView, ObjectView } from '@commander-arena/engine';
import { hasStorm } from './casual-copies';
import { discountsHand } from './casual-costs';
import { grantsLandDrops } from './casual-play-rules';
import { type Play, spendOf, withFace, withType } from './casual-priority';
import { hasKeyword, manaValueOf, withoutReminder } from './casual-view';
import { creatureValue, evaluate } from './evaluate';
import { canPayAll, costSymbols, type ownUnits } from './heuristic-mana';
import { bestRemovalTarget, isRemovalSpell } from './heuristic-targets';
import type { AgentWeights } from './weights';

/** The most plays a set is chosen among (2^n subsets; a bound of the search, not a weight). */
const MAX_PLAYS = 9;

const TARGETS_SPELL = /target (activated or triggered ability|(\w+ )?spell)/i;

export const isInstantSpeed = (o: ObjectView): boolean =>
  o.types.includes('instant') || hasKeyword(o, 'flash');
export const isCounter = (o: ObjectView): boolean =>
  isInstantSpeed(o) && TARGETS_SPELL.test(withoutReminder(o.oracleText));

export const castAction = (p: Play): Action => ({
  kind: 'castSpell',
  object: p.obj.id,
  ...(p.free === true ? { alternative: 'free' as const } : {}),
  ...(p.alt === undefined ? {} : { alternative: p.alt }),
  ...(p.lifeForMana === true ? { alternative: 'lifeForMana' as const } : {}),
  ...withFace(p.face),
  ...withType(p),
});

export const sym = (p: Play): readonly string[] =>
  p.free === true ? [] : costSymbols(p.obj, spendOf(p));

/** What a play is worth, for choosing between sets that spend the same mana. */
export function worthOf(view: GameView, p: Play, weights: AgentWeights): number {
  const o = p.obj;
  const w = weights.main;
  if (o.types.includes('creature')) {
    return (
      creatureValue({ ...o, power: o.power ?? 0, toughness: o.toughness ?? 0 }, weights) +
      (o.isCommander ? w.commanderBonus : 0)
    );
  }
  if (isRemovalSpell(o)) return w.removalShare * (bestRemovalTarget(view, o, weights)?.value ?? 0);
  return w.spellBase + w.spellPerMana * manaValueOf(o);
}

/** The `count` best sets of `plays` payable with `units`: the most mana first, the most value among equals. */
export function topSets(
  view: GameView,
  plays: readonly Play[],
  units: ReturnType<typeof ownUnits>,
  weights: AgentWeights,
  /** Mana symbols that must stay payable besides the set (a card held open). */
  hold: readonly string[] | null,
  count: number,
): Play[][] {
  const pool = [...plays]
    .sort(
      (a, b) =>
        worthOf(view, b, weights) - worthOf(view, a, weights) || (a.obj.id < b.obj.id ? -1 : 1),
    )
    .slice(0, MAX_PLAYS);
  const found: { set: Play[]; spend: number; value: number }[] = [];
  const worse = (x: { spend: number; value: number }, y: { spend: number; value: number }) =>
    x.spend < y.spend || (x.spend === y.spend && x.value <= y.value);
  for (let mask = 1; mask < 1 << pool.length; mask += 1) {
    const set = pool.filter((_, i) => (mask & (1 << i)) !== 0);
    const spend = set.reduce((sum, p) => sum + spendOf(p), 0);
    const value = set.reduce((sum, p) => sum + worthOf(view, p, weights), 0);
    // A set that spends nothing and is worth nothing is no play (it never beats the empty set).
    if (spend === 0 && value <= 0) continue;
    const last = found[count - 1];
    if (found.length >= count && last !== undefined && worse({ spend, value }, last)) continue;
    if (!canPayAll(hold === null ? set.map(sym) : [...set.map(sym), hold], units)) continue;
    // Kept sorted, best first; an equal set found later goes after the earlier ones (the first stays the best).
    const at = found.findIndex((f) => worse(f, { spend, value }));
    found.splice(at === -1 ? found.length : at, 0, { set, spend, value });
    if (found.length > count) found.pop();
  }
  return found.map((f) => f.set);
}

/** The set of `plays` that uses the most mana and is payable with `units`, most valuable among equals. */
export function bestSet(
  view: GameView,
  plays: readonly Play[],
  units: ReturnType<typeof ownUnits>,
  weights: AgentWeights,
  /** Mana symbols that must stay payable besides the set (a protection spell held open). */
  hold: readonly string[] | null = null,
): Play[] {
  return topSets(view, plays, units, weights, hold, 1)[0] ?? [];
}

/** The commander's tax: what it costs now beyond its printed cost (CR 903.8). */
const taxOf = (p: Play): number => (p.obj.isCommander ? spendOf(p) - manaValueOf(p.obj) : 0);

/** Drops a commander at a high tax unless the rule in the module comment lets it be cast. */
export function withCommanderRule(
  view: GameView,
  plays: Play[],
  units: ReturnType<typeof ownUnits>,
  weights: AgentWeights,
): Play[] {
  const w = weights.main;
  const taxed = plays.filter((p) => taxOf(p) >= w.highTax);
  if (taxed.length === 0) return plays;
  const others = plays.filter((p) => !taxed.includes(p));
  const spare = bestSet(view, others, units, weights).reduce((sum, p) => sum + spendOf(p), 0);
  const losing = evaluate(view, view.viewer, weights).score < w.losing;
  return spare < w.spareShare * units.length && !losing ? plays : others;
}

/** Order the plays of the set: reducers, removal at a big target, the rest, removal at a small one, Storm. */
export function order(view: GameView, set: readonly Play[], weights: AgentWeights): Play[] {
  const worth = (p: Play): number => worthOf(view, p, weights);
  const bestCreature = Math.max(
    0,
    ...set.filter((p) => p.obj.types.includes('creature')).map(worth),
  );
  const rank = (p: Play): number => {
    if (discountsHand(view, p.obj) || grantsLandDrops(view, p.obj)) return 0;
    if (hasStorm(p.obj)) return 4;
    if (isRemovalSpell(p.obj)) return worth(p) / weights.main.removalShare >= bestCreature ? 1 : 3;
    return 2;
  };
  return [...set].sort(
    (a, b) => rank(a) - rank(b) || worth(b) - worth(a) || (a.obj.id < b.obj.id ? -1 : 1),
  );
}

/** The plays that are made at sorcery timing: permanents, sorceries, and removal with a target worth it. */
export function mainPlays(view: GameView, plays: readonly Play[], weights: AgentWeights): Play[] {
  return plays.filter((p) =>
    isInstantSpeed(p.obj)
      ? isRemovalSpell(p.obj) && bestRemovalTarget(view, p.obj, weights) !== null
      : true,
  );
}
