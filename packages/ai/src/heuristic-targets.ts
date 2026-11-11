/**
 * Removal targeting of the HeuristicAgent (M7c, PRIOR_ART 7.2 heuristic 5, D-163): which opposing
 * permanent a destroy, exile, damage, bounce or shrink spell goes at, with "do not waste it" filters.
 *
 * A target is SKIPPED when the spell would be wasted on it:
 *  - it is already dying: damage marked on it is lethal (CR 120.6), or another object on the stack
 *    that is a removal spell names it;
 *  - a destroy or damage spell (or a shrink) cannot kill it: it is indestructible (CR 702.12), it has
 *    more toughness than the damage, or it will come back (persist without a -1/-1 counter, undying
 *    without a +1/+1 counter, CR 702.79, 702.93);
 *  - it has ward (CR 702.21) with a cost the agent cannot pay with the mana left after the spell.
 * Exile and bounce ignore the "will come back" and indestructible filters (they do not destroy).
 *
 * The survivors are ranked by what removing them is worth, `creatureValue` for a creature (a planeswalker
 * by its loyalty, other permanents are not aimed at). The OPPOSING COMMANDER goes first among near-equals:
 * when its value is at least `NEAR_EQUAL` of the best one it is taken. Ties are broken by object id with a
 * plain code-unit compare (the lint bans locale compare, and the choice must be the same in every sample).
 * A damage spell that can aim at a player goes at the player when its damage is lethal to them, or when no
 * creature qualifies and it is not wasted (never when the spell is also bounce or destroy: those need an
 * object).
 */
import type { ChosenTarget, GameView, ObjectView, SeatId } from '@commander-arena/engine';
import { isHelpfulSpell } from './casual-helpful';
import { findObject, hasKeyword, isCreature, toughnessOf } from './casual-view';
import { creatureValue } from './evaluate';
import { duel } from './heuristic-duel';
import { ownUnits } from './heuristic-mana';

export type RemovalKind = 'destroy' | 'exile' | 'damage' | 'bounce' | 'shrink';

