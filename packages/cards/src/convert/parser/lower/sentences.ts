/**
 * The sentences of a body (a spell's text or a triggered ability's effect) to engine effects, in
 * text order (CR 608.2c). A plain sentence lowers its clauses. "If ~ was kicked, ..." lowers to a
 * `conditional` effect, which the engine evaluates as that instruction runs. "If ~ was kicked, ...
 * instead." replaces the sentence before it, so the two become one `conditional` whose else branch
 * is the earlier sentence (CR 614.1a: "instead" replaces an event); the earlier sentence is
 * replaced as a whole, so it must be one instruction, and what is dropped when the condition holds
 * must be everything it said.
 */
import type { Cost, Effect } from '@commander-arena/engine';
import {
  type IrAmount,
  type IrArg,
  type IrClause,
  type IrNoun,
  type IrSentence,
  isIrAmount,
} from '../ir/types';
import { CREATURE_TYPES } from '../rules/noun/creature-types';
import { lowerAmount } from './amounts';
import { amountArg, type Effects } from './clauses';
import { lowerCondition } from './conditions';
import { lowerCost } from './costs';
import { lowerClause } from './effects';
import { type FeatureRef, missingFeatures } from './features';
import { playerSelectorOf } from './nouns';
import type { LowerContext, LowerFailure, LowerResult } from './types';

/**
 * What a conditional sentence needs from the engine (the condition names its own features), and the
 * "unless a player pays" sentence (stage P18, D-111): the engine's `unlessPays` with a mana cost.
 */
export const SENTENCE_NEEDS: readonly FeatureRef[] = [
  'effect:conditional',
  'effect:unlessPays',
  'cost:mana',
  // D-135: "you may ... If you do", "When you do".
  'effect:may',
  'effect:reflexive',
];

/**
 * In a reflexive ability of a trigger about ~ itself, "it deals 2 damage" is the damage of the ability's own source (stage P34, D-152): the engine's
 * `triggerSubject` names the object of the trigger's event, which a reflexive ability does not have (`validateCard`), and the source it has already is
 * that object. Only a damage effect that names `triggerSubject` as its source, in the effects a reflexive ability can hold.
 */
function ownSource(effect: Effect, ctx: LowerContext): Effect {
  if (!ctx.itIsSelf) return effect;
  switch (effect.kind) {
    case 'dealDamage': {
      if (effect.from?.kind !== 'triggerSubject') return effect;
      const { from, ...rest } = effect;
      void from;
      return rest;
    }
    case 'sequence':
      return { ...effect, effects: effect.effects.map((e) => ownSource(e, ctx)) };
    default:
      return effect;
  }
}

/** One effect for a list: a single one stays bare, several are a sequence. */
function oneEffect(effects: readonly Effect[]): Effect {
  const [only] = effects;
  return effects.length === 1 && only !== undefined
    ? only
    : { kind: 'sequence', effects: [...effects] };
}

/**
 * Remembers the targets an effect sends out of the battlefield, so a later "it" is not read as the
 * permanent it was: a destroyed, exiled, sacrificed or returned target is a new object (CR 400.7).
 */
function noteRemoved(effects: readonly Effect[], ctx: LowerContext): void {
  for (const effect of effects) {
    const objects =
      effect.kind === 'destroy' || effect.kind === 'exile' || effect.kind === 'counter'
        ? effect.objects
        : effect.kind === 'sacrifice' || effect.kind === 'moveToZone'
          ? effect.objects
          : undefined;
    if (objects?.kind === 'target') ctx.removed.add(objects.id);
  }
}

/**
 * What "it" means after a move (stage P30, D-135): once a target was returned to the battlefield it is a new object (CR 400.7), which
 * the engine names `moved` for the instructions that follow ("Return target creature card from your graveyard to the battlefield. If
 * it's an Angel, put two +1/+1 counters on it."). Any other move, destroy or exile of the text replaces what `moved` is.
 */
function noteMoved(effects: readonly Effect[], ctx: LowerContext): void {
  for (const effect of effects) {
    if (effect.kind !== 'moveToZone' && effect.kind !== 'destroy' && effect.kind !== 'exile') {
      continue;
    }
    ctx.searched = null;
    ctx.exiledRef =
      effect.kind === 'exile' && effect.objects.kind === 'target' ? effect.objects.id : null;
    ctx.movedOnto =
      effect.kind === 'moveToZone' &&
      effect.to === 'battlefield' &&
      effect.objects.kind === 'target'
        ? effect.objects.id
        : null;
  }
}

/**
 * What "those creatures" means after "For each creature your opponents control, create a 4/4 ... token." (stage P32, D-147, CR 608.2c): the
 * creatures counted by the token's count, until any other instruction is lowered.
 */
function noteCreated(effects: readonly Effect[], ctx: LowerContext): void {
  const [only, ...more] = effects;
  ctx.createdPer =
    only?.kind === 'createToken' &&
    more.length === 0 &&
    typeof only.count === 'object' &&
    only.count.kind === 'countOf'
      ? only.count.filter
      : null;
}

/**
 * "~ gets +X/+0 until end of turn and deals X damage to ..." (stage P31, D-140): an instruction with no subject of its own
 * (`elliptical`) has the subject of the instruction before it in the same sentence, which must be `~` (the default source of the
 * damage); after anything else, or first in its sentence, it is not lowered.
 */
function ellipsisIsSelf(clauses: readonly IrClause[], i: number): boolean {
  const before = clauses[i - 1];
  const objects = before?.args.objects;
  return (
    before?.connector === 'and' &&
    objects?.kind === 'noun' &&
    (objects.det === 'self' || objects.ref === 'self')
  );
}

/**
 * "~ deals 4 damage to any target and 3 damage to each of up to two other targets" (stage P34, D-152): the second damage has no subject; its
 * source is that of the damage before it in the same sentence, which must be the ability's own (a damage that names no source).
 */
function sameSourceHolds(clauses: readonly IrClause[], i: number): boolean {
  const before = clauses[i - 1];
  const source = before?.args.source;
  // "~ deals ..." names none, "it deals ..." names `~` itself.
  const own = source === undefined || (source.kind === 'noun' && source.ref === 'self');
  return before?.connector === 'and' && before.verb === 'dealDamage' && own;
}

/**
 * What "that token" means after "Create a 1/1 colorless Thopter artifact creature token with flying." (stage P48, D-205, CR 111.2, 400.7j): the one token
 * a `createToken` instruction made, the engine's `moved`, until an instruction that moves or makes other objects is lowered.
 */
function noteMadeToken(clause: IrClause, effects: readonly Effect[], ctx: LowerContext): void {
  const token = clause.args.token;
  if (clause.verb === 'createToken' && token?.kind === 'token' && effects.length === 1) {
    ctx.madeToken = token.ref ?? null;
    return;
  }
  const MOVES = ['moveToZone', 'destroy', 'exile', 'sacrifice', 'createToken'];
  if (effects.some((e) => MOVES.includes(e.kind))) ctx.madeToken = null;
}

function lowerClauses(clauses: readonly IrClause[], ctx: LowerContext): LowerResult<Effects> {
  const effects: Effect[] = [];
  for (const [i, clause] of clauses.entries()) {
    if (clause.args.elliptical !== undefined && !ellipsisIsSelf(clauses, i)) {
      return { ok: false, needs: [], at: clause.span, rule: clause.rule };
    }
    if (clause.args.sameSource !== undefined && !sameSourceHolds(clauses, i)) {
      return { ok: false, needs: [], at: clause.span, rule: clause.rule };
    }
    const lowered = lowerClause(clause, ctx);
    if (!lowered.ok) return lowered;
    effects.push(...lowered.value);
    noteRemoved(lowered.value, ctx);
    if (lowered.value.some((e) => e.kind === 'createToken')) ctx.madeAToken = true;
    noteMoved(lowered.value, ctx);
    noteCreated(lowered.value, ctx);
    noteMadeToken(clause, lowered.value, ctx);
  }
  return { ok: true, value: effects, rule: clauses[0]?.rule ?? 'body.sentence' };
}

