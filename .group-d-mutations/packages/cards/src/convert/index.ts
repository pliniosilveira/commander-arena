/** Conversion of stored Scryfall cards to engine definitions with support status (M4). */

export { importCard } from './import-card';
export { resolveLayout } from './layout';
export { convertManaCost } from './mana-cost';
export {
  isMeldLookupError,
  MELD_PART,
  MELD_RESULT,
  type MeldLookup,
  type MeldRelation,
  meldRelation,
  meldReminderPartner,
  meldResultNames,
} from './meld';
export {
  createFixtureRegistry,
  DEFAULT_OVERRIDES,
  fixtureDifferences,
  type OverrideLookup,
  type OverrideRegistry,
  overrideNameKey,
} from './override';
export {
  type AbilityMatch,
  type CompileOptions,
  compileLine,
  DEFAULT_RULES,
  DEFAULT_SPELL_RULES,
  finishSpell,
  type GrammarRule,
  type LineFailure,
  type LineResult,
  matchAbility,
  NO_RULE,
  normalizeOracleText,
  parseFaceText,
  type SpellRule,
  splitAbilities,
  stripReminderText,
} from './parser/index';
export { cachedSupport, MemorySupportCache, type SupportCache } from './support-cache';
export {
  analyzeTemplates,
  formatTemplateReport,
  type ReasonRow,
  type TemplateAnalysis,
  type TemplateRow,
  templateOf,
} from './template';
export { parseTypeLine } from './type-line';
