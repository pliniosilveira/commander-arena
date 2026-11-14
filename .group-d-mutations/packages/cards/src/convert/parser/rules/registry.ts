/**
 * The phrase-rule registry (D-063, D-065; proposal section 3.5). A rule reads one kind of phrase
 * (a trigger, a cost, an effect verb, a noun phrase, an amount, a keyword line, a replacement)
 * and yields an IR node; whole abilities are not rules, the segmenter and the lowering handle
 * their structure. Rules are plain data: an id, the family they belong to, the words they can
 * start with, a parser, and the examples that document and test them.
 */
import {
  fail,
  inFamily,
  named,
  type ParseContext,
  type ParseResult,
  type Parser,
  quiet,
  type RuleLookup,
} from '../combinators';
import type { RuleFamily, Span } from '../ir/types';

export interface PhraseRule<T> {
  /**
   * Stable id, `<family>.<name>`; renaming one needs a PARSER_VERSION bump and a note, because
   * ids end up in the diagnostics (`closestRule`, `recognised`) and in reports.
   */
  readonly id: string;
  readonly family: RuleFamily;
  /** First words (lowercased) that can start a match, for dispatch; [] means "try always". */
  readonly leading: readonly string[];
  readonly parse: Parser<T>;
  /**
   * Golden examples: each must parse completely with this rule and with no other rule of the
   * family (meta test 1), and its node must carry this rule's id.
   */
  readonly examples: readonly string[];
  /** Texts this rule must NOT consume completely: shapes a neighbouring rule owns, or unsupported. */
  readonly rejects?: readonly string[];
  /** CR citations for the reading this rule encodes, by number and title. */
  readonly cites: readonly string[];
}

/**
 * Registers a rule. The parser is wrapped in `named(id, ...)`, so a failure reports the innermost
 * rule that was being read (`closestRule`), and matches are recorded for `recognised`.
 */
export function defineRule<T>(rule: PhraseRule<T>): PhraseRule<T> {
  return { ...rule, parse: named(rule.id, rule.parse) };
}

/**
 * The rule with its failures left out of the diagnostics (`quiet`, combinators.ts): a rule whose first words are another rule's ("You have
 * hexproof." and "You may play an additional land this turn.") must not move the point where a line that it does not read stops. Its
 * matches are recorded as usual.
 */
export function quietly<T>(rule: PhraseRule<T>): PhraseRule<T> {
  return { ...rule, parse: quiet(rule.parse) };
}

/** The first word at `pos`, lowercased: what rules dispatch on. `{T}` and `~` count as words. */
export function firstWord(text: string, pos: number): string {
  const m = /^[^\s,.:;]+/.exec(text.slice(pos, pos + 40));
  return m === null ? '' : m[0].toLowerCase();
}

export interface RuleSet extends RuleLookup {
  readonly rules: readonly PhraseRule<unknown>[];
  readonly byFamily: ReadonlyMap<RuleFamily, readonly PhraseRule<unknown>[]>;
  /** The rules of a family to try at a position: those whose `leading` matches, in order. */
  candidates(family: RuleFamily, text: string, pos: number): readonly PhraseRule<unknown>[];
}

/** A set of rules; later duplicates of an id are dropped, order is kept (it is the try order). */
export function buildRuleSet(rules: readonly PhraseRule<unknown>[]): RuleSet {
  const seen = new Set<string>();
  const unique = rules.filter((r) => !seen.has(r.id) && seen.add(r.id));
  const byFamily = new Map<RuleFamily, PhraseRule<unknown>[]>();
  for (const rule of unique) {
    const list = byFamily.get(rule.family) ?? [];
    list.push(rule);
    byFamily.set(rule.family, list);
  }
  return {
    rules: unique,
    byFamily,
    candidates(family, text, pos) {
      const all = byFamily.get(family as RuleFamily) ?? [];
      const word = firstWord(text, pos);
      return all.filter((r) => r.leading.length === 0 || r.leading.includes(word));
    },
  };
}

export interface FamilyOptions {
  /** Try only these rule ids (a verb that accepts only some noun phrases). */
  readonly only?: readonly string[];
}

/**
 * "A phrase of this family goes here": tries the rules of the family that can start at the
 * position, in registration order (a rule whose phrase is a prefix of another's comes after it;
 * meta test 1 proves no complete example is read by two rules), and takes the first that
 * matches. The family is recorded for the diagnostic's `slot`.
 */
export function family<T>(name: RuleFamily, options: FamilyOptions = {}): Parser<T> {
  return inFamily(name, (ctx: ParseContext, pos: number): ParseResult<T> => {
    for (const rule of ctx.rules.candidates(name, ctx.text, pos)) {
      if (options.only !== undefined && !options.only.includes(rule.id)) continue;
      const r = rule.parse(ctx, pos);
      if (r.ok) return r as ParseResult<T>;
    }
    return fail(ctx, pos);
  });
}

/** Wraps a parser's value into an IR node: `build(value)` plus the span it read and the rule id. */
export function node<V, N extends { readonly span: Span; readonly rule: string }>(
  id: string,
  parser: Parser<V>,
  build: (value: V) => Omit<N, 'span' | 'rule'>,
): Parser<N> {
  return (ctx, pos) => {
    const r = parser(ctx, pos);
    if (!r.ok) return r;
    const value = { ...build(r.value), span: { start: pos, end: r.pos }, rule: id } as N;
    return { ok: true, value, pos: r.pos };
  };
}

/** The span a parser read, next to its value. */
export function spanned<V>(parser: Parser<V>): Parser<{ value: V; span: Span }> {
  return (ctx, pos) => {
    const r = parser(ctx, pos);
    if (!r.ok) return r;
    return { ok: true, value: { value: r.value, span: { start: pos, end: r.pos } }, pos: r.pos };
  };
}