/** A sentence's failure, blamed on the first rule it used and pointing at the whole sentence. */
function refuse(sentence: IrSentence): LowerFailure {
  return {
    ok: false,
    needs: [],
    at: sentence.span,
    rule: sentence.clauses[0]?.rule ?? sentence.rule,
  };
}

/**
 * "Draw a card unless that player pays {1}" (stage P18, CR 118.12a): the engine's `unlessPays`. The
 * payer is a player the engine can name ("you", or "that player" of a trigger that names one, see
 * `LowerContext.thatPlayer`); "you may" before the instruction is the node's `optional`, asked after
 * the payment question. The cost is the mana the text names. It follows exactly one clause and no
 * "if ~ was kicked" condition.
 */
function lowerUnless(sentence: IrSentence, ctx: LowerContext): LowerResult<Effects> | null {
  const [clause, ...more] = sentence.clauses;
  const test = clause?.condition?.test;
  if (clause === undefined || test?.kind !== 'unlessPays') return null;
  if (more.length > 0 || sentence.condition !== undefined) return refuse(sentence);
  const blocked = missingFeatures(['effect:unlessPays', 'cost:mana']);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  const { condition: _unless, ...instruction } = clause;
  void _unless;
  const body = lowerClauses([{ ...instruction, optional: false }], ctx);
  if (!body.ok) return body;
  const player = playerSelectorOf(test.who, ctx);
  if (!player.ok) return player;
  const cost: Cost[] = [];
  for (const item of test.cost) {
    const lowered = lowerCost(item, { unless: true });
    if (!lowered.ok) return lowered;
    cost.push(lowered.value);
  }
  const effect: Effect = {
    kind: 'unlessPays',
    player: player.value,
    cost,
    effect: oneEffect(body.value),
    ...(clause.optional ? { optional: true as const } : {}),
  };
  return { ok: true, value: [effect], rule: clause.rule };
}

/**
 * "Sacrifice it unless you return an untapped Plains you control to its owner's hand" (Karoo, D-258, CR 118.12a): "[Do something] unless [a player does
 * something else]" means "[A player may do something else]. If [that player doesn't], [do something]", so the engine's `may` of the return (a choice among the
 * matching permanents the controller controls, asked only when there is one: nothing that cannot be done is offered, CR 608.2d) and a `conditional` on "not
 * `didPrevious`" for the instruction. It follows exactly one clause that is not itself optional; the offered clause must lower to the choosing return of one
 * permanent to its owner's hand, anything else is refused (never lowered as if the clause were unconditional).
 */
function lowerUnlessReturn(sentence: IrSentence, ctx: LowerContext): LowerResult<Effects> | null {
  const [clause, ...more] = sentence.clauses;
  const test = clause?.condition?.test;
  if (clause === undefined || test?.kind !== 'unlessReturn') return null;
  if (more.length > 0 || sentence.condition !== undefined || clause.optional) {
    return refuse(sentence);
  }
  const blocked = missingFeatures([
    'effect:may',
    'effect:conditional',
    'condition:didPrevious',
    'condition:not',
  ]);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  const { condition: _unless, ...instruction } = clause;
  void _unless;
  const offered = lowerClauses([{ ...test.clause, optional: false }], ctx);
  if (!offered.ok) return offered;
  const [offer, ...rest] = offered.value;
  if (
    rest.length > 0 ||
    offer?.kind !== 'moveToZone' ||
    offer.to !== 'hand' ||
    offer.objects.kind !== 'choose'
  ) {
    return refuse(sentence);
  }
  const body = lowerClauses([instruction], ctx);
  if (!body.ok) return body;
  return {
    ok: true,
    value: [
      { kind: 'may', effect: offer },
      {
        kind: 'conditional',
        condition: { kind: 'not', term: { kind: 'didPrevious' } },
        effect: oneEffect(body.value),
      },
    ],
    rule: clause.rule,
  };
}

/** "it deals 4 damage": a damage clause that names no recipient (`effect.damage-it`). */
function isRecipientless(clause: IrClause): boolean {
  return clause.verb === 'dealDamage' && clause.args.to === undefined;
}

interface Step {
  readonly effects: readonly Effect[];
  /** An unconditional sentence of one instruction: what an "instead" sentence can replace. */
  readonly replaceable: boolean;
  /** The target slots (`ctx.targets[from]` up to `to`) the sentence of a replaceable step declared (stage P38, D-182). */
  readonly slots?: readonly [number, number];
}

/** Whether an effect (any JSON) names the target slot `id`. */
function mentionsSlot(node: unknown, id: string): boolean {
  if (Array.isArray(node)) return node.some((n) => mentionsSlot(n, id));
  if (node === null || typeof node !== 'object') return false;
  const record = node as Record<string, unknown>;
  if (record.kind === 'target' && record.id === id) return true;
  return Object.values(record).some((n) => mentionsSlot(n, id));
}

/**
 * "Exile target artifact or enchantment. If this spell was kicked, exile target nonland permanent instead." (stage P38, D-182, CR 702.33g, 601.2c): the
 * targets a spell's kicked sentence declares are chosen only if it was kicked (`ifKicked`); the targets of the sentence it replaces, when the
 * replacement does not use them, only if it was not (`unlessKicked`: "alternative targets"). A target the replacement names again ("deals 4 damage to
 * it instead") is chosen either way. Only for a spell's own text: the targets of an ability are chosen as it triggers, whatever its condition says.
 */
function markKickedTargets(
  ctx: LowerContext,
  declared: readonly [number, number],
  replaced: Step | undefined,
  replacement: readonly Effect[] | null,
): boolean {
  if (ctx.owner !== 'spell') return false;
  let marked = false;
  for (let k = declared[0]; k < declared[1]; k += 1) {
    const spec = ctx.targets[k];
    if (spec === undefined) continue;
    ctx.targets[k] = { ...spec, ifKicked: true };
    marked = true;
  }
  if (replacement === null || replaced?.slots === undefined) return marked;
  for (let k = replaced.slots[0]; k < replaced.slots[1]; k += 1) {
    const spec = ctx.targets[k];
    if (spec !== undefined && !mentionsSlot(replacement, spec.id)) {
      ctx.targets[k] = { ...spec, unlessKicked: true };
      marked = true;
    }
  }
  return marked;
}

/**
 * "Destroy target creature. It can't be regenerated." (CR 701.19c, 608.2c: later text may change the
 * meaning of earlier text, stage P21): the sentence is not an instruction of its own, it sets the engine's
 * `cantBeRegenerated` on the destroy right before it. That destroy is the one clause of the sentence before,
 * named by one operand, and the pronoun agrees with it in number ("it" a single object, "they" several; "a
 * creature destroyed this way" fits either). Anywhere else the sentence has nothing to attach to and is
 * not lowered.
 */
function lowerCantBeRegenerated(
  sentence: IrSentence,
  before: IrSentence | undefined,
  previous: Step | undefined,
): LowerResult<Effects> | null {
  const [clause, ...more] = sentence.clauses;
  if (clause?.verb !== 'cantBeRegenerated') return null;
  if (more.length > 0 || clause.optional || sentence.condition !== undefined) {
    return refuse(sentence);
  }
  if (clause.condition !== undefined || clause.duration !== undefined) return refuse(sentence);
  const [destroy, ...others] = before?.clauses ?? [];
  const objects = destroy?.args.objects;
  const [effect, ...rest] = previous?.effects ?? [];
  if (destroy?.verb !== 'destroy' || others.length > 0 || objects?.kind !== 'noun') {
    return refuse(sentence);
  }
  if (before?.condition !== undefined || destroy.condition !== undefined || destroy.optional) {
    return refuse(sentence);
  }
  if (effect?.kind !== 'destroy' || rest.length > 0) return refuse(sentence);
  const plural = clause.args.plural;
  if (plural?.kind === 'flag' && plural.value !== objects.plural) return refuse(sentence);
  const blocked = missingFeatures(['effect:destroy']);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  return { ok: true, value: [{ ...effect, cantBeRegenerated: true }], rule: clause.rule };
}

