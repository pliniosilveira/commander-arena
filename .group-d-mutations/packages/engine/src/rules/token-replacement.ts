/**
 * "If one or more artifact tokens would be created under your control, that many 5/5 red Dragon creature tokens with flying are created instead" and
 * "..., those tokens plus an additional 1/1 colorless Thopter artifact creature token with flying are created instead" (D-219, CR 614.1a, 111.2, 616.1): the
 * replacement effects `tokensInstead` of the permanents on the battlefield, applied to the tokens one creation would make, in the order the player who
 * would create them chooses (D-221).
 *
 * The tokens an effect creates at once are the event (`TokenBatch`: a definition, how many, and whether they are the tokens the effect itself describes).
 * The replacement effects of the permanents the creator controls are read from the battlefield as the event begins. CR 616.1: the player who would create
 * the tokens chooses one to apply, and CR 616.1f: the process is repeated "taking into account only replacement or prevention effects that would now be
 * applicable" until none is left; each applies at most once to the event (CR 614.5) and only when some part of the batch matches what it names. `thatMany`
 * replaces the matching parts with as many tokens of its own, `plus` keeps them and adds one more. The batch a replacement leaves is what the next one looks
 * at, so the artifact tokens of a "plus" can be replaced by a Dragon effect after it (and not before it: Dragons are not artifact tokens).
 *
 * As for damage (`damage-order.ts`, D-191) the player is asked only when the order can change which tokens are made (`orderMatters`, an exact search over the
 * orders): two Draconic Visitors, or two Stridehangar Automatons, end the same in every order and nothing is asked. The answer comes from the `OrderFlow` of the
 * instruction that creates the tokens (the question is returned, with nothing changed, when the flow has no answer left to give, and the instruction runs
 * again from the same state with the answer). With a flow that does not ask, or an event that cannot ask (a token made by a "would die" replacement, the rider
 * of a mana ability), the default order is used: the order that makes the most tokens, the older permanent first on a tie.
 *
 * The tokens a replacement makes are the tokens it describes and nothing more: CR 614.1 says an "instead" effect replaces the event with another, so what the
 * instruction said about the tokens it replaced ("create a tapped Treasure token") does not carry over to the Dragons. A "plus" keeps the original tokens, and
 * with them what the instruction said about them (`original`).
 */
import type { TokenDefinition } from '../ast/types';
import { TOKEN_PRESETS } from '../cards/tokens';
import type { ObjectId, SeatId } from '../ids';
import type {
  ChooseOptionDecision,
  TokenReplacementChoice,
  TokenReplacementQuestion,
} from '../state/decisions';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { copiableValues } from './copiable';
import type { OrderFlow } from './damage-order';
import { derive } from './derive';
import { matchesFilter } from './select';
import { sourceInfo } from './source-info';
import { hypotheticalToken } from './token-object';

/** Some tokens of one definition that would be created together. */
export interface TokenBatch {
  readonly definition: TokenDefinition;
  readonly count: number;
  /** The tokens the instruction itself describes (what it says about them, tapped for one, applies to them): not the ones a replacement effect made. */
  readonly original: boolean;
}

/** A replacement effect that applies to the creation of tokens: one ability of one permanent. */
interface TokenEffect {
  readonly key: string;
  readonly object: ObjectId;
  readonly objectName: string;
  readonly replacement: Extract<
    Extract<import('../ast/types').Ability, { readonly kind: 'replacement' }>['replacement'],
    { readonly kind: 'tokensInstead' }
  >;
}

/** More effects than this on one event and the question is asked without searching (it never skips a question that should be asked). */
const MAX_SEARCHED = 8;

/** False only when the permanent certainly has no `tokensInstead` ability in any layer (its copiable abilities hold none). */
function mayReplaceTokens(
  state: GameState,
  obj: { card: unknown } & Parameters<typeof copiableValues>[1],
): boolean {
  return copiableValues(state, obj).abilities.some(
    (a) => a.kind === 'replacement' && a.replacement.kind === 'tokensInstead',
  );
}

/** The key of an effect: the answer to the question names it, so it must not change between a question and its replay. */
const effectKey = (object: ObjectId, index: number): string => `tokens:${object}:${index}`;

/** The effects of the permanents `seat` controls, oldest permanent first (CR 613.7: by timestamp), in the order of their abilities. */
function tokenEffects(state: GameState, seat: SeatId): readonly TokenEffect[] {
  const found: { readonly timestamp: number; readonly effect: TokenEffect }[] = [];
  for (const id of state.battlefield) {
    const permanent = state.objects[id];
    if (
      permanent === undefined ||
      controllerOf(state, permanent) !== seat ||
      !mayReplaceTokens(state, permanent)
    ) {
      continue;
    }
    const d = derive(state, permanent);
    d.abilities.forEach((ability, index) => {
      if (ability.kind !== 'replacement' || ability.replacement.kind !== 'tokensInstead') return;
      found.push({
        timestamp: permanent.timestamp,
        effect: {
          key: effectKey(id, index),
          object: id,
          objectName: d.name,
          replacement: ability.replacement,
        },
      });
    });
  }
  return found.sort((a, b) => a.timestamp - b.timestamp).map((f) => f.effect);
}

