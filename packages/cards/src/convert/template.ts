/**
 * Template analysis of what the parser could not read (SPEC A21, D-057). Many cards share the
 * same sentence shape ("When ~ enters, draw a card."), so grouping the unparsed abilities by shape
 * and counting the cards each shape blocks gives the work order for the grammar and for the
 * engine nodes it needs: the few templates that unlock the most cards come first.
 */
import type { ImportedCard } from '../types';

const NUMBER_WORDS = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\b/gi;
const MANA_RUN = /(?:\{(?:[0-9WUBRGCS]|[WUBRG2]\/[WUBRGP]|[WUBRG]\/[WUBRG]\/P)\})+/g;

/**
 * The shape of one normalized ability text: numbers become N, mana costs become {M}, "+1/+1"
 * becomes "+N/+N"; `~` (the card itself) and every other word stay.
 */
export function templateOf(text: string): string {
  return text
    .replace(MANA_RUN, '{M}')
    .replace(/([+-])\d+\/([+-])\d+/g, '$1N/$2N')
    .replace(/\d+/g, 'N')
    .replace(NUMBER_WORDS, 'N')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface TemplateRow {
  readonly template: string;
  /** Distinct card names with at least one ability of this shape. */
  readonly cards: readonly string[];
  /** How many abilities (over all cards) have this shape. */
  readonly abilities: number;
  /** One real example, as written after normalization. */
  readonly example: string;
}

export interface ReasonRow {
  readonly reason: string;
  readonly cards: readonly string[];
}

export interface TemplateAnalysis {
  readonly unsupportedCards: number;
  readonly templates: readonly TemplateRow[];
  /** Reasons that are not a parse failure (layout, type, `*` power, fixture mismatch). */
  readonly reasons: readonly ReasonRow[];
}

/** Groups the unparsed abilities and the other reasons of the unsupported cards. */
export function analyzeTemplates(cards: readonly ImportedCard[]): TemplateAnalysis {
  const byTemplate = new Map<string, { cards: Set<string>; abilities: number; example: string }>();
  const byReason = new Map<string, Set<string>>();
  let unsupported = 0;
  for (const card of cards) {
    if (card.support.status === 'supported') continue;
    unsupported += 1;
    const name = card.stored.name;
    for (const unparsed of card.support.unparsed) {
      const key = templateOf(unparsed.text);
      const row = byTemplate.get(key) ?? {
        cards: new Set<string>(),
        abilities: 0,
        example: unparsed.text,
      };
      row.cards.add(name);
      row.abilities += 1;
      byTemplate.set(key, row);
    }
    for (const reason of card.support.reasons) {
      const key = templateOf(reason);
      const set = byReason.get(key) ?? new Set<string>();
      set.add(name);
      byReason.set(key, set);
    }
  }
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const templates = [...byTemplate.entries()]
    .map(([template, row]) => ({
      template,
      cards: [...row.cards].sort(compare),
      abilities: row.abilities,
      example: row.example,
    }))
    .sort((a, b) => b.cards.length - a.cards.length || compare(a.template, b.template));
  const reasons = [...byReason.entries()]
    .map(([reason, set]) => ({ reason, cards: [...set].sort(compare) }))
    .sort((a, b) => b.cards.length - a.cards.length || compare(a.reason, b.reason));
  return { unsupportedCards: unsupported, templates, reasons };
}

/** A plain-text report to paste into a chat or an issue: the most blocking templates first. */
export function formatTemplateReport(
  deckName: string,
  analysis: TemplateAnalysis,
  limit = 40,
): string {
  const lines = [
    `Template report for "${deckName}": ${analysis.unsupportedCards} unsupported card(s).`,
    '',
    'Ability templates the parser could not read (cards blocked, abilities, template, example):',
  ];
  for (const row of analysis.templates.slice(0, limit)) {
    lines.push(`- ${row.cards.length} card(s), ${row.abilities} ability(ies): ${row.template}`);
    lines.push(`    e.g. ${row.example}`);
    lines.push(`    cards: ${row.cards.join('; ')}`);
  }
  if (analysis.templates.length > limit) {
    lines.push(`... and ${analysis.templates.length - limit} more templates.`);
  }
  if (analysis.reasons.length > 0) {
    lines.push('', 'Other reasons (not a parse failure):');
    for (const row of analysis.reasons) {
      lines.push(`- ${row.cards.length} card(s): ${row.reason}`);
      lines.push(`    cards: ${row.cards.join('; ')}`);
    }
  }
  return lines.join('\n');
}
