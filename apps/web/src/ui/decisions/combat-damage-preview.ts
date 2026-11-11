/**
 * The damage that passes the blockers (issue 106): while the player declares blockers, how much each
 * defender (the player, each planeswalker or battle attacked) would take from the attackers that no
 * chosen blocker stops, plus the excess of a trampler over its blockers. A pure function of the view
 * and the blocks picked so far; everything it reads (power, toughness, damage marked, keywords, life
 * total) is public. It is a preview of the plain combat damage step, not a forecast: first strike
 * killing a blocker early, deathtouch on the blockers' side, prevention, damage-doubling and spells
 * are not simulated, and the panel says so. The engine stays the judge of what really happens.
 */
import type {
  AttackTarget,
  DeclareBlockersDecision,
  GameView,
  ObjectId,
  ObjectView,
} from '@commander-arena/engine';
import type { BlockPick } from './block';
import { type Index, nameOf, objectIndex } from './lookup';

/** One attacker's share of what passes. */
export interface PassingSource {
  readonly object: ObjectId;
  readonly name: string;
  /** Combat damage this attacker puts through to the defender (every strike counted). */
  readonly amount: number;
  /** `open`: nothing blocks it. `trample`: what is left over its blockers. */
  readonly how: 'open' | 'trample';
}

/** Everything one defender takes. */
export interface PassingTarget {
  readonly target: AttackTarget;
  /** `You` for the viewer, `Opponent`, or the planeswalker's or battle's name. */
  readonly label: string;
  /** Damage dealt to it; for a player this is life lost unless the attackers have infect. */
  readonly damage: number;
  /** Poison counters from infect attackers (CR 702.90b); zero for a permanent. */
  readonly poison: number;
  readonly sources: readonly PassingSource[];
  /** What it has now: life, loyalty or defense. Null when the view does not say. */
  readonly current: number | null;
  /** What it has left: never below zero. Null when `current` is null. */
  readonly remaining: number | null;
  /** The damage is enough to make a player lose, or to remove the last loyalty or defense counter. */
  readonly lethal: boolean;
  /** The kind of `current`: life, loyalty or defense counters. */
  readonly stat: 'life' | 'loyalty' | 'defense';
}

const has = (o: ObjectView | undefined, keyword: string): boolean =>
  o?.keywords.includes(keyword) === true;

/** Damage still needed to kill a blocker (CR 702.19b); one point when the attacker has deathtouch. */
function lethalTo(blocker: ObjectView | undefined, deathtouch: boolean): number | null {
  if (blocker === undefined || blocker.toughness === null) return null;
  return deathtouch ? 1 : Math.max(0, blocker.toughness - blocker.damage);
}

/**
 * What one attacker puts through. An unblocked one deals its power, twice with double strike. A
 * blocked trampler assigns lethal damage to each blocker and the rest goes through (CR 702.19b);
 * with double strike the blockers killed by the first strike let the whole of the second through
 * (CR 702.19e). A blocked attacker without trample puts nothing through.
 */
export function throughDamage(
  attacker: ObjectView | undefined,
  blockers: readonly (ObjectView | undefined)[],
): { readonly amount: number; readonly how: 'open' | 'trample' } {
  const power = Math.max(0, attacker?.power ?? 0);
  const strikes = has(attacker, 'doubleStrike') ? 2 : 1;
  if (blockers.length === 0) return { amount: power * strikes, how: 'open' };
  if (!has(attacker, 'trample')) return { amount: 0, how: 'trample' };
  const deathtouch = has(attacker, 'deathtouch');
  const lethal = blockers.map((b) => lethalTo(b, deathtouch));
  // A blocker whose toughness is unknown is not counted as soaking anything: the preview then
  // shows at most what the blockers we can read leave over.
  let needed = lethal.reduce<number>((sum, n) => sum + (n ?? 0), 0);
  let amount = 0;
  for (let strike = 0; strike < strikes; strike++) {
    amount += Math.max(0, power - needed);
    needed = Math.max(0, needed - power);
  }
  return { amount, how: 'trample' };
}

const targetKey = (t: AttackTarget): string =>
  t.kind === 'player' ? `p${t.seat}` : `o${t.object}`;

/**
 * The passing damage per defender, in the order the attackers were declared; a defender with
 * nothing passing is left out. `blocks` are the picks made so far in the question.
 */
export function passingDamage(
  view: GameView,
  decision: Pick<DeclareBlockersDecision, 'attackers'>,
  blocks: readonly BlockPick[],
  index: Index = objectIndex(view),
): readonly PassingTarget[] {
  const grouped = new Map<
    string,
    { target: AttackTarget; sources: PassingSource[]; poison: number }
  >();
  for (const a of decision.attackers) {
    const attacker = index.get(a.attacker);
    const blockerViews = blocks
      .filter((b) => b.attacker === a.attacker)
      .map((b) => index.get(b.blocker));
    const through = throughDamage(attacker, blockerViews);
    if (through.amount === 0) continue;
    const entry = grouped.get(targetKey(a.target)) ?? { target: a.target, sources: [], poison: 0 };
    entry.sources.push({
      object: a.attacker,
      name: nameOf(index, a.attacker),
      amount: through.amount,
      how: through.how,
    });
    // Infect damage to a player is poison counters, not life loss (CR 702.90b).
    if (a.target.kind === 'player' && has(attacker, 'infect')) entry.poison += through.amount;
    grouped.set(targetKey(a.target), entry);
  }
  return [...grouped.values()].map(({ target, sources, poison }) => {
    const total = sources.reduce((sum, s) => sum + s.amount, 0);
    const damage = total - poison;
    if (target.kind === 'player') {
      const seat = view.seats[target.seat];
      const current = seat?.life ?? null;
      const label = target.seat === view.viewer ? 'You' : 'Opponent';
      const lethal =
        (current !== null && damage >= current && damage > 0) ||
        (poison > 0 && (seat?.poison ?? 0) + poison >= 10);
      return {
        target,
        label,
        damage,
        poison,
        sources,
        current,
        remaining: current === null ? null : Math.max(0, current - damage),
        lethal,
        stat: 'life' as const,
      };
    }
    const permanent = index.get(target.object);
    const stat = permanent?.counters.defense !== undefined ? 'defense' : 'loyalty';
    const current = permanent === undefined ? null : (permanent.counters[stat] ?? 0);
    return {
      target,
      label: nameOf(index, target.object),
      damage: total,
      poison: 0,
      sources,
      current,
      remaining: current === null ? null : Math.max(0, current - total),
      lethal: current !== null && total >= current,
      stat,
    };
  });
}

/** "You take 7" or "Jace, Vryn's Prodigy loses 3 loyalty": the headline of one defender. */
export function passingHeadline(t: PassingTarget): string {
  if (t.target.kind === 'player') {
    const parts: string[] = [];
    if (t.damage > 0)
      parts.push(`${t.label === 'You' ? 'You take' : 'Opponent takes'} ${t.damage}`);
    if (t.poison > 0)
      parts.push(`${t.label === 'You' ? 'you get' : 'Opponent gets'} ${t.poison} poison`);
    const text = parts.join(', ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return `${t.label} takes ${t.damage}`;
}

/** What is left: "Life 40 to 33", "Loyalty 4 to 1"; empty when the view does not say or only poison passes. */
export function passingRemaining(t: PassingTarget): string {
  if (t.current === null || t.remaining === null || t.damage === 0) return '';
  const word = t.stat === 'life' ? 'Life' : t.stat === 'loyalty' ? 'Loyalty' : 'Defense';
  return `${word} ${t.current} to ${t.remaining}`;
}