/** The token a `thatMany` or `plus` effect makes; a `double` effect makes none of its own (it makes more of the tokens it names). */
const madeBy = (effect: TokenEffect): TokenDefinition | null => {
  if (effect.replacement.mode === 'double') return null;
  const token = effect.replacement.token;
  return token.kind === 'preset' ? TOKEN_PRESETS[token.preset] : token.definition;
};

/** Whether `effect` applies to the batch as it is now: some part of it is what the effect names (the tokens as they would be on the battlefield). */
function applies(
  state: GameState,
  seat: SeatId,
  batch: readonly TokenBatch[],
  effect: TokenEffect,
): boolean {
  return matching(state, seat, batch, effect).length > 0;
}

function matching(
  state: GameState,
  seat: SeatId,
  batch: readonly TokenBatch[],
  effect: TokenEffect,
): readonly TokenBatch[] {
  const ctx = { controller: seat, source: effect.object };
  return batch.filter(
    (part) =>
      part.count > 0 &&
      matchesFilter(
        state,
        hypotheticalToken(seat, part.definition),
        { ...effect.replacement.what, zone: 'battlefield' },
        ctx,
      ),
  );
}

/** The batch after `effect` is applied (CR 614.1a): the matching tokens replaced, or kept with one more. */
function applyEffect(
  state: GameState,
  seat: SeatId,
  batch: readonly TokenBatch[],
  effect: TokenEffect,
): readonly TokenBatch[] {
  const hit = matching(state, seat, batch, effect);
  // D-378 (CR 614.1a, 614.5): "twice that many of those tokens are created instead": each matching part is made twice over, as it was described.
  if (effect.replacement.mode === 'double') {
    return batch.map((part) => (hit.includes(part) ? { ...part, count: part.count * 2 } : part));
  }
  const made = madeBy(effect);
  if (made === null) return batch;
  if (effect.replacement.mode === 'thatMany') {
    const total = hit.reduce((n, part) => n + part.count, 0);
    return [
      ...batch.filter((part) => !hit.includes(part)),
      { definition: made, count: total, original: false },
    ];
  }
  return [...batch, { definition: made, count: 1, original: false }];
}

const definitionKeys = new WeakMap<TokenDefinition, string>();
const definitionKey = (definition: TokenDefinition): string => {
  let key = definitionKeys.get(definition);
  if (key === undefined) {
    key = JSON.stringify(definition);
    definitionKeys.set(definition, key);
  }
  return key;
};

/** A batch written without ids, so that two orders that make the same tokens give the same text. */
function canonical(batch: readonly TokenBatch[]): string {
  const counts = new Map<string, number>();
  for (const part of batch) {
    if (part.count <= 0) continue;
    const key = `${part.original ? 1 : 0}${definitionKey(part.definition)}`;
    counts.set(key, (counts.get(key) ?? 0) + part.count);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, count]) => `${count}x${key}`)
    .join('|');
}

const totalOf = (batch: readonly TokenBatch[]): number =>
  batch.reduce((n, part) => n + part.count, 0);

/** A position in the process: the batch as it is and the effects already applied. */
interface Position {
  readonly batch: readonly TokenBatch[];
  readonly used: ReadonlySet<string>;
}

/** What the exact search found below a position: how many different results the orders reach and the most tokens any of them makes. */
interface Reach {
  readonly results: ReadonlySet<string>;
  readonly most: number;
}

/** The searches over the orders of the effects of one event. */
class OrderSearch {
  private readonly memo = new Map<string, Reach>();

  private readonly state: GameState;
  private readonly seat: SeatId;
  private readonly effects: readonly TokenEffect[];

  constructor(state: GameState, seat: SeatId, effects: readonly TokenEffect[]) {
    this.state = state;
    this.seat = seat;
    this.effects = effects;
  }

  /** The effects that apply at a position, in the default order: the one that can make the most tokens first, the older first on a tie. */
  options(at: Position): readonly TokenEffect[] {
    const open = this.effects.filter(
      (e) => !at.used.has(e.key) && applies(this.state, this.seat, at.batch, e),
    );
    const scored = open.map((effect, index) => ({
      effect,
      index,
      most: this.reach(this.after(at, effect)).most,
    }));
    return scored.sort((a, b) => b.most - a.most || a.index - b.index).map((s) => s.effect);
  }

  after(at: Position, effect: TokenEffect): Position {
    return {
      batch: applyEffect(this.state, this.seat, at.batch, effect),
      used: new Set([...at.used, effect.key]),
    };
  }

  /** The position after the rest of the effects follow the default order. */
  settle(from: Position): Position {
    let at = from;
    for (;;) {
      const [first] = this.options(at);
      if (first === undefined) return at;
      at = this.after(at, first);
    }
  }

