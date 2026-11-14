import type { Ability } from '@commander-arena/engine';
import type { PhraseRule } from './rules/registry';

/**
 * One rule of the grammar: a phrase rule of any family (see rules/registry.ts). `id` is stable
 * (it ends up in the diagnostics as `closestRule` and in coverage reports), so rename only with
 * a PARSER_VERSION bump and a note.
 */
export type GrammarRule = PhraseRule<unknown>;

/**
 * Marks that a face is an instant or sorcery, whose effect text is read as a spell body. Passing
 * one to `parseFaceText` turns the spell reading on; the vocabulary it reads with is in the
 * grammar rules (the effect, noun and amount families). Permanent faces never get one.
 */
export interface SpellRule {
  readonly id: string;
}

/** Sentinel `closestRule` for an ability on which no rule consumed any text. */
export const NO_RULE = 'none';

export type Mismatch = {
  readonly ok: false;
  readonly stoppedAt: string;
  readonly closestRule: string;
};

export type AbilityMatch =
  | { readonly ok: true; readonly ruleId: string; readonly abilities: readonly Ability[] }
  | Mismatch;
