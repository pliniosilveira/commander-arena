/**
 * Skeleton plus phrase rules in, IR out (D-063, proposal 3.1): the slots the segmenter found are
 * each read by the rules of their family. Everything here is structure; vocabulary lives in
 * `rules/`. A failure says where reading stopped, which rule and which family were being tried,
 * and which rules had matched before: the diagnostics v2 fields for "unrecognised".
 */
import { type Parser, type RuleLookup, type RunFailure, runDetailed } from './combinators';
import type {
  IrAbility,
  IrBody,
  IrCondition,
  IrCost,
  IrKeyword,
  IrModeHeader,
  IrModes,
  IrRestriction,
  IrSentence,
  IrStatic,
  IrTrigger,
  RuleFamily,
  Span,
} from './ir/types';
import { family } from './rules/registry';
import { type AbilitySkeleton, type FaceKind, segment, splitSentences } from './segment';
import {
  ACTIVATED_SENTENCE,
  LOYALTY_SENTENCE,
  SENTENCE,
  SPELL_SENTENCE,
  TRIGGER_SENTENCE,
} from './sentence';
import { NO_RULE } from './types';

export { NO_RULE };

export interface ParseFailure {
  /** Where reading stopped; 0 when no rule read anything, so the whole text is the leftover. */
  readonly progress: number;
  /** The deepest rule that was being tried, or `none`. */
  readonly closestRule: string;
  /** The family of phrase that was being read, when known. */
  readonly slot: RuleFamily | null;
  /** Rules that matched before the stop, in text order. */
  readonly recognised: readonly string[];
}

export type ParseOutcome =
  | {
      readonly ok: true;
      readonly abilities: readonly IrAbility[];
      /** Rules that matched while reading, in text order. */
      readonly recognised: readonly string[];
    }
  | { readonly ok: false; readonly failure: ParseFailure };

/** The static rules an instant or sorcery's own line can be (a permanent's line tries every one). */
const SPELL_STATICS = [
  'static.self',
  'static.self-cost-reduction',
  // D-1428: "As an additional cost to cast ~, you may sacrifice one or more creatures. When you do, copy ~ for each creature sacrificed this way." is tried first (it starts like the next).
  'static.additional-cost-sacrifice-copies',
  'static.additional-cost',
  'static.free-cast',
] as const;

const FAMILIES: ReadonlySet<string> = new Set([
  'trigger',
  'cost',
  'effect',
  'noun',
  'amount',
  'duration',
  'condition',
  'keyword',
  'static',
  'token',
  'restriction',
  'replacement',
  'modal',
]);

function asFamily(slot: string | null): RuleFamily | null {
  return slot !== null && FAMILIES.has(slot) ? (slot as RuleFamily) : null;
}

function unique(ids: readonly string[]): string[] {
  return ids.filter((id, i) => ids.indexOf(id) === i);
}

/**
 * The failure of a run. `firstSlot` is where the first slot of the reading began (reading no
 * further than that is "read nothing", reported as the whole text); `defaultSlot` the family the
 * caller was filling when the run did not say; `fallback` the rule reported when none was named
 * at the stopping point; `before` the rules that matched in earlier slots.
 */
function failureOf(
  run: RunFailure,
  firstSlot: number,
  defaultSlot: RuleFamily | null,
  fallback: string,
  before: readonly string[],
): ParseFailure {
  const slot = asFamily(run.slot) ?? defaultSlot;
  const recognised = unique([...before, ...run.recognised]);
  // Reading no further than the first slot, with no rule matched before it, is "read nothing".
  if (run.progress <= firstSlot && before.length === 0) {
    return { progress: 0, closestRule: NO_RULE, slot, recognised };
  }
  return { progress: run.progress, closestRule: run.rule ?? fallback, slot, recognised };
}

type Read<T> =
  | { readonly ok: true; readonly value: T; readonly recognised: readonly string[] }
  | { readonly ok: false; readonly failure: ParseFailure };

