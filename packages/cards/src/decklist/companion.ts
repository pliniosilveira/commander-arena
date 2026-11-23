/**
 * The companion of a parsed decklist (SPEC 6.1, CR 702.139): the `Companion` section names the card to bring from outside the game, at most one. The name still has to be resolved to a
 * stored card and checked against the deck (`companionIssues`, `validate/companion.ts`); this only says which line is the companion and whether there are too many.
 */
import type { CompanionSelection, ParsedDecklist, ValidationIssue } from '../types';

export function selectCompanion(parsed: ParsedDecklist): CompanionSelection {
  const [entry = null, ...extra] = parsed.sections.companion;
  const issues: ValidationIssue[] = [];
  const total = (entry?.count ?? 0) + extra.reduce((sum, e) => sum + e.count, 0);
  if (total > 1) {
    const names = [...(entry === null ? [] : [entry]), ...extra].map((e) => e.name);
    issues.push({
      severity: 'error',
      code: 'companion-count',
      message: `A deck can have only one companion, not ${total}.`,
      cards: names,
    });
  }
  return { entry, extra, issues };
}
