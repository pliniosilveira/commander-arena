import { AMOUNT_RULES } from './amount/index';
import { CONDITION_RULES } from './condition/index';
import { COST_RULES } from './cost/index';
import { DURATION_RULES } from './duration/index';
import { EFFECT_RULES } from './effect/index';
import { KEYWORD_RULES } from './keyword/index';
import { MODAL_RULES } from './modal/index';
import { NOUN_RULES } from './noun/index';
import type { PhraseRule } from './registry';
import { REPLACEMENT_RULES } from './replacement/index';
import { RESTRICTION_RULES } from './restriction/index';
import { STATIC_RULES } from './static/index';
import { TOKEN_RULES } from './token/index';
import { TRIGGER_RULES } from './trigger/index';

/**
 * Every phrase rule, in the order the rules of a family are tried (see `family()` in
 * registry.ts). Add a rule together with its examples, its rejects and its tests, and bump
 * PARSER_VERSION in `src/version.ts` whenever the list or a rule changes.
 */
export const ALL_RULES: readonly PhraseRule<unknown>[] = [
  ...KEYWORD_RULES,
  ...REPLACEMENT_RULES,
  ...COST_RULES,
  ...TRIGGER_RULES,
  ...CONDITION_RULES,
  ...EFFECT_RULES,
  ...DURATION_RULES,
  ...RESTRICTION_RULES,
  ...TOKEN_RULES,
  ...NOUN_RULES,
  ...AMOUNT_RULES,
  ...STATIC_RULES,
  ...MODAL_RULES,
] as readonly PhraseRule<unknown>[];

/** The grammar `matchAbility` and `parseFaceText` use unless given another one. */
export const DEFAULT_RULES: readonly PhraseRule<unknown>[] = ALL_RULES;

/**
 * Turns the spell reading on for an instant or sorcery face (see `SpellRule`). The spell text is
 * read with the effect, noun and amount rules of `DEFAULT_RULES`.
 */
export const DEFAULT_SPELL_RULES: readonly { readonly id: string }[] = [{ id: 'spell.effect' }];
