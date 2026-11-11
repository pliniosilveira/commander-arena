/**
 * Land choice of the HeuristicAgent (M7c, PRIOR_ART 7.2 heuristic 8, D-163), and which spells the hand
 * could use the mana for.
 *
 * `bestSpend` is the most mana a set of the hand's castable spells can use with a set of mana units
 * (colour-aware, `heuristic-mana.ts`). A land is chosen by:
 *  1. the most mana the hand can spend with it this turn (an untapped land adds its units now, a land that
 *     enters tapped adds none): the land that lets the best spell be cast this turn;
 *  2. then the land that adds the most colours the hand needs and the battlefield cannot make yet;
 *  3. then one that enters tapped over one that enters untapped (when the mana is not needed this
 *     turn, the untapped one is kept for a turn that needs it);
 *  4. then a plain land over a land with other text, then by object id with a code-unit compare.
 * "Enters tapped" is read from the text, except a land whose text says "unless" or "if" (a check land, a
 * shock land), which is counted as untapped.
 *
 * Holding the land drop (PRIOR_ART heuristic 6): in the first main phase the land is NOT played when it
 * adds nothing the hand can spend this turn, a creature of the agent can attack, and no permanent of
 * the agent cares about a land entering (landfall); it is played in the second main phase instead, with
 * the reason `land-late`. The opponent then does not learn about it before blocks.
 */
import type { GameView, ObjectView, PriorityDecision } from '@commander-arena/engine';
import { landPlays, type Play, worthCasting } from './casual-priority';
import { hasKeyword, isLand, ownCommandZone, ownHand, powerOf } from './casual-view';
import {
  canPayAll,
  costSymbols,
  missingColours,
  ownUnits,
  type Unit,
  unitsOf,
} from './heuristic-mana';
import { bestRemovalTarget, isRemovalSpell } from './heuristic-targets';
import type { Reason } from './reasons';

const TAPPED = /enters (?:the battlefield )?tapped/i;
const CONDITIONAL = /\b(?:unless|if)\b/i;
const LANDFALL = /\blandfall\b|whenever a land (?:you control )?enters/i;

/** Whether a land card reads as entering tapped (see the module comment). */
export const entersTapped = (o: ObjectView): boolean =>
  TAPPED.test(o.oracleText) && !CONDITIONAL.test(o.oracleText);

/** The spells of the hand and command zone that the agent could cast at sorcery timing and would want to. */
export function plannedSpells(view: GameView): ObjectView[] {
  return [...ownHand(view), ...ownCommandZone(view)].filter((o) => {
    if (isLand(o) || o.castCost === undefined) return false;
    if (o.types.includes('instant') || hasKeyword(o, 'flash')) {
      return isRemovalSpell(o) && bestRemovalTarget(view, o) !== null;
    }
    return worthCasting(view, o);
  });
}

/** The most mana a set of `spells` can use with `units` (0 when none can be cast). */
export function bestSpend(spells: readonly ObjectView[], units: readonly Unit[]): number {
  const pool = [...spells]
    .filter((s) => canPayAll([costSymbols(s, 0)], units))
    .sort((a, b) => (b.castCost?.length ?? 0) - (a.castCost?.length ?? 0))
    .slice(0, 9);
  let best = 0;
  for (let mask = 1; mask < 1 << pool.length; mask += 1) {
    const set = pool.filter((_, i) => (mask & (1 << i)) !== 0);
    const total = set.reduce((sum, s) => sum + costOf(s), 0);
    if (
      total > best &&
      canPayAll(
        set.map((s) => costSymbols(s, 0)),
        units,
      )
    )
      best = total;
  }
  return best;
}

/** What casting a card costs now in mana (its `castCost` symbols counted, X as 0). */
export function costOf(o: ObjectView): number {
  return (o.castCost ?? []).reduce((sum, s) => {
    const t = s.replace(/[{}]/g, '');
    return sum + (/^\d+$/.test(t) ? Number(t) : t === 'X' || t.includes('P') ? 0 : 1);
  }, 0);
}

export interface LandPlan {
  readonly play: Play;
  readonly reason: Reason;
  /** True when the land should wait for the second main phase. */
  readonly hold: boolean;
}

/** The land to play now (or to hold), or null when no land can be played. */
export function planLand(view: GameView, d: PriorityDecision): LandPlan | null {
  const lands = landPlays(view, d);
  if (lands.length === 0) return null;
  const hand = plannedSpells(view);
  const units = ownUnits(view);
  const without = bestSpend(hand, units);
  const ranked = lands
    .map((play) => {
      const tapped = entersTapped(play.obj);
      const add = tapped ? [] : unitsOf({ ...play.obj, tapped: false, summoningSick: false });
      const spend = bestSpend(hand, [...units, ...add]);
      // Colours the hand needs that this land makes and nothing on the battlefield does (a tapped land counts: it fixes next turn).
      const fixed =
        missingColours(view, hand, []).length -
        missingColours(view, hand, unitsOf({ ...play.obj, tapped: false })).length;
      return { play, tapped, spend, covers: fixed, plain: play.obj.oracleText === '' };
    })
    .sort(
      (a, b) =>
        b.spend - a.spend ||
        b.covers - a.covers ||
        Number(b.tapped) - Number(a.tapped) ||
        Number(b.plain) - Number(a.plain) ||
        (a.play.obj.id < b.play.obj.id ? -1 : a.play.obj.id > b.play.obj.id ? 1 : 0),
    );
  const best = ranked[0];
  if (best === undefined) return null;
  const needed = best.spend > without;
  const canAttack = view.battlefield.some(
    (o) =>
      o.controller === view.viewer &&
      o.types.includes('creature') &&
      !o.tapped &&
      !o.summoningSick &&
      powerOf(o) > 0,
  );
  const landfall = view.battlefield.some(
    (o) => o.controller === view.viewer && LANDFALL.test(o.oracleText),
  );
  const hold = !needed && view.step === 'precombatMain' && canAttack && !landfall;
  const fixed = needed || best.covers > 0;
  const reason: Reason =
    view.step === 'postcombatMain' && !needed ? 'land-late' : fixed ? 'land-fix' : 'land';
  return { play: best.play, reason, hold };
}