/** The effects a compound effect holds, each list being a sequence of its own. */
function nestedLists(effect: Effect): readonly (readonly Effect[])[] {
  switch (effect.kind) {
    case 'sequence':
      return [effect.effects];
    case 'conditional':
      return effect.else === undefined ? [[effect.effect]] : [[effect.effect], [effect.else]];
    case 'mayPay':
    case 'unlessPays':
      return [[effect.effect]];
    default:
      return [];
  }
}

/**
 * CR 702.101a: "you gain life equal to the total life lost this way" reads what the `loseLife` before it in
 * the same sequence lost, which is how the engine's `lifeLostThisWay` works (`validateCard` refuses it
 * elsewhere). True when every such amount has a `loseLife` earlier in its own list of effects; a compound
 * effect is a list of its own, so a loss outside of it does not count inside it.
 */
function lossReadsAreOrdered(effects: readonly Effect[]): boolean {
  let lost = false;
  for (const effect of effects) {
    if (effect.kind === 'loseLife') lost = true;
    const amount = effect.kind === 'gainLife' ? effect.amount : null;
    if (typeof amount === 'object' && amount !== null && amount.kind === 'lifeLostThisWay') {
      if (!lost) return false;
    }
    if (!nestedLists(effect).every(lossReadsAreOrdered)) return false;
  }
  return true;
}

/**
 * "You may pay {4}. If you do, untap ~." (CR 118.3, 608.2c, stage P21): the offer and the sentence after it
 * are one engine `mayPay`, the question asked as the ability resolves and the effect run only when the cost was
 * paid. The offer is one `pay` clause that "you may" made optional, followed by a sentence whose condition is
 * "if you do"; the effect is that sentence's clauses, none of them optional (the engine's `mayPay` has one
 * question). A payment with nothing after it, and an "If you do" with no payment, are refused. The cost is
 * mana (hybrid symbols too, CR 107.4e) or life, which the engine pays for a `mayPay`.
 */
function lowerMayPay(
  sentence: IrSentence,
  next: IrSentence | undefined,
  ctx: LowerContext,
): LowerResult<Effects> | null {
  const [clause, ...more] = sentence.clauses;
  if (clause?.verb !== 'pay') return null;
  const offer = clause.args.cost;
  if (
    more.length > 0 ||
    !clause.optional ||
    clause.condition !== undefined ||
    clause.duration !== undefined ||
    sentence.condition !== undefined ||
    offer?.kind !== 'costList'
  ) {
    return refuse(sentence);
  }
  if (next?.condition?.test.kind !== 'didPrevious' || next.instead === true) {
    return refuse(sentence);
  }
  if (next.clauses.some((c) => c.optional)) return refuse(next);
  const cost: Cost[] = [];
  for (const item of offer.costs) {
    const lowered = lowerCost(item, { hybrid: true });
    if (!lowered.ok) return lowered;
    cost.push(lowered.value);
  }
  const needs: FeatureRef[] = ['effect:mayPay', ...cost.map((c): FeatureRef => `cost:${c.kind}`)];
  const blocked = missingFeatures(needs);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  const inner = lowerClauses(next.clauses, ctx);
  if (!inner.ok) return inner;
  if (!lossReadsAreOrdered(inner.value)) return refuse(next);
  return {
    ok: true,
    value: [{ kind: 'mayPay', cost, effect: oneEffect(inner.value) }],
    rule: clause.rule,
  };
}

/**
 * "You may pay any amount of {R}. When you do, it deals that much damage to any target." (stage P34, D-152, CR 603.12, 118.1): the offer and the
 * reflexive ability after it are one engine `payAnyAmount` of the mana symbol; the player chooses how many times to pay it, and when they paid
 * at least once the reflexive ability goes on the stack with its own targets, `triggerDamage` being the number they paid. The offer is one
 * clause that "you may" made optional; the sentence after it is "When you do," and is the last of the body. Null when the sentence is not such
 * an offer; one that does not fit is refused, never guessed.
 */
function lowerPayAnyAmount(
  sentence: IrSentence,
  sentences: readonly IrSentence[],
  i: number,
  ctx: LowerContext,
): LowerResult<Effects> | null {
  const [clause, ...more] = sentence.clauses;
  if (clause?.verb !== 'payAnyAmount') return null;
  const next = sentences[i + 1];
  const mana = clause.args.mana;
  if (
    more.length > 0 ||
    !clause.optional ||
    clause.condition !== undefined ||
    clause.duration !== undefined ||
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    sentence.reflexive === true ||
    mana?.kind !== 'manaSpec' ||
    mana.what.kind !== 'symbols' ||
    mana.what.symbols.length !== 1 ||
    next?.reflexive !== true ||
    next.condition !== undefined ||
    next.where !== undefined ||
    next.instead === true ||
    next.clauses.some((c) => c.optional) ||
    i + 2 < sentences.length
  ) {
    return refuse(sentence);
  }
  const blocked = missingFeatures(['effect:payAnyAmount', 'effect:reflexive']);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  const symbol = mana.what.symbols[0];
  if (symbol === undefined || !/^[WUBRGC]$/.test(symbol)) return refuse(sentence);
  // The targets of the reflexive ability are its own (CR 603.12).
  const before = ctx.targets.length;
  const after = lowerClauses(next.clauses, ctx);
  if (!after.ok) return after;
  const own = ctx.targets.splice(before);
  const effect: Effect = {
    kind: 'payAnyAmount',
    symbol: symbol as 'W' | 'U' | 'B' | 'R' | 'G' | 'C',
    reflexive: {
      ...(own.length > 0 ? { targets: own } : {}),
      effect: ownSource(oneEffect(after.value), ctx),
    },
  };
  return { ok: true, value: [effect], rule: clause.rule };
}

/**
 * "You may pay {X}, where X is less than or equal to the amount of life you gained. If you do, draw X cards." (D-257, CR 107.3f, 118.1, 608.2c): the
 * offer and the sentence after it are one engine `payAnyAmount` of a generic {1} with a most (`atMost`, the life gained) and an "If you do" (`ifPaid`): the
 * controller chooses X as the ability resolves, pays it, and when they paid at least one the instruction after runs at once with X the number paid, not as
 * an ability of its own. Only in a life gain trigger, where the amount is known. The offer is one clause that "you may" made optional; the sentence after it
 * is "If you do," and the last of the body. Null when the sentence is not such an offer; one that does not fit is refused, never guessed.
 */
function lowerPayXAtMost(
  sentence: IrSentence,
  sentences: readonly IrSentence[],
  i: number,
  ctx: LowerContext,
): LowerResult<Effects> | null {
  const [clause, ...more] = sentence.clauses;
  if (clause?.verb !== 'payXAtMost') return null;
  const next = sentences[i + 1];
  const limit = clause.args.atMost;
  if (
    more.length > 0 ||
    !clause.optional ||
    clause.condition !== undefined ||
    clause.duration !== undefined ||
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    sentence.reflexive === true ||
    !ctx.lifeGainTrigger ||
    limit === undefined ||
    !isIrAmount(limit) ||
    next?.condition?.test.kind !== 'didPrevious' ||
    next.instead === true ||
    next.where !== undefined ||
    next.reflexive === true ||
    next.clauses.some((c) => c.optional) ||
    i + 2 < sentences.length
  ) {
    return refuse(sentence);
  }
  const blocked = missingFeatures(['effect:payAnyAmount', 'amount:triggerDamage', 'amount:x']);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  const most = lowerAmount(limit, ctx, clause.rule);
  if (!most.ok) return most;
  // The X of the follow-up is the number paid, which this effect defines: the text of the ability has no X of its own to announce (CR 107.3f).
  const usedX = ctx.usesX;
  ctx.usesX = false;
  const after = lowerClauses(next.clauses, ctx);
  const readX = ctx.usesX;
  ctx.usesX = usedX;
  if (!after.ok) return after;
  if (!readX) return refuse(next);
  const effect: Effect = {
    kind: 'payAnyAmount',
    symbol: '1',
    atMost: most.value,
    ifPaid: oneEffect(after.value),
  };
  return { ok: true, value: [effect], rule: clause.rule };
}