/** The sentences of a body, each read by the sentence parser; the first failure stops. */
function readBody(
  sk: AbilitySkeleton,
  rules: RuleLookup,
  before: readonly string[],
  fallback: string,
  sentence: Parser<IrSentence> = SENTENCE,
): Read<IrBody> {
  return readSentences(sk.text, sk.sentences, rules, before, fallback, sentence);
}

function readSentences(
  text: string,
  spans: readonly Span[],
  rules: RuleLookup,
  before: readonly string[],
  fallback: string,
  sentence: Parser<IrSentence> = SENTENCE,
): Read<IrBody> {
  const sentences: IrSentence[] = [];
  const seen = [...before];
  for (const span of spans) {
    const run = runDetailed(sentence, text, span.start, span.end, rules);
    if (!run.ok) return { ok: false, failure: failureOf(run, 0, 'effect', fallback, seen) };
    sentences.push(run.value);
    seen.push(...run.recognised);
  }
  const first = sentences[0];
  const last = sentences[sentences.length - 1];
  if (first === undefined || last === undefined) {
    // No sentence at all ("{T}:" and nothing after it): reading stopped at the end.
    const failure = { progress: text.length, closestRule: fallback, slot: 'effect' as const };
    return { ok: false, failure: { ...failure, recognised: unique(seen) } };
  }
  const span = { start: first.span.start, end: last.span.end };
  return {
    ok: true,
    value: { kind: 'body', sentences, span, rule: 'body' },
    recognised: unique(seen),
  };
}

/** Reads the farthest reading's failure: the one that got furthest, a known slot breaking ties. */
function best(failures: readonly ParseFailure[]): ParseFailure {
  let chosen: ParseFailure = { progress: 0, closestRule: NO_RULE, slot: null, recognised: [] };
  for (const failure of failures) {
    const farther = failure.progress > chosen.progress;
    const knowsSlot =
      failure.progress === chosen.progress && chosen.slot === null && failure.slot !== null;
    if (farther || knowsSlot) chosen = failure;
  }
  return chosen;
}

