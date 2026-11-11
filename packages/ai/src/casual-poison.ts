/**
 * CasualAgent and poison (D-110): Infect (CR 702.90) and Toxic N (CR 702.164) put poison counters on a
 * player, and ten of them lose the game (CR 704.5c), a second way to win or lose a race beside life.
 *
 * What the agent counts, all from the view (keywords are listed by kind and Toxic's N is read from the
 * rules text, as the other heuristics read what a keyword's number is):
 *  - the life an attacker takes: its power, unless it has infect (infect damage is poison, not life loss);
 *  - the poison it gives: its power with infect, plus its total toxic value (the sum of its toxic N, CR
 *    702.164b) for combat damage to a player;
 *  - an attack is lethal when the life damage reaches the opponent's life, or the poison damage plus the
 *    poison counters already there reaches ten;
 *  - a block is forced (a chump block) when the unblocked attackers would do either to the agent.
 * Wither and infect damage to a creature is -1/-1 counters, which kill the same creatures damage does
 * (power against toughness), so blocking and attacking read power as before.
 */
import type { GameView, ObjectView, SeatId } from '@commander-arena/engine';
import { hasKeyword, powerOf } from './casual-view';

/** CR 704.5c: a player with this many poison counters loses. */
export const POISON_LOSS = 10;

const TOXIC = /\btoxic (\d+)/gi;

/** CR 702.164b: the sum of the N values of the toxic abilities the creature's text names. */
export function toxicValue(o: ObjectView): number {
  if (!hasKeyword(o, 'toxic')) return 0;
  let total = 0;
  for (const m of o.oracleText.matchAll(TOXIC)) total += Number(m[1]);
  return total;
}

/** Damage the creature deals to a player that comes off their life total (not infect damage). */
export const lifeDamageOf = (o: ObjectView): number => (hasKeyword(o, 'infect') ? 0 : powerOf(o));

/** Poison counters the creature gives with combat damage to a player: infect damage plus toxic. */
export function poisonDamageOf(o: ObjectView): number {
  if (powerOf(o) <= 0) return 0;
  return (hasKeyword(o, 'infect') ? powerOf(o) : 0) + toxicValue(o);
}

/** The poison counters a seat has. */
export const poisonOf = (view: GameView, seat: SeatId): number =>
  view.seats.find((s) => s.id === seat)?.poison ?? 0;

/** The poison counters of the opposing seat with the most (v1 has exactly one opponent). */
export function opponentPoison(view: GameView): number {
  const counts = view.seats.filter((s) => s.id !== view.viewer && !s.hasLost).map((s) => s.poison);
  return counts.length === 0 ? 0 : Math.max(...counts);
}

/** Whether `attackers`, all unblocked at the opponent, give them ten poison counters. */
export function poisonLethal(view: GameView, attackers: readonly ObjectView[]): boolean {
  const given = attackers.reduce((sum, o) => sum + poisonDamageOf(o), 0);
  return given > 0 && opponentPoison(view) + given >= POISON_LOSS;
}

/** Whether `attackers`, all unblocked at the agent, would give it ten poison counters. */
export function poisonThreat(view: GameView, attackers: readonly ObjectView[]): boolean {
  const given = attackers.reduce((sum, o) => sum + poisonDamageOf(o), 0);
  return given > 0 && poisonOf(view, view.viewer) + given >= POISON_LOSS;
}