/** The effects the engine's `may` wraps: the ones whose doing it can tell (`validateCard` refuses the others, D-135). */
const MAY_KINDS: ReadonlySet<string> = new Set([
  // D-206 (CR 701.3): "you may attach it to target creature you control. If you do, ...".
  'attach',
  'discard',
  'sacrifice',
  'exile',
  'moveToZone',
  'draw',
  'mill',
  // D-151: "you may behold a Dragon. If you do, ..." (CR 701.4).
  'behold',
  // D-212: "you may have ~ become a copy of ... If you do, ..." (CR 707.2).
  'becomeCopy',
]);

/**
 * "Untap those creatures." (stage P64, D-217, CR 701.26a, 611.2c): the permanents the sentence before it gave +N/+N or a keyword, the group it named as it
 * resolved (`each`): untapped as that group stands right after it (nothing happens in between, and the group's filter does not read what the pump changed).
 * The sentence before it is one plain sentence of that group's pumps and grants; after anything else "those creatures" has no group and the sentence is refused.
 */
function lowerUntapThose(sentence: IrSentence, before: Step | undefined): LowerResult<Effects> {
  const [only, ...more] = sentence.clauses;
  if (
    only === undefined ||
    more.length > 0 ||
    only.optional ||
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    sentence.instead === true
  ) {
    return refuse(sentence);
  }
  const group = before?.effects.map((e) =>
    (e.kind === 'modifyPt' || e.kind === 'grantKeyword') && e.objects.kind === 'each'
      ? e.objects
      : null,
  );
  const [first] = group ?? [];
  if (
    before === undefined ||
    first === null ||
    first === undefined ||
    !(group ?? []).every((g) => g !== null && JSON.stringify(g) === JSON.stringify(first))
  ) {
    return refuse(sentence);
  }
  const blocked = missingFeatures(['effect:untap']);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  return { ok: true, value: [{ kind: 'untap', objects: first }], rule: only.rule };
}

/** The instructions a spell may offer with "you may" and nothing after it (stage P63, D-216). */
const LONE_MAY_KINDS: ReadonlySet<string> = new Set(['shuffle']);

/**
 * "You may shuffle." (Ponder, stage P63, D-216, CR 608.2d, 701.24): a sentence of one optional instruction, with no "if you do" after it, is the engine's `may`
 * of that instruction, asked as it comes up. Only the instructions of `LONE_MAY_KINDS`; null when the sentence is not such an offer.
 */
function lowerLoneMay(sentence: IrSentence, ctx: LowerContext): LowerResult<Effects> | null {
  const [clause, ...more] = sentence.clauses;
  if (clause === undefined || more.length > 0 || !clause.optional || clause.verb !== 'shuffle') {
    return null;
  }
  const blocked = missingFeatures(['effect:may']);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  if (
    sentence.condition !== undefined ||
    sentence.instead === true ||
    sentence.where !== undefined
  ) {
    return refuse(sentence);
  }
  const lowered = lowerClauses([{ ...clause, optional: false }], ctx);
  if (!lowered.ok) return lowered;
  const [only, ...rest] = lowered.value;
  if (only === undefined || rest.length > 0 || !LONE_MAY_KINDS.has(only.kind)) {
    return refuse(sentence);
  }
  return { ok: true, value: [{ kind: 'may', effect: only }], rule: clause.rule };
}

/**
 * "You may discard a card. If you do, draw a card." and "You may exile it. When you do, return target creature card from your
 * graveyard to your hand." (stage P30, D-135, CR 608.2c, 603.12, 701.48a): the offer is the engine's `may` of one instruction, and
 * the sentence after it is a `conditional` on `didPrevious` (what the offer did, counted: an empty hand discards nothing) or a
 * `reflexive` triggered ability (CR 603.12), which chooses its own targets when it goes on the stack. The offer is one sentence whose
 * instructions the text made optional with "you may", the answer to it is asked as it comes up (`confirmOptional`). Null when the
 * sentence is not such an offer (the offer to pay is `lowerMayPay`'s); a reading that does not fit is refused, never guessed.
 */
function lowerMay(
  sentence: IrSentence,
  sentences: readonly IrSentence[],
  i: number,
  ctx: LowerContext,
): LowerResult<Effects> | null {
  const next = sentences[i + 1];
  const follows = next?.condition?.test.kind === 'didPrevious' || next?.reflexive === true;
  if (next === undefined || !follows) return null;
  if (
    !sentence.clauses.every((c) => c.optional) ||
    sentence.clauses.some((c) => c.verb === 'pay')
  ) {
    return null;
  }
  const reflexive = next.reflexive === true;
  const blocked = missingFeatures([
    'effect:may',
    reflexive ? 'effect:reflexive' : 'condition:didPrevious',
    ...(reflexive ? [] : (['effect:conditional'] as const)),
  ]);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  if (sentence.condition !== undefined || sentence.instead === true) return refuse(sentence);
  if (sentence.where !== undefined || next.where !== undefined || next.instead === true) {
    return refuse(next);
  }
  if (next.clauses.some((c) => c.optional)) return refuse(next);
  // A reflexive ability is the last effect of its sequence (`validateCard`).
  if (reflexive && i + 2 < sentences.length) return refuse(next);
  const offered = lowerClauses(
    sentence.clauses.map((c) => ({ ...c, optional: false })),
    ctx,
  );
  if (!offered.ok) return offered;
  const [only, ...more] = offered.value;
  // "You may tap X untapped Myr you control. If you do, ..." (stage P31, D-140, CR 701.26a): the choice of any number of them is the
  // offer itself (tapping none is declining it, and is not "doing it"), so the tap is not wrapped in a question of its own.
  const chooseAny =
    only?.kind === 'tap' && only.objects.kind === 'choose' && only.objects.anyNumber;
  if (only === undefined || more.length > 0 || (!MAY_KINDS.has(only.kind) && !chooseAny)) {
    return refuse(sentence);
  }
  const may: Effect = chooseAny ? only : { kind: 'may', effect: only };
  if (!reflexive) {
    // "Tap X untapped Myr you control. If you do, ~ gets +X/+0 ...": X is the number tapped (the engine's `thisWay` `tapped`).
    const tapX = sentence.clauses.some(
      (c) =>
        c.verb === 'tapChosen' &&
        c.args.objects?.kind === 'noun' &&
        c.args.objects.count?.kind === 'x',
    );
    const outer = ctx.xIs;
    if (tapX) {
      ctx.xIs = {
        amount: { kind: 'thisWay', what: 'tapped', words: [], span: next.span },
        used: false,
      };
    }
    const after = lowerClauses(next.clauses, ctx);
    ctx.xIs = outer;
    if (!after.ok) return after;
    const conditional: Effect = {
      kind: 'conditional',
      condition: { kind: 'didPrevious' },
      effect: oneEffect(after.value),
    };
    return {
      ok: true,
      value: [may, conditional],
      rule: sentence.clauses[0]?.rule ?? sentence.rule,
    };
  }
  const effect = lowerReflexive(next, ctx);
  if (!effect.ok) return effect;
  return {
    ok: true,
    value: [may, effect.value],
    rule: sentence.clauses[0]?.rule ?? sentence.rule,
  };
}

/**
 * The reflexive triggered ability of a sentence that starts with "When you do," (CR 603.12): its targets are its own, it knows nothing of the targets of
 * the ability that created it.
 */
function lowerReflexive(next: IrSentence, ctx: LowerContext): LowerResult<Effect> {
  const before = ctx.targets.length;
  const after = lowerClauses(next.clauses, ctx);
  if (!after.ok) return after;
  const own = ctx.targets.splice(before);
  return {
    ok: true,
    value: {
      kind: 'reflexive',
      ...(own.length > 0 ? { targets: own } : {}),
      effect: ownSource(oneEffect(after.value), ctx),
    },
    rule: next.clauses[0]?.rule ?? next.rule,
  };
}