/** "Cure — {0} — ": the name of a mode of a Tiered spell and its cost before the effect (D-433, CR 702.183a, 700.2h); group 1 is the cost, in braces. */
const MODE_COST_LEAD = /^\p{Lu}[\p{L}'’ -]* — ((?:\{[^{}]+\})+) — (?=\S)/u;

/** The symbols of "{3}{W}" as written, without braces; the lowering checks that the engine runs each in a mode cost. */
function modeCostSymbols(braced: string): readonly string[] | null {
  const symbols = [...braced.matchAll(/\{([^{}]+)\}/gu)].map((m) => m[1] ?? '');
  return symbols.length === 0 ? null : symbols;
}

/**
 * The modes of a modal text (stage P19, CR 700.2): the header ("Choose one —") is read by the `modal`
 * rules and each bullet as a spell of its own, sentence by sentence, with the spell sentence reading
 * (an "If ~ was kicked" sentence is read, "you may" is not: a mode has no choice of its own in the
 * engine). The first bullet that does not read stops the whole text, and the failure says where in
 * that bullet (never earlier than its first word, so the diagnostic names the mode).
 */
function readModes(
  sk: AbilitySkeleton,
  rules: RuleLookup,
  before: readonly string[],
): Read<IrModes> {
  const headerSpan = sk.modalHeader ?? { start: 0, end: 0 };
  const header = runDetailed(
    family<IrModeHeader>('modal'),
    sk.text,
    headerSpan.start,
    headerSpan.end,
    rules,
  );
  if (!header.ok) {
    return { ok: false, failure: failureOf(header, 0, 'modal', 'modal.choose', before) };
  }
  const seen = unique([...before, ...header.recognised]);
  const bodies: IrBody[] = [];
  const texts: string[] = [];
  const costs: (readonly string[])[] = [];
  for (const mode of sk.modes) {
    // Tiered (D-433, CR 702.183a, 700.2h): "Cure — {0} — Target permanent ...": the name and the cost of the mode come off the bullet, the cost is kept.
    let from = mode.start;
    if (header.value.costed === true) {
      const lead = MODE_COST_LEAD.exec(sk.text.slice(mode.start, mode.end));
      const symbols = lead === null ? null : modeCostSymbols(lead[1] ?? '');
      if (lead === null || symbols === null) {
        const failure = {
          progress: mode.start,
          closestRule: header.value.rule,
          slot: 'modal' as const,
        };
        return { ok: false, failure: { ...failure, recognised: seen } };
      }
      costs.push(symbols);
      from = mode.start + lead[0].length;
    }
    const sentences = splitSentences(sk.text, from, mode.end);
    const body = readSentences(sk.text, sentences, rules, seen, 'modal.choose', SPELL_SENTENCE);
    if (!body.ok) return body;
    seen.push(...body.recognised);
    bodies.push(body.value);
    texts.push(sk.text.slice(mode.start, mode.end));
  }
  const last = sk.modes[sk.modes.length - 1] ?? headerSpan;
  const modes: IrModes = {
    choose: header.value.choose,
    modes: bodies,
    texts,
    ...(header.value.costed === true ? { costs } : {}),
    span: { start: headerSpan.start, end: last.end },
    rule: header.value.rule,
  };
  return { ok: true, value: modes, recognised: unique(seen) };
}

/** A modal spell, whole: "Choose one —" and its bullets. Only an instant or sorcery has one. */
function readModal(sk: AbilitySkeleton, rules: RuleLookup): ParseOutcome {
  const modes = readModes(sk, rules, []);
  if (!modes.ok) return modes;
  if (sk.face !== 'spell') {
    // A permanent's text has no spell to give modes to: read, and not run (the segmenter's modal head
    // for a permanent face is a line like "Choose one —" with nothing to cast).
    const failure = { progress: 0, closestRule: modes.value.rule, slot: 'modal' as const };
    return { ok: false, failure: { ...failure, recognised: modes.recognised } };
  }
  const ability: IrAbility = { ...modes.value, kind: 'modal' };
  return { ok: true, abilities: [ability], recognised: modes.recognised };
}

/** The body of a modal ability: no sentences, its effects are in the modes. */
function emptyBody(modes: IrModes, recognised: readonly string[]): Read<IrBody> {
  const value: IrBody = { kind: 'body', sentences: [], span: modes.span, rule: 'body' };
  return { ok: true, value, recognised };
}

function readOther(sk: AbilitySkeleton, rules: RuleLookup): ParseOutcome {
  const failures: ParseFailure[] = [];
  const end = sk.text.length;
  const keyword = runDetailed(family<readonly IrKeyword[]>('keyword'), sk.text, 0, end, rules);
  if (keyword.ok) return { ok: true, abilities: keyword.value, recognised: keyword.recognised };
  failures.push(failureOf(keyword, 0, keyword.progress > 0 ? 'keyword' : null, 'keyword.line', []));
  if (sk.face === 'spell') {
    const body = readBody(sk, rules, [], 'spell.effect', SPELL_SENTENCE);
    if (body.ok) {
      const spell: IrAbility = {
        kind: 'spell',
        body: body.value,
        span: body.value.span,
        rule: 'spell.effect',
      };
      return { ok: true, abilities: [spell], recognised: body.recognised };
    }
    // The statements an instant or sorcery has about itself: "This spell can't be countered." (CR
    // 113.6g), "This spell costs {1} less to cast for each ..." (CR 113.6d), "As an additional cost to
    // cast this spell, ..." (CR 118.8) and "If you control a commander, you may cast this spell
    // without paying its mana cost." (CR 118.9). Tried after the spell text so that every other
    // line keeps the diagnostic it had.
    const own = runDetailed(
      family<IrStatic>('static', { only: SPELL_STATICS }),
      sk.text,
      0,
      end,
      rules,
    );
    if (own.ok) {
      const s = own.value;
      const ability: IrAbility = { kind: 'static', statement: s, span: s.span, rule: s.rule };
      return { ok: true, abilities: [ability], recognised: own.recognised };
    }
    failures.push(body.failure, failureOf(own, 0, null, NO_RULE, []));
  } else {
    const statement = runDetailed(family<IrStatic>('static'), sk.text, 0, end, rules);
    if (statement.ok) {
      const s = statement.value;
      const ability: IrAbility = { kind: 'static', statement: s, span: s.span, rule: s.rule };
      return { ok: true, abilities: [ability], recognised: statement.recognised };
    }
    failures.push(failureOf(statement, 0, null, NO_RULE, []));
  }
  return { ok: false, failure: best(failures) };
}

function readReplacement(sk: AbilitySkeleton, rules: RuleLookup): ParseOutcome {
  const run = runDetailed(family<IrAbility>('replacement'), sk.text, 0, sk.text.length, rules);
  if (run.ok) return { ok: true, abilities: [run.value], recognised: run.recognised };
  const failure = failureOf(run, 0, 'replacement', NO_RULE, []);
  // A line of two replacement effects, one sentence each ("~ enters tapped. As it enters, choose a
  // color.", stage P15): each sentence is read by the replacement rules, and every one must read. A
  // line that stops anywhere keeps the failure of the whole-line reading.
  const sentences = splitSentences(sk.text, 0, sk.text.length);
  if (sentences.length < 2) return { ok: false, failure };
  const abilities: IrAbility[] = [];
  const seen: string[] = [];
  for (const span of sentences) {
    const one = runDetailed(family<IrAbility>('replacement'), sk.text, span.start, span.end, rules);
    if (!one.ok) return { ok: false, failure };
    abilities.push(one.value);
    seen.push(...one.recognised);
  }
  return { ok: true, abilities, recognised: unique(seen) };
}

function readActivated(sk: AbilitySkeleton, rules: RuleLookup): ParseOutcome {
  const costs: IrCost[] = [];
  const seen: string[] = [];
  for (const span of sk.costs) {
    const run = runDetailed(family<IrCost>('cost'), sk.text, span.start, span.end, rules);
    if (!run.ok)
      return { ok: false, failure: failureOf(run, 0, 'cost', 'ability.activated', seen) };
    costs.push(run.value);
    seen.push(...run.recognised);
  }
  let modal: IrModes | undefined;
  let body: Read<IrBody>;
  if (sk.modes.length > 0) {
    // "{2}, {T}: Choose one —" and its bullets (CR 700.2a): the effects are in the modes.
    const modes = readModes(sk, rules, seen);
    if (!modes.ok) return modes;
    modal = modes.value;
    body = emptyBody(modes.value, modes.recognised);
  } else {
    // CR 606.2 (stage P47, D-202): the body of a loyalty ability reads the choices of a triggered ability's.
    const sentence = costs.some((c) => c.kind === 'loyalty')
      ? LOYALTY_SENTENCE
      : ACTIVATED_SENTENCE;
    body = readBody(sk, rules, seen, 'ability.activated', sentence);
  }
  if (!body.ok) return body;
  seen.push(...body.recognised);
  const restrictions: IrRestriction[] = [];
  for (const span of sk.restrictions) {
    const run = runDetailed(
      family<IrRestriction>('restriction'),
      sk.text,
      span.start,
      span.end,
      rules,
    );
    if (!run.ok) {
      const failure = failureOf(run, span.start, 'restriction', 'ability.activated', seen);
      return { ok: false, failure };
    }
    restrictions.push(run.value);
    seen.push(...run.recognised);
  }
  const first = sk.costs[0] ?? { start: 0, end: 0 };
  const ability: IrAbility = {
    kind: 'activated',
    costs,
    body: body.value,
    ...(modal === undefined ? {} : { modal }),
    restrictions,
    span: { start: first.start, end: body.value.span.end },
    rule: 'ability.activated',
  };
  return { ok: true, abilities: [ability], recognised: unique(seen) };
}

function readTriggered(sk: AbilitySkeleton, rules: RuleLookup): ParseOutcome {
  const slot = sk.trigger ?? { start: 0, end: sk.text.length };
  const trigger = runDetailed(family<IrTrigger>('trigger'), sk.text, slot.start, slot.end, rules);
  if (!trigger.ok) {
    return {
      ok: false,
      failure: failureOf(trigger, slot.start, 'trigger', 'ability.triggered', []),
    };
  }
  const seen = [...trigger.recognised];
  // "At" goes with the beginning of a step and nothing else does (CR 603.2b): "At ~ enters" and
  // "Whenever the beginning of your upkeep" are not Oracle text, and are not guessed at.
  const word =
    sk.triggerWord === undefined ? '' : sk.text.slice(sk.triggerWord.start, sk.triggerWord.end);
  const isStep = ['upkeep', 'endStep', 'step'].includes(trigger.value.event);
  if (/^at$/i.test(word) !== isStep) {
    const mismatch = {
      progress: slot.start,
      closestRule: trigger.value.rule,
      slot: 'trigger' as const,
      recognised: unique(seen),
    };
    return { ok: false, failure: mismatch };
  }
  let interveningIf: IrCondition | undefined;
  if (sk.interveningIf !== undefined) {
    // The segmenter's span starts at "if" (CR 603.4); the condition rules read what follows it.
    const { end } = sk.interveningIf;
    const start =
      sk.interveningIf.start +
      (/^if\s+/i.exec(sk.text.slice(sk.interveningIf.start))?.[0].length ?? 0);
    const cond = runDetailed(family<IrCondition>('condition'), sk.text, start, end, rules);
    if (!cond.ok) {
      return { ok: false, failure: failureOf(cond, 0, 'condition', 'ability.triggered', seen) };
    }
    interveningIf = cond.value;
    seen.push(...cond.recognised);
  }
  let modal: IrModes | undefined;
  let body: Read<IrBody>;
  if (sk.modes.length > 0) {
    // "When ~ enters, choose one —" and its bullets (CR 700.2b): the effects are in the modes.
    const modes = readModes(sk, rules, seen);
    if (!modes.ok) return modes;
    modal = modes.value;
    body = emptyBody(modes.value, modes.recognised);
  } else {
    body = readBody(sk, rules, seen, 'ability.triggered', TRIGGER_SENTENCE);
  }
  if (!body.ok) return body;
  const ability: IrAbility = {
    kind: 'triggered',
    trigger: trigger.value,
    ...(interveningIf === undefined ? {} : { interveningIf }),
    body: body.value,
    ...(modal === undefined ? {} : { modal }),
    span: { start: slot.start, end: body.value.span.end },
    rule: 'ability.triggered',
  };
  return { ok: true, abilities: [ability], recognised: unique([...seen, ...body.recognised]) };
}

/**
 * "• Khans — At the beginning of your upkeep, ..." (stage P34, D-152, CR 607.2d): the ability is linked to the option the permanent chose,
 * which the engine reads for a triggered ability only; any other kind of ability under a name is read and not run.
 */
function withOption(outcome: ParseOutcome, option: string): ParseOutcome {
  if (!outcome.ok) return outcome;
  const abilities: IrAbility[] = [];
  for (const ability of outcome.abilities) {
    if (ability.kind !== 'triggered') {
      const failure = { progress: 0, closestRule: ability.rule, slot: null, recognised: [] };
      return { ok: false, failure: { ...failure, recognised: outcome.recognised } };
    }
    abilities.push({ ...ability, option });
  }
  return { ok: true, abilities, recognised: outcome.recognised };
}

/** Reads one ability line's skeleton into IR with the rules of `rules`. */
export function parseAbility(sk: AbilitySkeleton, rules: RuleLookup): ParseOutcome {
  const outcome = readHead(sk, rules);
  return sk.option === undefined ? outcome : withOption(outcome, sk.option);
}

function readHead(sk: AbilitySkeleton, rules: RuleLookup): ParseOutcome {
  switch (sk.head) {
    case 'replacement':
      return readReplacement(sk, rules);
    case 'activated':
      return readActivated(sk, rules);
    case 'triggered':
      return readTriggered(sk, rules);
    case 'modal':
      return readModal(sk, rules);
    case 'other':
      return readOther(sk, rules);
  }
}

/** Convenience: segment and read a normalized line. */
export function readLine(text: string, face: FaceKind, rules: RuleLookup): ParseOutcome {
  return parseAbility(segment(text, face), rules);
}
