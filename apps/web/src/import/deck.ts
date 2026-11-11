/** From an import report to what the game needs: the engine's `DeckConfig`, and small labels. */
import type { DeckConfig } from '@commander-arena/engine';
import type { ImportReport } from './types';

/**
 * Why a report cannot be played yet, in a sentence; null when it can.
 *
 * This is THE rule for starting a game from a deck the player or the app supplies (the menu's
 * precons, "Play this deck" of the import screen, a saved deck opened there; D-137): every name
 * resolved, a commander, the Commander rules hold (`validateDeck`: 100 cards, singleton, color
 * identity, legality, partners) and every card fully supported (D-056). The report's own
 * `playable` flag is not trusted on its own: each condition is checked again here.
 */
export function unplayableReason(report: ImportReport): string | null {
  if (report.notFound.length > 0) {
    return `${report.notFound.length} card name(s) were not found`;
  }
  if (report.fuzzy.length > 0) return `${report.fuzzy.length} card name(s) await confirmation`;
  const unsupported = report.entries.filter((entry) => entry.card.support.status !== 'supported');
  const unsupportedCount = Math.max(report.coverage.unsupported.length, unsupported.length);
  if (unsupportedCount > 0) {
    return `${unsupportedCount} card(s) have abilities the engine cannot run yet`;
  }
  if (report.commanders.length === 0) return 'no commander is set';
  if (report.validation === null) return 'the deck was not checked';
  const errors = report.validation.issues.filter((issue) => issue.severity === 'error');
  const first = errors[0];
  if (first) return first.message;
  if (!report.validation.ok) return 'the deck is not valid';
  return report.playable ? null : 'the deck is not valid';
}

/** Whether a game may start from the report, and why not. */
export type DeckCheck =
  | { readonly ok: true; readonly deck: DeckConfig }
  | { readonly ok: false; readonly reason: string };

/** `toDeckConfig` that returns the reason instead of throwing. */
export function checkPlayable(report: ImportReport): DeckCheck {
  const reason = unplayableReason(report);
  if (reason !== null) return { ok: false, reason };
  return { ok: true, deck: deckConfigOf(report) };
}

/**
 * The deck for `createGame`: the commanders' definitions first (indices `[0]` or `[0, 1]`), then
 * every other card repeated by its count. Throws when the report is not playable.
 */
export function toDeckConfig(report: ImportReport): DeckConfig {
  const check = checkPlayable(report);
  if (!check.ok) throw new Error(`This deck cannot be played: ${check.reason}.`);
  return check.deck;
}

function deckConfigOf(report: ImportReport): DeckConfig {
  const cards = report.commanders.map((commander) => commander.definition);
  for (const entry of report.entries) {
    if (entry.section === 'commander') continue;
    for (let copy = 0; copy < entry.count; copy += 1) cards.push(entry.card.definition);
  }
  return { cards, commanders: report.commanders.map((_, index) => index) };
}

/** How many distinct cards of the deck the engine does not fully support. */
export function unsupportedCount(report: ImportReport): number {
  return report.coverage.unsupported.length;
}

/** A short name for lists: the deck name and its commanders, or only the name. */
export function deckLabel(report: ImportReport): string {
  const name = report.deckName.trim() === '' ? 'Untitled deck' : report.deckName.trim();
  if (report.commanders.length === 0) return name;
  return `${name} (${report.commanders.map((commander) => commander.stored.name).join(' & ')})`;
}