/**
 * "When this land enters, sacrifice it. When you do, search your library for a basic Forest card, put it onto the battlefield tapped, then
 * shuffle and you gain 1 life." (stage P36, D-178, CR 603.12): the reflexive ability of an instruction that is not an offer. The first sentence is one
 * plain instruction of a kind the engine can tell was done (`sacrifice`, a move, a draw, ...), the first of its body so that nothing earlier is
 * counted as something it did; the sentence after it is the reflexive ability, which the engine creates when the instruction was done, so a land
 * that was no longer there to sacrifice makes none. Null when the sentences are not of this shape; a body of this shape that cannot be run is refused.
 */
function lowerDoneReflexive(
  sentence: IrSentence,
  sentences: readonly IrSentence[],
  i: number,
  ctx: LowerContext,
): LowerResult<Effects> | null {
  const next = sentences[i + 1];
  if (next?.reflexive !== true || i !== 0) return null;
  const [clause, ...more] = sentence.clauses;
  if (clause === undefined || clause.optional) return null;
  if (more.length > 0 || clause.condition !== undefined || clause.duration !== undefined) {
    return refuse(sentence);
  }
  if (
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    sentence.instead === true
  ) {
    return refuse(sentence);
  }
  if (next.where !== undefined || next.instead === true || next.clauses.some((c) => c.optional)) {
    return refuse(next);
  }
  // A reflexive ability is the last effect of its sequence (`validateCard`).
  if (i + 2 < sentences.length) return refuse(next);
  const blocked = missingFeatures(['effect:reflexive']);
  if (blocked.length > 0) return { ...refuse(next), needs: blocked };
  const done = lowerClauses(sentence.clauses, ctx);
  if (!done.ok) return done;
  const [only, ...rest] = done.value;
  if (only === undefined || rest.length > 0 || !MAY_KINDS.has(only.kind)) return refuse(sentence);
  const effect = lowerReflexive(next, ctx);
  if (!effect.ok) return effect;
  return { ok: true, value: [only, effect.value], rule: clause.rule };
}

/** The effects whose doing the engine can tell without a "may" (`didPrevious` reads them, D-139): those of `may`, and a tap. */
const DONE_KINDS: ReadonlySet<string> = new Set([...MAY_KINDS, 'tap']);

/**
 * "When there are four or more page counters on ~, exile it. If you do, you gain 4 life." (stage P31, D-140, CR 608.2c): "if you do"
 * after an instruction that is not an offer asks whether it was done (the permanent may have left before the ability resolved, and then
 * it is not exiled). The sentence before is one plain instruction of a kind the engine can tell was done, and this one a `conditional`
 * on `didPrevious` of plain instructions. Null when the sentence is not "If you do" or what came before is not such an instruction.
 */
function lowerIfDone(
  sentence: IrSentence,
  before: IrSentence | undefined,
  previous: Step | undefined,
  ctx: LowerContext,
): LowerResult<Effects> | null {
  if (sentence.condition?.test.kind !== 'didPrevious' || sentence.reflexive === true) return null;
  const [clause, ...more] = before?.clauses ?? [];
  const [effect, ...rest] = previous?.effects ?? [];
  if (
    before === undefined ||
    clause === undefined ||
    more.length > 0 ||
    clause.optional ||
    clause.condition !== undefined ||
    before.condition !== undefined ||
    before.reflexive === true ||
    effect === undefined ||
    rest.length > 0 ||
    !DONE_KINDS.has(effect.kind)
  ) {
    return null;
  }
  if (sentence.instead === true || sentence.where !== undefined) return refuse(sentence);
  if (sentence.clauses.some((c) => c.optional)) return refuse(sentence);
  const blocked = missingFeatures(['condition:didPrevious', 'effect:conditional']);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  const after = lowerClauses(sentence.clauses, ctx);
  if (!after.ok) return after;
  return {
    ok: true,
    value: [
      { kind: 'conditional', condition: { kind: 'didPrevious' }, effect: oneEffect(after.value) },
    ],
    rule: sentence.clauses[0]?.rule ?? sentence.rule,
  };
}

/**
 * The sentence "If ~ was kicked, it deals 4 damage instead.": the earlier damage with a new
 * amount, for the same recipients. Only after one sentence that is one damage effect, so that
 * what "it deals" refers to is one thing.
 */
function ellipticalDamage(
  sentence: IrSentence,
  clause: IrClause,
  previous: Step,
  ctx: LowerContext,
): LowerResult<Effects> {
  const [base] = previous.effects;
  if (previous.effects.length !== 1 || base?.kind !== 'dealDamage') return refuse(sentence);
  const missing = missingFeatures(['effect:dealDamage']);
  if (missing.length > 0) return { ...refuse(sentence), needs: missing };
  const amount = amountArg(clause, 'amount', ctx);
  if (!amount.ok) return amount;
  return { ok: true, value: [{ ...base, amount: amount.value }], rule: clause.rule };
}

/** The `thisWay` amounts a clause reads, wherever in its amounts they are (a token's count, a draw's count, ...). */
function thisWaysOf(clause: IrClause): Extract<IrAmount, { kind: 'thisWay' }>[] {
  const out: Extract<IrAmount, { kind: 'thisWay' }>[] = [];
  const visit = (amount: IrAmount): void => {
    switch (amount.kind) {
      case 'thisWay':
        out.push(amount);
        break;
      case 'half':
      case 'multiple':
        visit(amount.of);
        break;
      case 'sum':
        amount.of.forEach(visit);
        break;
      default:
        break;
    }
  };
  for (const arg of Object.values(clause.args)) {
    if (isIrAmount(arg)) visit(arg);
    else if (arg.kind === 'token') visit(arg.count);
  }
  return out;
}

/** Whether `earlier` is an instruction of the kind `amount` counts, and says what the words of the amount say. */
function countsWhatHappened(
  amount: Extract<IrAmount, { kind: 'thisWay' }>,
  earlier: IrClause,
): boolean {
  // What kind of permanent a noun names: its card types, or "creature" for a creature type ("all Zombies").
  const kindOf = (noun: IrNoun): string => {
    const types = noun.filter.types ?? [];
    if (types.length > 0) return types.join(' ');
    const subtypes = noun.filter.subtypes ?? [];
    return subtypes.length > 0 && subtypes.every((s) => CREATURE_TYPES.has(s)) ? 'creature' : '';
  };
  const names = (what: IrArg | undefined): readonly string[] =>
    what?.kind === 'noun'
      ? [kindOf(what)]
      : what?.kind === 'nounList'
        ? what.items.map(kindOf)
        : [];
  // "that many" (stage P30): the number of whatever the instruction before it sacrificed, however it chose what to sacrifice.
  // Stage P34 (D-152): or the cards of "discard any number of cards".
  if (amount.thatMany === true) {
    return (
      earlier.verb === 'sacrifice' ||
      (earlier.verb === 'discard' && earlier.args.anyNumber !== undefined)
    );
  }
  const [word] = amount.words;
  switch (amount.what) {
    case 'sacrificed': {
      // "Each other player sacrifices a creature of their choice. ... for each creature sacrificed this way."
      return (
        earlier.verb === 'sacrifice' &&
        earlier.args.player !== undefined &&
        (word === 'permanent' || names(earlier.args.objects).every((n) => n === word))
      );
    }
    case 'destroyedOwnNontoken':
      // Stage P68 (D-230): "for each nontoken creature you controlled that was destroyed this way": a `destroy` of creatures before it.
      return (
        earlier.verb === 'destroy' && names(earlier.args.objects).every((n) => n === 'creature')
      );
    case 'destroyed':
      return (
        earlier.verb === 'destroy' &&
        (word === 'permanent' || names(earlier.args.objects).every((n) => n === word))
      );
    case 'tapped':
      // "X" after "tap X untapped Myr you control" (stage P31): the number the tap chose.
      return earlier.verb === 'tapChosen';
    case 'milledValue':
      // Stage P52 (D-210): "equal to the total mana value of those cards": the cards a mill before it milled.
      return earlier.verb === 'mill';
    case 'playersDrew': {
      // The engine counts the players who drew in an earlier `draw`: "opponent who drew" only fits a draw by opponents.
      const who = earlier.args.player;
      if (earlier.verb !== 'draw' || who?.kind !== 'noun') return false;
      return (
        amount.who === 'player' ||
        who.det === 'eachOpponent' ||
        (who.det === 'target' && who.filter.player === 'opponent')
      );
    }
  }
}

