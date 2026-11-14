/**
 * A tiny parser-combinator kit for Oracle text rules (M4; M6 grows the rule library on top).
 *
 * A parser reads from a position in the text and either succeeds with a value and the new
 * position, or fails. Every failure records the furthest position any parser reached in the
 * shared context, which is how a rule reports where it stopped (`stoppedAt`) even when a choice
 * backtracked. Matching is case-insensitive for literals because Oracle text capitalizes the
 * first word of a line ("Flying, first strike").
 */

/** A named part that matched: which rule, and where (absolute offsets in the ability text). */
export interface RuleMatch {
  readonly id: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Where a parser finds the rules of a family while it reads (see rules/registry.ts). A context
 * carries one so phrase rules can name a family ("a noun goes here") without importing each other.
 */
export interface RuleLookup {
  candidates(
    family: string,
    text: string,
    pos: number,
  ): readonly { readonly id: string; readonly parse: Parser<unknown> }[];
}

const NO_RULES: RuleLookup = { candidates: () => [] };

export interface ParseContext {
  readonly text: string;
  /** The grammar available to family parsers; empty by default. */
  readonly rules: RuleLookup;
  /** The furthest position at which any parser failed so far. */
  farthest: number;
  /** The innermost `named` parser that got to `farthest` (null when none did). */
  farthestRule: string | null;
  /** The position `farthestRule` was recorded at, so an outer rule never overwrites an inner one. */
  ruleAt: number;
  /** The innermost `named` parser that matched, among those that ended farthest, and where. */
  okRule: string | null;
  okEnd: number;
  /** How deeply nested `farthestRule` and `okRule` were: siblings are as deep as each other. */
  ruleDepth: number;
  okDepth: number;
  /** The nesting of `named` parts being read right now. */
  depth: number;
  /** The innermost `inFamily` slot that failed at `farthest`, and where (like `farthestRule`). */
  farthestSlot: string | null;
  slotAt: number;
  /** The innermost slot that matched, among those that ended farthest, and where. */
  okSlot: string | null;
  okSlotEnd: number;
  /** Every `named` part that matched, in the order they finished (inner parts first). */
  readonly matches: RuleMatch[];
}

/** A fresh context over `text` (the part of the ability a parser may read). */
export function createContext(text: string, rules: RuleLookup = NO_RULES): ParseContext {
  return {
    text,
    rules,
    farthest: 0,
    farthestRule: null,
    ruleAt: -1,
    okRule: null,
    okEnd: -1,
    ruleDepth: -1,
    okDepth: -1,
    depth: 0,
    farthestSlot: null,
    slotAt: -1,
    okSlot: null,
    okSlotEnd: -1,
    matches: [],
  };
}

export type ParseResult<T> = { readonly ok: true; readonly value: T; readonly pos: number } | NotOk;
export interface NotOk {
  readonly ok: false;
}

export type Parser<T> = (ctx: ParseContext, pos: number) => ParseResult<T>;

const FAILED: NotOk = { ok: false };

/** Fails at `pos`, recording it as the furthest position when it is. */
export function fail(ctx: ParseContext, pos: number): NotOk {
  if (pos > ctx.farthest) ctx.farthest = pos;
  return FAILED;
}

/** Matches a fixed string, ignoring case. */
export function literal(expected: string): Parser<string> {
  const lower = expected.toLowerCase();
  return (ctx, pos) => {
    const slice = ctx.text.slice(pos, pos + lower.length);
    if (slice.toLowerCase() === lower) return { ok: true, value: slice, pos: pos + lower.length };
    return fail(ctx, pos);
  };
}

/** Matches a regular expression at the current position (the `y` flag is added for you). */
export function pattern(re: RegExp): Parser<RegExpExecArray> {
  const sticky = new RegExp(re.source, re.flags.includes('y') ? re.flags : `${re.flags}y`);
  return (ctx, pos) => {
    sticky.lastIndex = pos;
    const m = sticky.exec(ctx.text);
    if (m === null) return fail(ctx, pos);
    return { ok: true, value: m, pos: pos + m[0].length };
  };
}

export function map<A, B>(parser: Parser<A>, f: (value: A) => B): Parser<B> {
  return (ctx, pos) => {
    const r = parser(ctx, pos);
    return r.ok ? { ok: true, value: f(r.value), pos: r.pos } : r;
  };
}

type ParserTuple<T extends readonly unknown[]> = { [K in keyof T]: Parser<T[K]> };

/** All parsers in order. */
export function sequence<T extends readonly unknown[]>(...parsers: ParserTuple<T>): Parser<T> {
  return (ctx, start) => {
    const values: unknown[] = [];
    let pos = start;
    for (const p of parsers) {
      const r = p(ctx, pos);
      if (!r.ok) return r;
      values.push(r.value);
      pos = r.pos;
    }
    return { ok: true, value: values as unknown as T, pos };
  };
}

/** The first parser that succeeds. Put longer alternatives first. */
export function choice<T>(...parsers: readonly Parser<T>[]): Parser<T> {
  return (ctx, pos) => {
    for (const p of parsers) {
      const r = p(ctx, pos);
      if (r.ok) return r;
    }
    return fail(ctx, pos);
  };
}

/** Reads `parser`, then the parser `next` builds from its value (a parse that depends on what came before). */
export function chain<A, B>(parser: Parser<A>, next: (value: A) => Parser<B>): Parser<B> {
  return (ctx, pos) => {
    const r = parser(ctx, pos);
    if (!r.ok) return r;
    return next(r.value)(ctx, r.pos);
  };
}

/**
 * Reads like `parser`, but a failure leaves no trace in the diagnostics: the furthest position, the
 * rule and the slot are as they were before it started. For a part that decides whether the rest
 * is worth reading at all: a statement whose subject cannot be read ("Basic landcycling {1}" begins
 * like "Basic lands you control get +1/+1" and stops at "landcycling") was never that statement, so
 * its failure must not become the line's `stoppedAt`.
 */
export function quiet<T>(parser: Parser<T>): Parser<T> {
  return (ctx, pos) => {
    const { farthest, farthestRule, ruleAt, ruleDepth, farthestSlot, slotAt } = ctx;
    const r = parser(ctx, pos);
    if (!r.ok) {
      ctx.farthest = farthest;
      ctx.farthestRule = farthestRule;
      ctx.ruleAt = ruleAt;
      ctx.ruleDepth = ruleDepth;
      ctx.farthestSlot = farthestSlot;
      ctx.slotAt = slotAt;
    }
    return r;
  };
}

/** The parser's value when `accept` says yes; otherwise the parse fails where the parser started. */
export function satisfy<T>(parser: Parser<T>, accept: (value: T) => boolean): Parser<T> {
  return (ctx, pos) => {
    const r = parser(ctx, pos);
    if (!r.ok) return r;
    return accept(r.value) ? r : fail(ctx, pos);
  };
}

/** Zero or more repetitions; never fails. */
export function many<T>(parser: Parser<T>): Parser<T[]> {
  return (ctx, start) => {
    const values: T[] = [];
    let pos = start;
    for (;;) {
      const r = parser(ctx, pos);
      if (!r.ok || r.pos === pos) break;
      values.push(r.value);
      pos = r.pos;
    }
    return { ok: true, value: values, pos };
  };
}

/** The parser's value, or `fallback` (consuming nothing) when it does not match. */
export function optional<T, F>(parser: Parser<T>, fallback: F): Parser<T | F> {
  return (ctx, pos) => {
    const r = parser(ctx, pos);
    return r.ok ? r : { ok: true, value: fallback, pos };
  };
}

/**
 * Gives a part of the grammar a stable name for diagnostics. When the text stops matching, the
 * innermost name that was being read becomes the `closestRule` (for example `spell.destroy`), so a
 * failure points at the clause that was being read and not just at the whole ability. That is a
 * name that failed after getting past its own start, or one that matched right up to the position
 * where the text stopped ("Destroy target creature with flying": `destroy` read everything up to
 * "with"). A name that matched nothing is never reported.
 */
export function named<T>(id: string, parser: Parser<T>): Parser<T> {
  return (ctx, pos) => {
    const before = ctx.farthest;
    const depth = ctx.depth;
    ctx.depth += 1;
    const r = parser(ctx, pos);
    ctx.depth = depth;
    if (r.ok) {
      ctx.matches.push({ id, start: pos, end: r.pos });
      if (r.pos > ctx.okEnd) {
        ctx.okRule = id;
        ctx.okEnd = r.pos;
        ctx.okDepth = depth;
      }
    } else if (ctx.farthest > pos && ctx.farthest > before && ctx.farthest > ctx.ruleAt) {
      ctx.farthestRule = id;
      ctx.ruleAt = ctx.farthest;
      ctx.ruleDepth = depth;
    }
    return r;
  };
}

/**
 * Names the family of grammar a part belongs to ("effect", "noun"), exactly as `named` names a
 * rule: when the text stops matching, the innermost family being read becomes the diagnostic's
 * `slot`. A family that failed after its own start, or matched right up to the stop, is reported;
 * one that matched nothing is not.
 */
export function inFamily<T>(family: string, parser: Parser<T>): Parser<T> {
  return (ctx, pos) => {
    const before = ctx.farthest;
    const r = parser(ctx, pos);
    if (r.ok) {
      if (r.pos > ctx.okSlotEnd) {
        ctx.okSlot = family;
        ctx.okSlotEnd = r.pos;
      }
    } else if (ctx.farthest > before && ctx.farthest > ctx.slotAt) {
      ctx.farthestSlot = family;
      ctx.slotAt = ctx.farthest;
    }
    return r;
  };
}

/**
 * The parser's value when `accept` says yes; otherwise the parse fails at `locate(start, end)`
 * (an offset the rule picks, for example where the offending words began) instead of where the
 * phrase began, so the diagnostic points at the words that were refused.
 */
export function refuseAt<T>(
  parser: Parser<T>,
  accept: (value: T) => boolean,
  locate: (value: T, ctx: ParseContext, start: number, end: number) => number,
): Parser<T> {
  return (ctx, pos) => {
    const r = parser(ctx, pos);
    if (!r.ok) return r;
    return accept(r.value) ? r : fail(ctx, locate(r.value, ctx, pos, r.pos));
  };
}

/** One or more items separated by `separator`. A separator not followed by an item is left unread. */
export function separatedBy1<T>(item: Parser<T>, separator: Parser<unknown>): Parser<T[]> {
  return (ctx, start) => {
    const first = item(ctx, start);
    if (!first.ok) return first;
    const values: T[] = [first.value];
    let pos = first.pos;
    for (;;) {
      const sep = separator(ctx, pos);
      if (!sep.ok) break;
      const next = item(ctx, sep.pos);
      if (!next.ok) break;
      values.push(next.value);
      pos = next.pos;
    }
    return { ok: true, value: values, pos };
  };
}

/** Succeeds only when nothing but whitespace is left. */
export const endOfText: Parser<null> = (ctx, pos) => {
  let p = pos;
  while (p < ctx.text.length && /\s/.test(ctx.text.charAt(p))) p++;
  if (p === ctx.text.length) return { ok: true, value: null, pos: p };
  return fail(ctx, p);
};

export interface RunFailure {
  readonly ok: false;
  /** The furthest position reached. */
  readonly progress: number;
  /** The innermost named part at that position (see `named`), or null. */
  readonly rule: string | null;
  /** The innermost family (see `inFamily`) at that position, or null. */
  readonly slot: string | null;
  /** Rules that matched, ordered by where they start (outer before inner), without repeats. */
  readonly recognised: readonly string[];
}

export interface RunSuccess<T> {
  readonly ok: true;
  readonly value: T;
  /** Rules that matched, ordered by where they start (outer before inner), without repeats. */
  readonly recognised: readonly string[];
}

export type RunResult<T> = RunSuccess<T> | RunFailure;

/** The ids of the rules that matched, outer before inner, each once, none ending after `limit`. */
function recognisedIds(matches: readonly RuleMatch[], limit: number): string[] {
  const sorted = matches
    .filter((m) => m.end <= limit)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const ids: string[] = [];
  for (const m of sorted) if (!ids.includes(m.id)) ids.push(m.id);
  return ids;
}

/**
 * Runs a parser over the part `[start, end)` of `text`, which it must read completely. Offsets in
 * the result (and in everything the parser builds) are absolute in `text`, so a slot of a longer
 * ability keeps its place. The parser cannot read past `end`.
 */
export function runDetailed<T>(
  parser: Parser<T>,
  text: string,
  start = 0,
  end: number = text.length,
  rules?: RuleLookup,
): RunResult<T> {
  const ctx = createContext(text.slice(0, end), rules);
  ctx.farthest = start;
  const r = sequence<[T, null]>(parser, endOfText)(ctx, start);
  if (r.ok) {
    return { ok: true, value: r.value[0], recognised: recognisedIds(ctx.matches, end) };
  }
  // A name that failed at the farthest position is the best answer; otherwise the name that
  // matched up to that position (a space between them does not count: "artifact or" is read as
  // far as "artifact" by the name, and tried one space further by the alternatives).
  const reaches = (okEnd: number) =>
    okEnd >= 0 && okEnd <= ctx.farthest && ctx.text.slice(okEnd, ctx.farthest).trim() === '';
  // A rule that read its phrase right up to the stop beats a sibling that was tried at the same
  // place and failed ("Exile target artifact or enchantment": the permanent phrase matched up to
  // "or", the graveyard phrase failed there for want of "card"), but not a rule that was
  // still reading around it ("Target player discards a card": the player phrase matched,
  // and the rule that wanted a verb after it is the one that failed).
  const failed = ctx.ruleAt === ctx.farthest ? ctx.farthestRule : null;
  const matched = reaches(ctx.okEnd) ? ctx.okRule : null;
  const rule =
    matched !== null && (failed === null || ctx.okDepth <= ctx.ruleDepth)
      ? matched
      : (failed ?? matched);
  const slot = reaches(ctx.okSlotEnd)
    ? ctx.okSlot
    : ctx.slotAt === ctx.farthest
      ? ctx.farthestSlot
      : null;
  return {
    ok: false,
    progress: ctx.farthest,
    rule,
    slot,
    recognised: recognisedIds(ctx.matches, ctx.farthest),
  };
}

/** Runs a parser over the whole text. `progress` is the furthest position reached on failure. */
export function runWhole<T>(
  parser: Parser<T>,
  text: string,
): { ok: true; value: T } | { ok: false; progress: number; rule: string | null } {
  const r = runDetailed(parser, text);
  return r.ok ? { ok: true, value: r.value } : { ok: false, progress: r.progress, rule: r.rule };
}
