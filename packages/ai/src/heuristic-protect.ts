/**
 * Protection spells of the HeuristicAgent: "Target permanent you control gains hexproof and indestructible
 * until end of turn" and the like (a helpful instant that keeps a permanent of the agent's from a spell or
 * ability).
 *
 * WHEN: in response to an opponent's spell or ability on the stack that names a permanent of the agent's
 * as a target. Each protection play is cast on the sample, and the stack resolves; the best is cast when it
 * beats passing by `TRICK_MARGIN` (the removal fizzles on the sample, so the permanent is still there).
 *
 * WHO: `protectedTarget` picks the permanent to protect: one that an opponent's object on the stack names,
 * the commander first, then the most valuable; with no threat, the most valuable permanent that is not a
 * land. A land is the choice only when it is all that is legal.
 */
import type { Action, ChosenTarget, GameView, ObjectView } from '@commander-arena/engine';
import { isHelpfulSpell } from './casual-helpful';
import type { Play } from './casual-priority';
import { findObject, isCreature, isLand, withoutReminder } from './casual-view';
import { creatureValue } from './evaluate';
import type { Think } from './heuristic-budget';
import { type Answer, scoreCast } from './heuristic-delta';

/** A protection play must beat passing by this much (the same margin as a combat trick). */
const PROTECT_MARGIN = 0.5;
/** A commander is worth this much more than a creature of its value (as in `heuristic-main.ts`). */
const COMMANDER_BONUS = 4;
/** What a permanent that is not a creature is worth next to a creature. */
const PERMANENT_VALUE = 3;

const PROTECTS = /hexproof|indestructible|shroud|protection from|regenerat|phase out/i;

/** An instant that protects its target. */
export const isProtectionSpell = (o: ObjectView): boolean =>
  isHelpfulSpell(o) && PROTECTS.test(withoutReminder(o.oracleText));

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const worthOf = (o: ObjectView): number =>
  (isCreature(o)
    ? creatureValue({ ...o, power: o.power ?? 0, toughness: o.toughness ?? 0 })
    : PERMANENT_VALUE) + (o.isCommander ? COMMANDER_BONUS : 0);

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
): ChosenTarget | null {
  const mine = legal.flatMap((t) => {
    const o = t.kind === 'object' ? findObject(view, t.id) : undefined;
    return o !== undefined && o.controller === view.viewer ? [{ t, o }] : [];
  });
  const threats = new Set(threatened(view).map((o) => o.id));
  const rank = (x: { o: ObjectView }): number =>
    (threats.has(x.o.id) ? 1000 : 0) + (isLand(x.o) ? -100 : 0) + worthOf(x.o);
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
  const base = scoreCast(sample, view.viewer, null, answer, think.budget);
  if (base === null) return null;
  let best: { play: Play; score: number } | undefined;
  for (const [i, play] of candidates.entries()) {
    if (think.budget.expired(i + 1)) break;
    const score = scoreCast(sample, view.viewer, castAction(play), answer, think.budget);
    if (
      score !== null &&
      score > base + PROTECT_MARGIN &&
      (best === undefined || score > best.score)
    ) {
      best = { play, score };
    }
  }
  return best?.play ?? null;
}