/**
 * "... for each creature sacrificed this way", "for each opponent who drew a card this way" (CR 608.2c): the amount
 * reads what an earlier instruction of the same list did, so it needs one that is not under a condition, of that kind
 * and about what the words say. Every other place for it is refused here (the engine's `validateCard` also refuses it,
 * but only the grammar can tell that the words name the wrong thing).
 */
function thisWaysAreSupported(sentences: readonly IrSentence[]): IrSentence | null {
  const before: IrClause[] = [];
  for (const sentence of sentences) {
    // "If the player doesn't, you mill three cards, then ... equal to the total mana value of those cards" (stage P52, D-210): the sentence is what a
    // "may have you" sentence does otherwise, run whole, so its own instructions count each other.
    const otherwise = sentence.condition?.test.kind === 'declined';
    for (const clause of sentence.clauses) {
      for (const amount of thisWaysOf(clause)) {
        if ((sentence.condition !== undefined && !otherwise) || clause.condition !== undefined) {
          return sentence;
        }
        if (!before.some((earlier) => countsWhatHappened(amount, earlier))) return sentence;
      }
      if ((sentence.condition === undefined || otherwise) && clause.condition === undefined) {
        before.push(clause);
      }
    }
  }
  return null;
}

/**
 * "If the creature you control has trample, excess damage is dealt to that creature's controller instead." (stage P32, D-147, CR 702.19b,
 * 120.3, 614.1a): the sentence says how the damage of the sentence before it is dealt when the creature that deals it has trample, which
 * the engine's `dealDamage` carries as `trampleExcess` (each creature recipient takes lethal damage and the rest goes to its controller).
 * The damage before it is one bite (`from` a target creature, `to` a target); the condition is that same creature having trample and the
 * recipient is the controller of the creature bitten. Anything else is refused, never guessed.
 */
function lowerTrampleExcess(
  sentence: IrSentence,
  previous: Step | undefined,
): LowerResult<Effects> {
  const [clause, ...more] = sentence.clauses;
  const test = sentence.condition?.test;
  const to = clause?.args.to;
  const [base, ...rest] = previous?.effects ?? [];
  if (
    clause === undefined ||
    more.length > 0 ||
    test?.kind !== 'objectMatches' ||
    to?.kind !== 'noun' ||
    to.det !== 'controllerOf' ||
    clause.optional ||
    clause.condition !== undefined ||
    clause.duration !== undefined ||
    sentence.where !== undefined ||
    previous?.replaceable !== true ||
    base?.kind !== 'dealDamage' ||
    rest.length > 0 ||
    base.from?.kind !== 'target' ||
    base.to.kind !== 'target' ||
    base.trampleExcess === true
  ) {
    return refuse(sentence);
  }
  // The condition names the creature that deals the damage and its keyword, the recipient is the controller of the creature bitten.
  const keywords = test.filter.keywords ?? [];
  const onlyTrample =
    keywords.length === 1 &&
    keywords[0] === 'trample' &&
    Object.keys(test.filter).every((k) => k === 'keywords' || k === 'raw');
  if (!onlyTrample || test.who.ref !== base.from.id || to.of?.ref !== base.to.id) {
    return refuse(sentence);
  }
  const blocked = missingFeatures(['effect:dealDamage', 'selector:keywords']);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  return { ok: true, value: [{ ...base, trampleExcess: true }], rule: clause.rule };
}

/**
 * "At the beginning of that combat, untap all creatures you control." (stage P41, D-188, CR 603.7, 500.8): the sentence is what a delayed triggered
 * ability of the combat phase the sentence before it added does. The sentence before it must be that one instruction (the engine's `extraCombat`, with
 * nothing of its own to do at the beginning), and what is done at the beginning one group untap, which the engine runs; anything else is refused.
 */
function lowerAtThatCombat(
  sentence: IrSentence,
  i: number,
  steps: Step[],
  ctx: LowerContext,
): StepResult {
  const before = steps[steps.length - 1];
  const added = before?.effects[before.effects.length - 1];
  if (
    before === undefined ||
    before.effects.length !== 1 ||
    added?.kind !== 'extraCombat' ||
    added.atBeginning !== undefined ||
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    sentence.reflexive === true ||
    sentence.instead === true ||
    sentence.clauses.some((c) => c.optional)
  ) {
    return { stopped: refuse(sentence) };
  }
  const inner = lowerClauses(sentence.clauses, ctx);
  if (!inner.ok) return { stopped: inner };
  const [untap, ...rest] = inner.value;
  if (untap?.kind !== 'untap' || rest.length > 0) return { stopped: refuse(sentence) };
  steps.pop();
  steps.push({ effects: [{ ...added, atBeginning: untap }], replaceable: false });
  return { last: i };
}

/** How lowering one sentence went: it stopped, or the index of the last sentence it consumed. */
type StepResult = { readonly stopped: LowerFailure } | { readonly last: number };

/**
 * One sentence of a body (and the one after it, when an offer to pay takes both): pushes what it lowers onto `steps`.
 * An X the sentence defines ("..., where X is the number of Zombies you control") is `ctx.xIs` while it runs.
 */