  reach(at: Position): Reach {
    const key = `${[...at.used].sort().join(',')}#${canonical(at.batch)}`;
    const known = this.memo.get(key);
    if (known !== undefined) return known;
    const open = this.effects.filter(
      (e) => !at.used.has(e.key) && applies(this.state, this.seat, at.batch, e),
    );
    let reach: Reach;
    if (open.length === 0) {
      reach = { results: new Set([canonical(at.batch)]), most: totalOf(at.batch) };
    } else {
      const results = new Set<string>();
      let most = 0;
      for (const effect of open) {
        const below = this.reach(this.after(at, effect));
        for (const result of below.results) results.add(result);
        most = Math.max(most, below.most);
      }
      reach = { results, most };
    }
    this.memo.set(key, reach);
    return reach;
  }

  /** Whether the order of the effects that apply at `at` can change which tokens are made. */
  orderMatters(at: Position, openCount: number): boolean {
    if (this.effects.length > MAX_SEARCHED) return openCount > 1;
    return this.reach(at).results.size > 1;
  }
}

/** The tokens of a batch in words: "2 Dragon" for each kind of token. */
export function describeBatch(batch: readonly TokenBatch[]): readonly string[] {
  const counts = new Map<string, number>();
  for (const part of batch) {
    if (part.count <= 0) continue;
    counts.set(part.definition.name, (counts.get(part.definition.name) ?? 0) + part.count);
  }
  return [...counts.entries()].map(([name, count]) => `${count} ${name}`);
}

const effectText = (effect: TokenEffect): string => {
  const made = madeBy(effect);
  if (made === null) return 'Create twice that many of those tokens instead';
  const name = made.name;
  return effect.replacement.mode === 'thatMany'
    ? `Create that many ${name} tokens instead`
    : `Create those tokens plus an additional ${name} token instead`;
};

/** The decision of the question, before the engine gives it its id. */
export type TokenDecision = Omit<ChooseOptionDecision, 'id' | 'replacement'> & {
  readonly replacement: TokenReplacementQuestion;
};

/** What settling the tokens gives: the batch that is created, in the order of the parts. */
export interface TokensSettled {
  readonly kind: 'settled';
  readonly parts: readonly TokenBatch[];
}

/** A question the affected player must answer before the tokens can be created. Nothing was changed. */
export interface TokensAsked {
  readonly kind: 'asked';
  readonly decision: TokenDecision;
}

/**
 * Settles the creation of `parts` under `seat`'s control (the file comment): the replacement effects are applied one at a time, the player choosing the
 * order when it matters. `source` is the spell or ability that creates them, named in the question (null only with a flow that does not ask). Returns the parts as they are, untouched, when no
 * replacement effect applies (the usual case, which costs nothing: the battlefield is looked at only for permanents that could have one).
 */
export function settleTokens(
  state: GameState,
  seat: SeatId,
  source: ObjectId | null,
  parts: readonly TokenBatch[],
  flow: OrderFlow,
): TokensSettled | TokensAsked {
  if (parts.every((part) => part.count <= 0)) return { kind: 'settled', parts };
  const effects = tokenEffects(state, seat);
  if (effects.length === 0) return { kind: 'settled', parts };
  const search = new OrderSearch(state, seat, effects);
  let at: Position = { batch: parts, used: new Set() };
  // Once the order is known not to matter, the rest of the process follows the default order too: every order ends the same.
  let free = false;
  for (;;) {
    const options = search.options(at);
    const [first] = options;
    if (first === undefined) break;
    let pick = first;
    if (options.length > 1 && !free) {
      if (!search.orderMatters(at, options.length)) {
        free = true;
      } else if (flow.ask) {
        const answer = flow.answers[flow.used];
        if (answer === undefined) {
          if (source === null) throw new Error('A creation with no source cannot ask');
          return { kind: 'asked', decision: question(state, seat, source, search, at, options) };
        }
        flow.used += 1;
        // The answer was checked against the options when it was given; the state is the same now, so it is one of them.
        pick = options.find((e) => e.key === answer) ?? first;
      }
    }
    at = search.after(at, pick);
  }
  return { kind: 'settled', parts: at.batch };
}

/** The question for the effects `options` that apply to the batch at `at`: each choice with the tokens made if it goes first and the rest follow the default order. */
function question(
  state: GameState,
  seat: SeatId,
  source: ObjectId,
  search: OrderSearch,
  at: Position,
  options: readonly TokenEffect[],
): TokenDecision {
  const choices: TokenReplacementChoice[] = options.map((effect) => {
    const end = search.settle(search.after(at, effect)).batch;
    return {
      option: effect.key,
      kind: 'tokens',
      text: effectText(effect),
      object: effect.object,
      objectName: effect.objectName,
      outcome: { tokens: describeBatch(end), total: totalOf(end) },
    };
  });
  const info = sourceInfo(state, source);
  return {
    kind: 'chooseOption',
    seat,
    purpose: 'replacement',
    options: options.map((e) => e.key),
    source,
    sourceName: info?.name ?? '',
    sourceOracleText: info?.oracleText ?? '',
    replacement: { tokens: { creator: seat, would: describeBatch(at.batch) }, choices },
  };
}
