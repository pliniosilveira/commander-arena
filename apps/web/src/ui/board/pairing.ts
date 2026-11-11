/**
 * Pairing markers (owner playtest): a blocked attacker and each creature blocking it carry the same
 * number and the same colour, so several identical creatures can be told apart. The number is the
 * reliable cue; the colour is the quick one, taken from the Okabe-Ito palette, which stays distinct
 * for the common kinds of colour blindness (`styles.css` holds the colours as `--pair-1` to
 * `--pair-8`). Past the eighth pair the colours repeat and the number still tells them apart.
 */
import type { CombatRole } from './resolve';

export const PAIR_COLORS = 8;

/** The CSS class that sets `--pair` and `--pair-ink` for pair `n` (1-based). */
export function pairClass(n: number): string {
  return `pair-c${((Math.max(1, n) - 1) % PAIR_COLORS) + 1}`;
}

/** The pair numbers a role carries: an attacker's own, or each attacker a blocker blocks. */
export function pairNumbers(role: CombatRole | undefined): readonly number[] {
  if (role === undefined) return [];
  if (role.kind === 'blocker') return role.pairs.map((p) => p.number);
  return role.number === null ? [] : [role.number];
}

/** What a marker on a tile is called to a screen reader: "Attacker 2, blocked", "Blocks attacker 2". */
export function markerLabel(role: CombatRole): string {
  if (role.kind === 'blocker') {
    return role.pairs.length === 1
      ? `Blocker of attacker ${role.pairs[0]?.number}`
      : `Blocker of attackers ${role.pairs.map((p) => p.number).join(' and ')}`;
  }
  return `Attacker ${role.number}, ${role.blocked ? 'blocked' : 'unblocked'}`;
}