function lowerStep(
  sentences: readonly IrSentence[],
  i: number,
  steps: Step[],
  ctx: LowerContext,
): StepResult {
  const sentence = sentences[i];
  if (sentence === undefined) return { last: i };
  const [first] = sentence.clauses;
  if (first === undefined) return { stopped: refuse(sentence) };
  const stop = (failed: LowerFailure): StepResult => ({ stopped: failed });
  // "Draw a card if your life total is greater than your starting life total. Otherwise, you gain 2 life." (D-253, CR 608.2c): the `else` of the
  // conditional instruction before it. Only a plain sentence of its own; the one before it must be a conditional with no `else` yet.
  if (sentence.otherwise === true) {
    const previous = steps[steps.length - 1];
    const before = previous?.effects.length === 1 ? previous.effects[0] : undefined;
    if (
      before?.kind !== 'conditional' ||
      before.else !== undefined ||
      sentence.condition !== undefined ||
      sentence.instead === true ||
      sentence.where !== undefined ||
      sentence.delayed !== undefined ||
      sentence.reflexive === true ||
      sentence.clauses.some((c) => c.optional)
    ) {
      return stop(refuse(sentence));
    }
    const other = lowerClauses(sentence.clauses, ctx);
    if (!other.ok) return stop(other);
    steps.pop();
    steps.push({
      effects: [{ ...before, else: oneEffect(other.value) }],
      replaceable: false,
    });
    return { last: i };
  }
  // "At the beginning of your next end step, ~ deals 2 damage to each opponent ..." (stage P34, D-152, CR 603.7): the engine's `delayedTrigger`.
  if (sentence.delayed !== undefined) {
    const { step, whose } = sentence.delayed;
    // "there's an additional combat phase after this phase. At the beginning of that combat, untap all creatures you control." (stage P41, D-188, CR 603.7,
    // 500.8): what happens at the beginning of the combat phase the sentence before it added; it is the engine's `extraCombat` with `atBeginning`.
    if (step === 'thatCombat') return lowerAtThatCombat(sentence, i, steps, ctx);
    const blocked = missingFeatures(['effect:delayedTrigger']);
    if (blocked.length > 0) return stop({ ...refuse(sentence), needs: blocked });
    // A test or a "you may" of the sentence is not read inside what a delayed ability does.
    if (
      sentence.condition !== undefined ||
      sentence.where !== undefined ||
      sentence.reflexive === true ||
      sentence.instead === true ||
      sentence.clauses.some((c) => c.optional)
    ) {
      return stop(refuse(sentence));
    }
    const inner = lowerClauses(sentence.clauses, ctx);
    if (!inner.ok) return stop(inner);
    const effect: Effect = {
      kind: 'delayedTrigger',
      at: { step, whose },
      effect: oneEffect(inner.value),
    };
    steps.push({ effects: [effect], replaceable: false });
    return { last: i };
  }
  // "You may pay any amount of {R}. When you do, it deals that much damage to any target." (stage P34, D-152, CR 603.12, 118.1).
  const payX = lowerPayXAtMost(sentence, sentences, i, ctx);
  if (payX !== null) {
    if (!payX.ok) return stop(payX);
    steps.push({ effects: payX.value, replaceable: false });
    return { last: i + 1 };
  }
  const payAny = lowerPayAnyAmount(sentence, sentences, i, ctx);
  if (payAny !== null) {
    if (!payAny.ok) return stop(payAny);
    steps.push({ effects: payAny.value, replaceable: false });
    return { last: i + 1 };
  }
  const regenerated = lowerCantBeRegenerated(sentence, sentences[i - 1], steps[steps.length - 1]);
  if (regenerated !== null) {
    if (!regenerated.ok) return stop(regenerated);
    steps.pop();
    steps.push({ effects: regenerated.value, replaceable: false });
    return { last: i };
  }
  // "Each player may discard a card." and "Target opponent may have you draw three cards. If the player doesn't, ..." (stage P52, D-210, CR 608.2d, 101.4).
  const asking = lowerPlayersMay(sentence, sentences, i, ctx);
  if (asking !== null) {
    if (!asking.result.ok) return stop(asking.result);
    steps.push({ effects: asking.result.value, replaceable: false });
    return { last: asking.last };
  }
  if (sentence.condition?.test.kind === 'declined') return stop(refuse(sentence));
  const offered = lowerMayPay(sentence, sentences[i + 1], ctx);
  if (offered !== null) {
    if (!offered.ok) return stop(offered);
    steps.push({ effects: offered.value, replaceable: false });
    return { last: i + 1 };
  }
  // "You may discard a card. If you do, draw a card." and "You may exile it. When you do, ..." (stage P30, D-135, CR 608.2c, 603.12).
  const asked = lowerMay(sentence, sentences, i, ctx);
  if (asked !== null) {
    if (!asked.ok) return stop(asked);
    steps.push({ effects: asked.value, replaceable: false });
    return { last: i + 1 };
  }
  // "You may shuffle." (stage P63, D-216, CR 608.2d): an offer nothing follows, so nothing asks whether it was done.
  const lone = lowerLoneMay(sentence, ctx);
  if (lone !== null) {
    if (!lone.ok) return stop(lone);
    steps.push({ effects: lone.value, replaceable: false });
    return { last: i };
  }
  // "When this land enters, sacrifice it. When you do, ..." (stage P36, D-178, CR 603.12): the reflexive ability of an instruction that is not an offer.
  const reflexed = lowerDoneReflexive(sentence, sentences, i, ctx);
  if (reflexed !== null) {
    if (!reflexed.ok) return stop(reflexed);
    steps.push({ effects: reflexed.value, replaceable: false });
    return { last: i + 1 };
  }
  // "creatures you control get +1/+1 until end of turn. Untap those creatures." (stage P64, D-217, CR 611.2c): the group the instruction before it named.
  if (first.verb === 'untapThose') {
    const untapped = lowerUntapThose(sentence, steps[steps.length - 1]);
    if (!untapped.ok) return stop(untapped);
    steps.push({ effects: untapped.value, replaceable: false });
    return { last: i };
  }
  // "Exile it. If you do, you gain 4 life." (stage P31, D-140, CR 608.2c): what an instruction the engine can tell was done did.
  const done = lowerIfDone(sentence, sentences[i - 1], steps[steps.length - 1], ctx);
  if (done !== null) {
    if (!done.ok) return stop(done);
    steps.push({ effects: done.value, replaceable: false });
    return { last: i };
  }
  // An "If you do" that no offer came before is a test on what the player did, which there is nothing to test.
  if (sentence.condition?.test.kind === 'didPrevious' || sentence.reflexive === true) {
    return stop({ ...refuse(sentence), needs: missingFeatures(['condition:didPrevious']) });
  }
  const unless = lowerUnless(sentence, ctx);
  if (unless !== null) {
    if (!unless.ok) return stop(unless);
    steps.push({ effects: unless.value, replaceable: false });
    return { last: i };
  }
  const unlessReturn = lowerUnlessReturn(sentence, ctx);
  if (unlessReturn !== null) {
    if (!unlessReturn.ok) return stop(unlessReturn);
    steps.push({ effects: unlessReturn.value, replaceable: false });
    return { last: i };
  }
  if (sentence.condition === undefined) {
    const slotsFrom = ctx.targets.length;
    const lowered = lowerClauses(sentence.clauses, ctx);
    if (!lowered.ok) return stop(lowered);
    steps.push({
      effects: lowered.value,
      replaceable: sentence.clauses.length === 1,
      slots: [slotsFrom, ctx.targets.length],
    });
    return { last: i };
  }
  // "If the creature you control has trample, excess damage is dealt to that creature's controller instead." (stage P32, D-147).
  if (sentence.instead === true && first.verb === 'excessDamage') {
    const joined = lowerTrampleExcess(sentence, steps[steps.length - 1]);
    if (!joined.ok) return stop(joined);
    steps.pop();
    steps.push({ effects: joined.value, replaceable: false });
    return { last: i };
  }
  if (first.verb === 'excessDamage') return stop(refuse(sentence));
  const blocked = missingFeatures(SENTENCE_NEEDS);
  if (blocked.length > 0) return stop({ ...refuse(sentence), needs: blocked });
  const condition = lowerCondition(sentence.condition, false, ctx);
  if (!condition.ok) return stop(condition);
  const previous = steps[steps.length - 1];
  if (sentence.instead !== true) {
    const targetsBefore = ctx.targets.length;
    const lowered = lowerClauses(sentence.clauses, ctx);
    if (!lowered.ok) return stop(lowered);
    // "If the gift was promised, return target creature card ...": the slot exists only if the gift was promised (CR 702.174m).
    if (sentence.condition.test.kind === 'giftPromised') {
      for (let k = targetsBefore; k < ctx.targets.length; k += 1) {
        const spec = ctx.targets[k];
        if (spec !== undefined) ctx.targets[k] = { ...spec, ifGiftPromised: true };
      }
    }
    // "If this spell was kicked, destroy target creature.": the slot exists only if the spell was kicked (CR 702.33g).
    if (
      sentence.condition.test.kind === 'kicked' &&
      markKickedTargets(ctx, [targetsBefore, ctx.targets.length], undefined, null)
    ) {
      const blocked = missingFeatures(['ability:ifKicked']);
      if (blocked.length > 0) return stop({ ...refuse(sentence), needs: blocked });
    }
    const effect: Effect = {
      kind: 'conditional',
      condition: condition.value,
      effect: oneEffect(lowered.value),
    };
    steps.push({ effects: [effect], replaceable: false });
    return { last: i };
  }
  if (previous === undefined || !previous.replaceable) return stop(refuse(sentence));
  const slotsFrom = ctx.targets.length;
  const replacement =
    sentence.clauses.length === 1 && isRecipientless(first)
      ? ellipticalDamage(sentence, first, previous, ctx)
      : lowerClauses(sentence.clauses, ctx);
  if (!replacement.ok) return stop(replacement);
  // "If this spell was kicked, exile target nonland permanent instead.": the slots of each way (CR 702.33g, 601.2c).
  if (
    sentence.condition.test.kind === 'kicked' &&
    markKickedTargets(ctx, [slotsFrom, ctx.targets.length], previous, replacement.value)
  ) {
    const blocked = missingFeatures(['ability:ifKicked']);
    if (blocked.length > 0) return stop({ ...refuse(sentence), needs: blocked });
  }
  const effect: Effect = {
    kind: 'conditional',
    condition: condition.value,
    effect: oneEffect(replacement.value),
    else: oneEffect(previous.effects),
  };
  steps.pop();
  steps.push({ effects: [effect], replaceable: false });
  return { last: i };
}