const DAMAGE = /deals? (\d+) damage to (?:any target|target (?:creature|planeswalker|permanent))/i;
const KINDS: readonly [RemovalKind, RegExp][] = [
  ['destroy', /\bdestroy target\b/i],
  ['exile', /\bexile target\b/i],
  ['damage', DAMAGE],
  ['bounce', /\breturn target [^.]*? to (?:its|their) owner'?s? hand\b/i],
  ['shrink', /\btarget creature gets -\d+\/-\d+\b/i],
];

/** What kind of removal the rules text of a spell is, or null when it is not one. */
export function removalKindOf(text: string): RemovalKind | null {
  for (const [kind, re] of KINDS) if (re.test(text)) return kind;
  return null;
}

/** An instant or sorcery with a hostile targeted effect on a creature or a permanent. */
export function isRemovalSpell(o: ObjectView): boolean {
  if (!o.types.includes('instant') && !o.types.includes('sorcery')) return false;
  if (isHelpfulSpell(o)) return false;
  return removalKindOf(o.oracleText) !== null;
}

/** The damage a damage spell deals (0 when its text does not say). */
export const damageOf = (text: string): number => Number(DAMAGE.exec(text)?.[1] ?? 0);

/** The value of removing a permanent: a creature by its evaluator value, a planeswalker by loyalty. */
export function threatValue(o: ObjectView): number {
  if (isCreature(o)) return creatureValue(o);
  if (o.types.includes('planeswalker')) return 6 + 0.6 * (o.counters.loyalty ?? 0);
  return 0;
}

/** The value of the best commander is taken before a lone better creature when at least this near. */
const NEAR_EQUAL = 0.8;

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Whether another object on the stack is a removal spell that names `target` (it is about to die). */
function dyingOnStack(view: GameView, target: ObjectView, spellId: string | undefined): boolean {
  return view.stack.some(
    (s) =>
      s.id !== spellId &&
      removalKindOf(s.oracleText) !== null &&
      s.targets.some((t) => t.kind === 'object' && t.id === target.id),
  );
}

/** The mana cost of a "Ward {N}" with a generic cost; null for another ward cost (read as not payable). */
function wardCost(o: ObjectView): number | null {
  if (!hasKeyword(o, 'ward')) return 0;
  const generic = /ward \{(\d+)\}/i.exec(o.oracleText);
  return generic === null ? null : Number(generic[1]);
}

export interface RemovalContext {
  readonly kind: RemovalKind;
  /** The damage of a damage spell, else 0. */
  readonly damage: number;
  /** Mana the agent can still spend after the spell, for ward. */
  readonly spare: number;
  readonly spellId: string | undefined;
}

/** Whether a removal spell of this context is worth casting at `o`: see the module comment. */
export function isWorthTarget(view: GameView, o: ObjectView, ctx: RemovalContext): boolean {
  if (o.controller === view.viewer || threatValue(o) <= 0) return false;
  if (isCreature(o) && o.damage >= toughnessOf(o) && toughnessOf(o) > 0) return false;
  if (dyingOnStack(view, o, ctx.spellId)) return false;
  const ward = wardCost(o);
  if (ward === null || ward > ctx.spare) return false;
  const destroys = ctx.kind === 'destroy' || ctx.kind === 'damage' || ctx.kind === 'shrink';
  if (destroys && isCreature(o)) {
    if (hasKeyword(o, 'indestructible') && ctx.kind !== 'shrink') return false;
    if (ctx.kind === 'damage' && toughnessOf(o) - o.damage > ctx.damage) return false;
    if (hasKeyword(o, 'persist') && (o.counters['-1/-1'] ?? 0) === 0) return false;
    if (hasKeyword(o, 'undying') && (o.counters['+1/+1'] ?? 0) === 0) return false;
  }
  return true;
}

/** The spell's context: its kind, damage and the mana the agent keeps after paying for it. */
export function removalContext(view: GameView, spell: ObjectView): RemovalContext | null {
  const kind = removalKindOf(spell.oracleText);
  if (kind === null) return null;
  const cost = spell.castCost === undefined ? 0 : spell.castCost.length;
  return {
    kind,
    damage: damageOf(spell.oracleText),
    spare: Math.max(ownUnits(view).length - cost, 0),
    spellId: spell.id,
  };
}

export interface Ranked {
  readonly object: ObjectView;
  readonly value: number;
}

/** The permanents worth aiming at, best first (the commander ahead among near-equals, ties by id). */
export function rankTargets(
  view: GameView,
  candidates: readonly ObjectView[],
  ctx: RemovalContext,
): Ranked[] {
  const worth = candidates
    .filter((o) => isWorthTarget(view, o, ctx))
    .map((object) => ({ object, value: threatValue(object) }))
    .sort((a, b) => b.value - a.value || byId(a.object.id, b.object.id));
  const top = worth[0];
  if (top === undefined) return worth;
  const commander = worth.find((r) => r.object.isCommander && r.value >= NEAR_EQUAL * top.value);
  return commander === undefined ? worth : [commander, ...worth.filter((r) => r !== commander)];
}

/** The attackers of the combat in progress that `seat` does not control (a defender may aim at them first). */
function attackersAgainst(view: GameView, seat: SeatId): ObjectView[] {
  return (view.combat?.attackers ?? []).flatMap((a) => {
    const o = findObject(view, a.object);
    return o !== undefined && o.controller !== seat ? [o] : [];
  });
}

/** The best target worth a removal spell now, or null: used to decide whether to cast it at all. */
export function bestRemovalTarget(view: GameView, spell: ObjectView): Ranked | null {
  const ctx = removalContext(view, spell);
  if (ctx === null) return null;
  const pool = view.battlefield.filter((o) => o.controller !== view.viewer);
  const defending = view.combat !== null && view.activeSeat !== view.viewer;
  const attackers = defending ? attackersAgainst(view, view.viewer) : [];
  const ranked = rankTargets(view, attackers.length > 0 ? attackers : pool, ctx);
  return ranked[0] ?? (attackers.length > 0 ? (rankTargets(view, pool, ctx)[0] ?? null) : null);
}

export interface TargetPick {
  readonly targets: ChosenTarget[];
  readonly reason: 'target-commander' | 'target-best';
}

/**
 * The answer to a targets decision for a removal spell, or null to leave it to the casual handler (a
 * spell this does not read, several slots, or nothing worth aiming at).
 */
export function chooseRemovalTargets(
  view: GameView,
  source: ObjectView,
  specs: readonly { specId: string; min: number; max: number; legal: readonly ChosenTarget[] }[],
): TargetPick | null {
  const [spec] = specs;
  if (specs.length !== 1 || spec === undefined || spec.max !== 1 || !isRemovalSpell(source)) {
    return null;
  }
  const ctx = removalContext(view, source);
  if (ctx === null) return null;
  const legalObjects = spec.legal.flatMap((t) => {
    const o = t.kind === 'object' ? findObject(view, t.id) : undefined;
    return o === undefined || t.kind !== 'object' ? [] : [{ t, o }];
  });
  const pool = legalObjects.map((x) => x.o);
  // Burn that can go at a player goes there when it is lethal.
  const player = spec.legal.find((t) => t.kind === 'player' && t.seat !== view.viewer);
  const opponent =
    player?.kind === 'player' ? view.seats.find((s) => s.id === player.seat) : undefined;
  if (player !== undefined && opponent !== undefined && ctx.kind === 'damage') {
    if (ctx.damage >= opponent.life) return { targets: [player], reason: 'target-best' };
  }
  const defending = view.combat !== null && view.activeSeat !== view.viewer;
  const attackers = defending ? attackersAgainst(view, view.viewer) : [];
  const preferred = pool.filter((o) => attackers.some((a) => a.id === o.id));
  const ranked = rankTargets(view, preferred.length > 0 ? preferred : pool, ctx);
  const best = ranked[0] ?? rankTargets(view, pool, ctx)[0];
  if (best !== undefined) {
    const hit = legalObjects.find((x) => x.o.id === best.object.id);
    if (hit !== undefined) {
      return {
        targets: [hit.t],
        reason: best.object.isCommander ? 'target-commander' : 'target-best',
      };
    }
  }
  // Nothing worth a creature spell: burn with a player target goes face rather than at a bad creature.
  if (player !== undefined && ctx.kind === 'damage')
    return { targets: [player], reason: 'target-best' };
  return null;
}

/**
 * For a helpful spell (a pump): the creature of the agent in the combat that is in a fight it does not
 * win (it would die, or not kill what it fights), the most valuable such one; else any of its creatures
 * in the combat; else its strongest creature.
 */
export function creatureToHelp(
  view: GameView,
  legal: readonly ChosenTarget[],
): ChosenTarget | null {
  const mine = legal.flatMap((t) => {
    const o = t.kind === 'object' ? findObject(view, t.id) : undefined;
    return o !== undefined && o.controller === view.viewer && isCreature(o) ? [{ t, o }] : [];
  });
  if (mine.length === 0) return null;
  const fights = new Map<string, boolean>();
  for (const a of view.combat?.attackers ?? []) {
    const attacker = findObject(view, a.object);
    if (attacker === undefined) continue;
    for (const bid of a.blockedBy) {
      const blocker = findObject(view, bid);
      if (blocker === undefined) continue;
      const r = duel(attacker, blocker);
      // `true` = the creature is losing or not winning its fight, so a pump changes something.
      fights.set(
        attacker.id,
        (fights.get(attacker.id) ?? false) || r.attackerDies || !r.blockerDies,
      );
      fights.set(blocker.id, (fights.get(blocker.id) ?? false) || r.blockerDies || !r.attackerDies);
    }
  }
  const needy = mine.filter((x) => fights.get(x.o.id) === true);
  const fighting = mine.filter((x) => fights.has(x.o.id));
  const pool = needy.length > 0 ? needy : fighting.length > 0 ? fighting : mine;
  return (
    [...pool].sort((a, b) => creatureValue(b.o) - creatureValue(a.o) || byId(a.o.id, b.o.id))[0]
      ?.t ?? null
  );
}
