/**
 * The smallest building blocks of AST validation: the issue type and list, and the readers that
 * look at a value of unknown shape. Shared by `validate-parts.ts` and the files split from it.
 */
import type { Trigger } from './types';

export interface AstIssue {
  readonly path: string;
  readonly message: string;
}

export type Out = AstIssue[];

export function issue(out: Out, path: string, message: string): void {
  out.push({ path, message });
}

export function isCount(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

export function kindOf(x: unknown): string {
  const k = (x as { kind?: unknown } | null)?.kind;
  return typeof k === 'string' ? k : '(missing)';
}

export function isOneOf(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === 'string' && allowed.includes(value);
}

/**
 * Whether the trigger's event is about a player, so that "that player" means one (D-133, `Scope.triggerPlayer`): a draw,
 * a cast, an attack, a sacrifice, becoming a target, damage dealt to a permanent (the controller of the source) and combat damage
 * dealt to a player.
 */
export function triggerHasPlayer(t: Trigger): boolean {
  switch (t?.kind) {
    case 'drawn':
    case 'castSpell':
    case 'attacks':
    case 'permanentSacrificed':
    case 'becomesTarget':
    case 'dealtDamage':
    case 'combatDamageBatch':
    case 'noncombatDamageDealt':
    case 'lifeGained':
    case 'attackBatch':
    case 'tapsForMana':
    case 'discarded':
    case 'crimeCommitted':
    case 'tokenCreated':
      return true;
    // The active player of the step (CR 102.1, 603.2b): "that player" in "at the beginning of each opponent's end step".
    case 'step':
    case 'upkeep':
    case 'endStep':
      return true;
    case 'dealsCombatDamage':
      // D-373: a planeswalker that is damaged is not a player, so "that player" would have no meaning.
      return t.to !== 'creature' && t.to !== 'playerOrPlaneswalker';
    default:
      return false;
  }
}