/**
 * "Each player may discard a card." and "Target opponent may have you draw three cards. If the player doesn't, you mill three cards." (stage P52, D-210, CR 608.2d,
 * 101.4): the players the sentence names are asked, in turn order, whether to do its clauses; with "have you" the controller does them, otherwise the player asked is "you"
 * in them. A sentence "If the player doesn't, ..." right after it says what is done for a player who declines. Anything else about the sentence (a test, a "where",
 * an "instead") is refused, never guessed. Null when the sentence asks nobody.
 */
function lowerPlayersMay(
  sentence: IrSentence,
  sentences: readonly IrSentence[],
  i: number,
  ctx: LowerContext,
): { readonly result: LowerResult<Effects>; readonly last: number } | null {
  const by = sentence.mayBy;
  if (by === undefined) return null;
  const refused = (result: LowerResult<Effects>) => ({ result, last: i });
  const blocked = missingFeatures(['effect:playersMay']);
  if (blocked.length > 0) return refused({ ...refuse(sentence), needs: blocked });
  if (
    sentence.condition !== undefined ||
    sentence.instead === true ||
    sentence.where !== undefined ||
    sentence.reflexive === true ||
    sentence.delayed !== undefined ||
    sentence.clauses.some((c) => c.optional)
  ) {
    return refused(refuse(sentence));
  }
  const players = playerSelectorOf(by.who, ctx);
  if (!players.ok) return refused(players);
  const body = lowerClauses(sentence.clauses, ctx);
  if (!body.ok) return refused(body);
  const next = sentences[i + 1];
  const declines = next?.condition?.test.kind === 'declined';
  let otherwise: Effect | undefined;
  if (declines && next !== undefined) {
    if (
      next.instead === true ||
      next.where !== undefined ||
      next.mayBy !== undefined ||
      next.reflexive === true ||
      next.delayed !== undefined ||
      next.clauses.some((c) => c.optional)
    ) {
      return refused(refuse(next));
    }
    const other = lowerClauses(next.clauses, ctx);
    if (!other.ok) return refused(other);
    otherwise = oneEffect(other.value);
  }
  const effect: Effect = {
    kind: 'playersMay',
    players: players.value,
    effect: oneEffect(body.value),
    ...(by.haveYou ? {} : { runsAs: 'chooser' as const }),
    ...(otherwise === undefined ? {} : { otherwise }),
  };
  return {
    result: { ok: true, value: [effect], rule: sentence.clauses[0]?.rule ?? sentence.rule },
    last: declines ? i + 1 : i,
  };
}

/**
 * "You may return target nonland permanent card from your graveyard to your hand. If that land is a Plains, you may return that card to the
 * battlefield instead." (stage P33, D-150, CR 608.2c, 614.1a): two sentences, the second a test that offers another instruction in place of
 * the first. The offer is the engine's `may` of that instruction; when the test holds the player is asked about the instruction instead, and
 * when the player declines it the first instruction is offered after all (an optional replacement that is not used leaves the event as it
 * was); when it does not hold the first instruction is. So the effect is `conditional(test, [may(B), conditional(not didPrevious, A)], else A)`,
 * with A in a `may` when the first sentence says "you may". Only for a triggered ability's body (a spell has no choices of its own), and
 * only for these two sentences of one instruction each, of the kinds the engine can tell were done. Null when the body is not of this
 * shape; a body of this shape that cannot be run is refused, never guessed.
 */
export function lowerMayInstead(
  sentences: readonly IrSentence[],
  ctx: LowerContext,
): LowerResult<Effects> | null {
  const [first, second, ...rest] = sentences;
  if (first === undefined || second === undefined || rest.length > 0) return null;
  const [a, ...moreA] = first.clauses;
  const [b, ...moreB] = second.clauses;
  if (
    a === undefined ||
    b === undefined ||
    second.instead !== true ||
    second.condition === undefined ||
    !b.optional
  ) {
    return null;
  }
  if (
    moreA.length > 0 ||
    moreB.length > 0 ||
    first.condition !== undefined ||
    first.where !== undefined ||
    first.instead === true ||
    first.reflexive === true ||
    second.where !== undefined ||
    second.reflexive === true ||
    a.condition !== undefined ||
    b.condition !== undefined ||
    second.condition.test.kind === 'didPrevious'
  ) {
    return refuse(second);
  }
  const blocked = missingFeatures([
    'effect:may',
    'effect:conditional',
    'effect:conditional',
    'condition:didPrevious',
    'condition:not',
  ]);
  if (blocked.length > 0) return { ...refuse(second), needs: blocked };
  // The first instruction's targets are declared before the condition and the second instruction read them.
  const base = lowerClauses([{ ...a, optional: false }], ctx);
  if (!base.ok) return base;
  const condition = lowerCondition(second.condition, false, ctx);
  if (!condition.ok) return condition;
  const instead = lowerClauses([{ ...b, optional: false }], ctx);
  if (!instead.ok) return instead;
  const [baseEffect, ...baseMore] = base.value;
  const [insteadEffect, ...insteadMore] = instead.value;
  if (
    baseEffect === undefined ||
    insteadEffect === undefined ||
    baseMore.length > 0 ||
    insteadMore.length > 0 ||
    !MAY_KINDS.has(insteadEffect.kind) ||
    (a.optional && !MAY_KINDS.has(baseEffect.kind))
  ) {
    return refuse(second);
  }
  const original: Effect = a.optional ? { kind: 'may', effect: baseEffect } : baseEffect;
  const effect: Effect = {
    kind: 'conditional',
    condition: condition.value,
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'may', effect: insteadEffect },
        {
          kind: 'conditional',
          condition: { kind: 'not', term: { kind: 'didPrevious' } },
          effect: original,
        },
      ],
    },
    else: original,
  };
  return { ok: true, value: [effect], rule: a.rule };
}

/**
 * Lowers the sentences of a body. A condition about "it" is not lowered here: in a spell or a
 * body sentence "it" may be any object, so only "~ was kicked" is. A sentence that ends ", where X is ..." defines X
 * for its own clauses (stage P28, CR 107.3c); a definition that no clause reads is refused, and so is one on the
 * sentence an offer to pay takes along ("If you do, ..."), which would need two meanings of X.
 */
export function lowerSentences(
  sentences: readonly IrSentence[],
  ctx: LowerContext,
): LowerResult<Effects> {
  const steps: Step[] = [];
  const unordered = thisWaysAreSupported(sentences);
  if (unordered !== null) return refuse(unordered);
  for (let i = 0; i < sentences.length; i += 1) {
    const sentence = sentences[i];
    if (sentence === undefined) break;
    const whereAmount = sentence.where;
    const defined =
      whereAmount === undefined
        ? null
        : {
            amount: whereAmount,
            used: false,
            lower: () => {
              // The amount as the engine reads it, with X not defined while it is lowered (it would be read as itself).
              const outer = ctx.xIs;
              ctx.xIs = null;
              try {
                return lowerAmount(whereAmount, ctx, 'body.sentence');
              } finally {
                ctx.xIs = outer;
              }
            },
          };
    ctx.xIs = defined;
    const result = lowerStep(sentences, i, steps, ctx);
    ctx.xIs = null;
    if ('stopped' in result) return result.stopped;
    if (defined !== null && !defined.used) return refuse(sentence);
    if (defined !== null) ctx.xDefined = true;
    if (result.last > i && sentences[result.last]?.where !== undefined) return refuse(sentence);
    i = result.last;
  }
  const effects = steps.flatMap((s) => s.effects);
  const last = sentences[sentences.length - 1];
  if (last !== undefined && !lossReadsAreOrdered(effects)) return refuse(last);
  return { ok: true, value: effects, rule: 'body.sentence' };
}
