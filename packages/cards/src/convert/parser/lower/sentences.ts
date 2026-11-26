/**
 * The sentences of a body (a spell's text or a triggered ability's effect) to engine effects, in
 * text order (CR 608.2c). A plain sentence lowers its clauses. "If ~ was kicked, ..." lowers to a
 * `conditional` effect, which the engine evaluates as that instruction runs. "If ~ was kicked, ...
 * instead." replaces the sentence before it, so the two become one `conditional` whose else branch
 * is the earlier sentence (CR 614.1a: "instead" replaces an event); the earlier sentence is
 * replaced as a whole, so it must be one instruction, and what is dropped when the condition holds
 * must be everything it said.
 */

import type { Condition, Cost, Effect, PlayerSelector } from '@commander-arena/engine';
import {
  type IrAmount,
  type IrArg,
  type IrClause,
  type IrNoun,
  type IrSentence,
  isIrAmount,
} from '../ir/types';
import { CREATURE_TYPES } from '../rules/noun/creature-types';
import { isCostSacrificeCount, lowerAmount, lowerPtTerm } from './amounts';
import { lowerChooseColorMana } from './chosen-color-mana';
import { amountArg, arg, type Effects } from './clauses';
import { lowerCondition } from './conditions';
import { lowerCost } from './costs';
import { lowerClause } from './effects';
import { noteExiledOwnGraveyards } from './exile-own-graveyards';
import { type FeatureRef, missingFeatures } from './features';
import { lowerFilter, playerSelectorOf } from './nouns';
import { lowerThoseRestriction } from './riders-b';
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
    // Issue 103: the commander "put onto the battlefield" from the command zone is what "it" of the next sentences is (the lowering of that clause set `ctx.searched`).
    const fromCommandZone =
      effect.kind === 'moveToZone' &&
      effect.objects.kind === 'choose' &&
      (effect.objects.filter.zone === 'command' ||
        // "You may put a creature card from your hand onto the battlefield. That creature gains haste": the card put is what "that creature" names (`lower.put-from-zone`).
        (effect.to === 'battlefield' &&
          (effect.objects.filter.zone === 'hand' || effect.objects.filter.zone === 'graveyard')));
    if (!fromCommandZone) ctx.searched = null;
    // Lorehold group 1: "that card" of "you may play that card this turn" after "exile that card from your graveyard": the card the exile moved.
    if (effect.kind === 'exile') ctx.exiled = 'cards';
    ctx.exiledRef =
      effect.kind === 'exile' && effect.objects.kind === 'target' ? effect.objects.id : null;
    // `'*'` (issue 159): the instruction put objects onto the battlefield that no target names ("Put all creature cards from all graveyards onto the battlefield"): "they"
    // are `moved`, as no target id can be '*'.
    ctx.movedOnto =
      effect.kind === 'moveToZone' && effect.to === 'battlefield'
        ? effect.objects.kind === 'target'
          ? effect.objects.id
          : '*'
        : null;
  }
}

/**
 * What "they", "them", "those tokens" and "the token created this way" mean after an instruction that created tokens (D-643, Prismari group 1): the tokens that instruction made,
 * the engine's `moved`, until an instruction that moves, destroys, exiles or sacrifices other objects is lowered. A token made is also remembered (`lastToken`), which
 * "create five of those tokens instead" makes more of.
 */
function noteTokensMade(effects: readonly Effect[], ctx: LowerContext): void {
  const MAKES = ['createToken', 'createCopies', 'populate', 'copyOneOfTriggerCards'];
  if (effects.some((e) => MAKES.includes(e.kind))) {
    ctx.tokensMade = true;
    const [only] = effects;
    // D-646: a token of any kind (the copy of "create five of those tokens instead", the 1/1 Elemental of "create three of those tokens instead").
    ctx.lastToken = effects.length === 1 && only?.kind === 'createToken' ? only : null;
    return;
  }
  const MOVES = ['moveToZone', 'destroy', 'exile', 'sacrifice'];
  if (effects.some((e) => MOVES.includes(e.kind))) {
    ctx.tokensMade = false;
    ctx.lastToken = null;
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

/** The instructions that change what the engine's `moved` names (CR 400.7j): after one of them "those creatures" of a group control change is no longer the group it took. */
const GROUP_BREAKERS: readonly string[] = [
  'moveToZone',
  'destroy',
  'exile',
  'sacrifice',
  'createToken',
  'createCopies',
  'populate',
  'search',
  'gainControl',
];

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
    ctx.lowered += 1;
    ctx.lastEffectKind = lowered.value[lowered.value.length - 1]?.kind ?? ctx.lastEffectKind;
    // CR 608.2c: "Put a +1/+1 counter on each legendary creature you control. They gain ...": "they" is that group, only right after the counters.
    const lastLowered = lowered.value[lowered.value.length - 1];
    ctx.lastCounteredGroup =
      lastLowered?.kind === 'addCounters' && lastLowered.objects.kind === 'each'
        ? lastLowered.objects
        : // In the Darkness Bind Them (CR 608.2c, 611.2c): "For each opponent, gain control of up to one target creature ... Untap those creatures. They gain haste ...": the creatures
          // the control effect named as targets (`untapThose` does not clear it: it is not lowered as a clause).
          lastLowered?.kind === 'gainControl' && lastLowered.objects.kind === 'target'
          ? lastLowered.objects
          : // "They gain flying and vigilance until end of turn": one grant for each keyword, all of the same group.
            lastLowered?.kind === 'grantKeyword' && lastLowered.objects === ctx.lastCounteredGroup
            ? ctx.lastCounteredGroup
            : null;
    // Call for Aid: "those creatures" after "gain control of all creatures target opponent controls": the permanents the group `gainControl` took (`moved`), until an instruction moves other objects.
    ctx.gainedGroup =
      lastLowered?.kind === 'gainControl' && lastLowered.objects.kind === 'each'
        ? true
        : lowered.value.some((e) => GROUP_BREAKERS.includes(e.kind))
          ? false
          : ctx.gainedGroup;
    ctx.becameTarget =
      lastLowered?.kind === 'setTypes' &&
      lastLowered.objects.kind === 'target' &&
      lastLowered.duration === 'permanent'
        ? lastLowered.objects.id
        : null;
    // "its owner draws that many cards and each other player loses that much life": "other" is besides the player the instruction before it was said of.
    const lastEffect = lowered.value[lowered.value.length - 1];
    ctx.lastCastRemembered = lastEffect?.kind === 'castFree' && lastEffect.remember === true;
    ctx.lastPlayer =
      lastEffect !== undefined && 'player' in lastEffect && typeof lastEffect.player === 'object'
        ? (lastEffect.player as PlayerSelector)
        : null;
    if (lowered.value.some((e) => e.kind === 'chooseRandomFromGraveyard'))
      ctx.randomYardCard = true;
    if (lowered.value.some((e) => e.kind === 'choosePlayer')) ctx.choseAPlayer = true;
    noteRemoved(lowered.value, ctx);
    if (lowered.value.some((e) => e.kind === 'createToken')) ctx.madeAToken = true;
    noteTokensMade(lowered.value, ctx);
    noteMoved(lowered.value, ctx);
    noteExiledOwnGraveyards(clause, lowered.value, ctx);
    // Issue 104: the card the player chose from their graveyard and exiled is "that card" of the clause after it.
    ctx.chosenExiled =
      clause.verb === 'exileChosenCard' &&
      lowered.value.length === 1 &&
      lowered.value[0]?.kind === 'moveToZone';
    noteCreated(lowered.value, ctx);
    noteMadeToken(clause, lowered.value, ctx);
    // D-411: "them" of a choice from among the cards milled: the clause before it was one mill of the controller's own library.
    ctx.milled =
      lowered.value.length === 1 &&
      lowered.value[0]?.kind === 'mill' &&
      lowered.value[0].player.kind === 'you';
    // Locke, Treasure Hunter: "If a land card was milled this way" after "each player mills a card".
    ctx.milledEach =
      lowered.value.length === 1 &&
      lowered.value[0]?.kind === 'mill' &&
      lowered.value[0].player.kind === 'eachPlayer';
    // Issue 159: "Each opponent attacking that player does the same": the clause before it was one `createToken` for the controller.
    const only = lowered.value.length === 1 ? lowered.value[0] : undefined;
    ctx.createdToken = only?.kind === 'createToken' && only.controller === undefined ? only : null;
    // Curse of Verbosity: the clause before "does the same" was one plain draw by the controller.
    ctx.drewCards =
      only?.kind === 'draw' &&
      only.player.kind === 'you' &&
      only.upTo === undefined &&
      only.reveal === undefined
        ? only
        : null;
    // Issue 159: "a creature card put into a graveyard this way": the clause before it was a destroy.
    ctx.destroyed = lowered.value.length === 1 && lowered.value[0]?.kind === 'destroy';
    // Death Toll deck (Winter): "put a permanent card from among them onto the battlefield" after the exile of any number of cards with a card type minimum.
    ctx.exiledAnyCardTypes =
      lowered.value.length === 1 &&
      lowered.value[0]?.kind === 'moveToZone' &&
      lowered.value[0].objects.kind === 'choose' &&
      lowered.value[0].objects.minCardTypes !== undefined;
    // D-412: "If you put a Town card into your hand this way": the clause before it moved cards to the hand.
    ctx.movedToHand =
      lowered.value.length === 1 &&
      lowered.value[0]?.kind === 'moveToZone' &&
      lowered.value[0].to === 'hand';
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

/** "exile the top three cards instead": an exile of the top cards that names no library (`effect.exile-top-instead`). */
function isLibraryless(clause: IrClause): boolean {
  return clause.verb === 'exileTopInstead';
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
 * The two target sets of "If the gift was promised, ... instead" are chosen after the Gift decision:
 * the new targets belong to the promised branch, and replaced targets only to the other branch unless reused.
 */
function markGiftTargets(
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
    ctx.targets[k] = { ...spec, ifGiftPromised: true };
    marked = true;
  }
  if (replacement === null || replaced?.slots === undefined) return marked;
  for (let k = replaced.slots[0]; k < replaced.slots[1]; k += 1) {
    const spec = ctx.targets[k];
    if (spec === undefined || mentionsSlot(replacement, spec.id)) continue;
    ctx.targets[k] = { ...spec, ifGiftPromised: false };
    marked = true;
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

/**
 * "You may play those cards for as long as they remain exiled. If you cast a spell this way, you may spend mana as though it were mana of any color to cast it." (Brainstealer Dragon,
 * CR 609.4b): the sentence is the rider of the permission right before it: it sets the engine's `anyManaColor` on that `mayPlay`. Anywhere else it has nothing to attach to and is refused.
 */
function lowerAnyColorRider(
  sentence: IrSentence,
  previous: Step | undefined,
): LowerResult<Effects> | null {
  const [clause, ...more] = sentence.clauses;
  if (clause?.verb !== 'anyColorRider') return null;
  if (more.length > 0 || clause.optional || sentence.condition !== undefined) {
    return refuse(sentence);
  }
  if (clause.condition !== undefined || clause.duration !== undefined) return refuse(sentence);
  const [effect, ...rest] = previous?.effects ?? [];
  if (effect?.kind !== 'mayPlay' || rest.length > 0 || effect.anyManaColor !== undefined) {
    return refuse(sentence);
  }
  return { ok: true, value: [{ ...effect, anyManaColor: true }], rule: clause.rule };
}

/**
 * "Each of them enters with an additional -1/-1 counter on it." (Aberrant Return, CR 614.1c, 122.6): the permanents the sentence before it put onto the battlefield enter with the
 * counters, a replacement effect of the entering, so the engine's `withCounters` of that `moveToZone`. Only right after a sentence whose one effect is such a move of several
 * objects (a target slot of more than one, or every one of a kind), which has no counters of its own yet.
 */
function lowerEntersWithAdditional(
  sentence: IrSentence,
  previous: Step | undefined,
): LowerResult<Effects> | null {
  const [clause, ...more] = sentence.clauses;
  if (clause?.verb !== 'entersWithAdditionalCounters') return null;
  if (more.length > 0 || clause.optional || sentence.condition !== undefined) {
    return refuse(sentence);
  }
  if (clause.condition !== undefined || clause.duration !== undefined) return refuse(sentence);
  const count = clause.args.count;
  const counter = clause.args.counter;
  const [effect, ...rest] = previous?.effects ?? [];
  if (count?.kind !== 'number' || counter?.kind !== 'name') return refuse(sentence);
  if (effect?.kind !== 'moveToZone' || rest.length > 0) return refuse(sentence);
  if (effect.to !== 'battlefield' || effect.withCounters !== undefined) return refuse(sentence);
  if (effect.objects.kind !== 'target' && effect.objects.kind !== 'each') {
    return refuse(sentence);
  }
  return {
    ok: true,
    value: [{ ...effect, withCounters: { counter: counter.name, count: count.value } }],
    rule: clause.rule,
  };
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
 * "Then you may choose a token you control. If you do, each other token you control becomes a copy of that token." (Prismari group 1, D-642, CR 608.2d, 707.2): the offer and the sentence
 * after it are the engine's `chooseObjects` of one token (choosing none is declining it) and a `becomeCopy` of the others of the one chosen, which does nothing when none was chosen, so
 * "if you do" needs no test of its own. Null when the sentence is not the offer; a pair of another shape is refused, never guessed.
 */
function lowerChooseTokenPair(
  sentence: IrSentence,
  sentences: readonly IrSentence[],
  i: number,
  ctx: LowerContext,
): LowerResult<Effects> | null {
  const [clause, ...more] = sentence.clauses;
  if (clause?.verb !== 'chooseTokenYouControl') return null;
  const next = sentences[i + 1];
  const [second, ...rest] = next?.clauses ?? [];
  if (
    more.length > 0 ||
    !clause.optional ||
    clause.condition !== undefined ||
    clause.duration !== undefined ||
    sentence.condition !== undefined ||
    sentence.instead === true ||
    sentence.where !== undefined ||
    sentence.delayed !== undefined ||
    next === undefined ||
    next.condition?.test.kind !== 'didPrevious' ||
    next.instead === true ||
    next.where !== undefined ||
    next.reflexive === true ||
    next.delayed !== undefined ||
    second?.verb !== 'eachOtherTokenBecomesCopy' ||
    second.optional ||
    rest.length > 0
  ) {
    return refuse(sentence);
  }
  const offered = lowerClauses([{ ...clause, optional: false }], ctx);
  if (!offered.ok) return offered;
  const copied = lowerClauses([second], ctx);
  if (!copied.ok) return copied;
  return { ok: true, value: [...offered.value, ...copied.value], rule: clause.rule };
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
  /** The sentences after the one of "When you do": they are part of that reflexive ability (CR 603.12), as in "... create a token. Sacrifice it at the beginning of the next end step." */
  rest: readonly IrSentence[] = [],
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
  // "You may pay {1}{U}. When you do, tap target creature an opponent controls." (Hylda deck, D-511, CR 603.12, 118.1): the reflexive ability is created by the payment itself.
  const paidReflexive = next?.reflexive === true;
  if (!paidReflexive && (next?.condition?.test.kind !== 'didPrevious' || next.instead === true)) {
    return refuse(sentence);
  }
  if (next === undefined || next.clauses.some((c) => c.optional)) return refuse(sentence);
  if (
    paidReflexive &&
    (next.instead === true || next.where !== undefined || next.condition !== undefined)
  ) {
    return refuse(next);
  }
  const cost: Cost[] = [];
  for (const item of offer.costs) {
    // D-596 (CR 107.3c, 119.4): Tivash's "pay X life, where X is ..." is an amount-defined
    // life cost, not the announced-X cost `payXLife`; resolve it from the definition in this text.
    const definedLife =
      item.kind === 'payLife' && ctx.xIs !== null
        ? (ctx.xIs.lower?.() ?? lowerAmount(ctx.xIs.amount, ctx, item.rule))
        : null;
    if (definedLife !== null) {
      if (!definedLife.ok) return definedLife;
      if (ctx.xIs !== null) ctx.xIs.used = true;
      cost.push({ kind: 'payLife', amount: definedLife.value });
      continue;
    }
    // Issue 105 (Confiscation Coup, CR 107.14, 608.2c): "an amount of {E} equal to that permanent's mana value": worked out as the offer resolves.
    if (item.kind === 'energyAmount') {
      const energy = lowerAmount(item.amount, ctx, item.rule);
      if (!energy.ok) return energy;
      cost.push({ kind: 'energyAmount', amount: energy.value });
      continue;
    }
    // D-364 (CR 119.4): "you may pay that much life" is the life of a life gain trigger.
    // Issue 105 (CR 107.14): energy is paid for a `mayPay` as an `unlessPays` pays it.
    const lowered = lowerCost(item, {
      hybrid: true,
      eventLife: ctx.lifeGainTrigger === true,
      ...(item.kind === 'energy' ? { unless: true } : {}),
    });
    if (!lowered.ok) return lowered;
    cost.push(lowered.value);
  }
  const needs: FeatureRef[] = [
    'effect:mayPay',
    ...cost.map((c): FeatureRef => `cost:${c.kind}`),
    ...(paidReflexive ? (['effect:reflexive', 'ability:reflexivePaid'] as const) : []),
  ];
  const blocked = missingFeatures(needs);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  if (paidReflexive) {
    const reflexive =
      rest.length === 0 ? lowerReflexive(next, ctx) : lowerReflexiveBody(next, rest, ctx);
    if (!reflexive.ok) return reflexive;
    if (reflexive.value.kind !== 'reflexive') return refuse(next);
    return {
      ok: true,
      value: [
        {
          kind: 'mayPay',
          cost,
          effect: { ...reflexive.value, afterPayment: true },
        },
      ],
      rule: clause.rule,
    };
  }
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
  if (clause?.verb !== 'payAnyAmount' && clause?.verb !== 'payAnyNumberOfTimes') return null;
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
    (clause.verb === 'payAnyAmount' && mana.what.symbols.length !== 1) ||
    mana.what.symbols.length === 0 ||
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
  // Issue 121 (Bloodthirsty Adversary): "pay {2}{R} any number of times": the mana of one payment, numbers and colors only.
  const perTime = clause.verb === 'payAnyNumberOfTimes';
  if (perTime && !mana.what.symbols.every((s) => /^(?:\d+|[WUBRGC])$/.test(s))) {
    return refuse(sentence);
  }
  if (!perTime && (symbol === undefined || !/^[WUBRGC]$/.test(symbol))) return refuse(sentence);
  // The targets of the reflexive ability are its own (CR 603.12).
  const before = ctx.targets.length;
  const wasPayReflexive = ctx.payReflexive;
  ctx.payReflexive = perTime;
  const after = lowerClauses(next.clauses, ctx);
  ctx.payReflexive = wasPayReflexive;
  if (!after.ok) return after;
  const own = ctx.targets.splice(before);
  const effect: Effect = {
    kind: 'payAnyAmount',
    ...(perTime
      ? { cost: [...mana.what.symbols] }
      : { symbol: symbol as 'W' | 'U' | 'B' | 'R' | 'G' | 'C' }),
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

/**
 * "You may pay one or more {E}. If you do, create an X/X ... where X is the amount of {E} paid this way." and "... When you do, ~ deals that much damage to each other creature."
 * (issue 105, CR 107.14, 118.3, 603.12, 608.2c): the offer and the sentence after it are one engine `payAnyAmount` of the energy symbol. The player chooses how many counters to pay,
 * from none to as many as they have, and when they paid at least one the next sentence runs at once with X (and "that many") the number paid ("If you do"), or goes on the stack
 * as a reflexive ability of its own with `triggerDamage` ("that much") the number paid ("When you do"). It is the last offer of the text. Null when the sentence is not such an
 * offer; one that does not fit is refused, never guessed.
 */
function lowerPayEnergyAny(
  sentence: IrSentence,
  sentences: readonly IrSentence[],
  i: number,
  ctx: LowerContext,
): LowerResult<Effects> | null {
  const [clause, ...more] = sentence.clauses;
  if (clause?.verb !== 'payEnergyAny') return null;
  const next = sentences[i + 1];
  if (
    more.length > 0 ||
    !clause.optional ||
    clause.condition !== undefined ||
    clause.duration !== undefined ||
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    sentence.reflexive === true ||
    next === undefined ||
    next.instead === true ||
    next.clauses.some((c) => c.optional) ||
    (next.where !== undefined && next.where.kind !== 'x') ||
    i + 2 < sentences.length
  ) {
    return refuse(sentence);
  }
  const reflexive = next.reflexive === true;
  if (reflexive ? next.condition !== undefined : next.condition?.test.kind !== 'didPrevious') {
    return refuse(sentence);
  }
  const blocked = missingFeatures(
    reflexive
      ? ['effect:payAnyAmount', 'effect:reflexive', 'cost:energy']
      : ['effect:payAnyAmount', 'amount:x', 'cost:energy'],
  );
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  if (reflexive) {
    const before = ctx.targets.length;
    const wasPayReflexive = ctx.payReflexive;
    ctx.payReflexive = true;
    const after = lowerClauses(next.clauses, ctx);
    ctx.payReflexive = wasPayReflexive;
    if (!after.ok) return after;
    const own = ctx.targets.splice(before);
    return {
      ok: true,
      value: [
        {
          kind: 'payAnyAmount',
          symbol: 'E',
          reflexive: {
            ...(own.length > 0 ? { targets: own } : {}),
            effect: ownSource(oneEffect(after.value), ctx),
          },
        },
      ],
      rule: clause.rule,
    };
  }
  // The X of the follow-up is the number paid, which this effect defines: the text of the ability has no X of its own to announce (CR 107.3f).
  const usedX = ctx.usesX;
  ctx.usesX = false;
  const wasPayEnergyX = ctx.payEnergyX;
  ctx.payEnergyX = true;
  const after = lowerClauses(next.clauses, ctx);
  ctx.payEnergyX = wasPayEnergyX;
  const readX = ctx.usesX;
  ctx.usesX = usedX;
  if (!after.ok) return after;
  if (!readX) return refuse(next);
  return {
    ok: true,
    value: [{ kind: 'payAnyAmount', symbol: 'E', ifPaid: oneEffect(after.value) }],
    rule: clause.rule,
  };
}

/**
 * "Starting with you, each player may choose an artifact or enchantment you don't control. Destroy each permanent chosen this way." (issue 105, Druid of Purification; CR 101.4, 608.2d,
 * 701.8): the two sentences are one engine `eachPlayerChoosesDestroy`. The permanents a player may choose are the noun of the first sentence, read from the controller of the effect.
 * Null when the sentence is not such a choice; one that does not fit is refused, never guessed.
 */
function lowerEachPlayerChoosesDestroy(
  sentence: IrSentence,
  sentences: readonly IrSentence[],
  i: number,
  _ctx: LowerContext,
): LowerResult<Effects> | null {
  const [clause, ...more] = sentence.clauses;
  if (clause?.verb !== 'eachPlayerMayChoose') return null;
  const next = sentences[i + 1];
  const [then, ...thenMore] = next?.clauses ?? [];
  const what = clause.args.what;
  if (
    more.length > 0 ||
    clause.optional ||
    clause.condition !== undefined ||
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    next === undefined ||
    next.condition !== undefined ||
    next.where !== undefined ||
    next.instead === true ||
    then?.verb !== 'destroyChosenThisWay' ||
    thenMore.length > 0 ||
    what?.kind !== 'noun' ||
    i + 2 < sentences.length
  ) {
    return refuse(sentence);
  }
  const blocked = missingFeatures(['effect:eachPlayerChoosesDestroy']);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  const filter = lowerFilter(what);
  if (!filter.ok) return filter;
  return {
    ok: true,
    value: [{ kind: 'eachPlayerChoosesDestroy', filter: filter.value }],
    rule: clause.rule,
  };
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
  // Quandrix Unlimited deck, group G (CR 122.1, 608.2c): "you may remove a +1/+1 counter from ~. If you do, ...".
  'removeCounters',
  // Mari, the Killing Quill (CR 122.1, 608.2c): "you may remove a hit counter from a card that player owns in exile. If you do, ...".
  'removeChosenCounters',
  // Issue 102 (Ob Nixilis, the Fallen, CR 119.3, 608.2c): "you may have target player lose 3 life. If you do, ...": done when some life was lost.
  'loseLife',
]);

/**
 * "..., you may sacrifice it." before "When you do, choose one —" (Gorbag of Minas Morgul; CR 603.12, 608.2d, 701.21): the offer, one optional sacrifice, as the engine's `may` of
 * it (the instruction whose doing the engine can tell). No test, "instead", "where" or other part is read in the sentence; it is refused, never guessed.
 */
export function lowerOfferSentence(sentence: IrSentence, ctx: LowerContext): LowerResult<Effect> {
  const [clause, ...more] = sentence.clauses;
  if (
    clause === undefined ||
    more.length > 0 ||
    !clause.optional ||
    sentence.condition !== undefined ||
    sentence.instead === true ||
    sentence.where !== undefined ||
    sentence.reflexive === true ||
    sentence.delayed !== undefined ||
    sentence.mayBy !== undefined ||
    clause.condition !== undefined ||
    clause.duration !== undefined
  ) {
    return refuse(sentence);
  }
  const blocked = missingFeatures(['effect:may']);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  const offered = lowerClauses([{ ...clause, optional: false }], ctx);
  if (!offered.ok) return offered;
  const [only, ...rest] = offered.value;
  if (only === undefined || rest.length > 0 || only.kind !== 'sacrifice') {
    return refuse(sentence);
  }
  return { ok: true, value: { kind: 'may', effect: only }, rule: clause.rule };
}

/** "Those creatures get +4/+4 until end of turn." as the first instruction of an attack batch trigger: the engine's `modifyPt` of the `triggerAttackers`. */
function lowerThoseAttackers(sentence: IrSentence, ctx: LowerContext): LowerResult<Effects> {
  const rule = sentence.clauses[0]?.rule ?? sentence.rule;
  if (sentence.condition !== undefined || sentence.clauses.some((c) => c.verb !== 'pumpThose')) {
    return refuse(sentence);
  }
  const blocked = missingFeatures([
    'effect:modifyPt',
    'duration:untilEndOfTurn',
    'selector:triggerAttackers',
  ]);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  const effects: Effect[] = [];
  for (const clause of sentence.clauses) {
    const pt = arg(clause, 'pt');
    if (pt?.kind !== 'ptChange' || clause.duration?.scope !== 'untilEndOfTurn') {
      return refuse(sentence);
    }
    const power = lowerPtTerm(pt.power, pt.span, ctx, pt.rule);
    if (!power.ok) return power;
    const toughness = lowerPtTerm(pt.toughness, pt.span, ctx, pt.rule);
    if (!toughness.ok) return toughness;
    effects.push({
      kind: 'modifyPt',
      objects: { kind: 'triggerAttackers' },
      power: power.value,
      toughness: toughness.value,
      duration: 'untilEndOfTurn',
    });
  }
  return { ok: true, value: effects, rule };
}

/**
 * "Untap those creatures." (stage P64, D-217, CR 701.26a, 611.2c), "..., untap those creatures and they get an additional +2/+2 until end of turn." (Food and Fellowship deck, group B,
 * CR 611.2c, 613.4c): the permanents the sentence before it gave +N/+N or a keyword, the group it named as it resolved (`each`): untapped, and given one more change, as that group
 * stands right after it (nothing happens in between, and the group's filter does not read what the pump changed). The sentence before it is one plain sentence of that group's
 * pumps and grants, or an untap of it; after anything else "those creatures" has no group and the sentence is refused. An "if" at the front of the sentence (CR 608.2c, 603.4: tested
 * as the sentence is followed) wraps what it does in the engine's `conditional`.
 */
function lowerThoseGroup(
  sentence: IrSentence,
  before: Step | undefined,
  ctx: LowerContext,
): LowerResult<Effects> {
  if (
    sentence.clauses.length === 0 ||
    sentence.clauses.length > 2 ||
    sentence.clauses.some(
      (c) => c.optional || (c.verb !== 'untapThose' && c.verb !== 'pumpThose'),
    ) ||
    sentence.where !== undefined ||
    sentence.instead === true ||
    sentence.reflexive === true ||
    sentence.delayed !== undefined ||
    sentence.mayBy !== undefined
  ) {
    return refuse(sentence);
  }
  const group = before?.effects.map((e) =>
    (e.kind === 'modifyPt' || e.kind === 'grantKeyword' || e.kind === 'untap') &&
    e.objects.kind === 'each'
      ? e.objects
      : e.kind === 'gainControl' && e.objects.kind === 'target'
        ? e.objects
        : // Call for Aid (CR 611.2c, 400.7j): the permanents a group `gainControl` took are "those creatures": the engine's `moved`, as the filter of the group (the creatures the other player
          // controls) no longer names them once they are controlled by you.
          e.kind === 'gainControl' && e.objects.kind === 'each'
          ? ({ kind: 'moved' } as const)
          : null,
  );
  // Champions from Beyond (CR 508.1): with no instruction before it, "those creatures" of an attack batch trigger are the creatures the attack declared.
  if (before === undefined && ctx.attackBatchThose) {
    return lowerThoseAttackers(sentence, ctx);
  }
  const [first] = group ?? [];
  if (
    before === undefined ||
    first === null ||
    first === undefined ||
    !(group ?? []).every((g) => g !== null && JSON.stringify(g) === JSON.stringify(first))
  ) {
    return refuse(sentence);
  }
  const effects: Effect[] = [];
  for (const clause of sentence.clauses) {
    if (clause.verb === 'untapThose') {
      const blocked = missingFeatures(['effect:untap']);
      if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
      effects.push({ kind: 'untap', objects: first });
      continue;
    }
    const pt = arg(clause, 'pt');
    if (pt?.kind !== 'ptChange' || clause.duration?.scope !== 'untilEndOfTurn') {
      return refuse(sentence);
    }
    const blocked = missingFeatures(['effect:modifyPt', 'duration:untilEndOfTurn']);
    if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
    // A group that was gained from a target is a single slot of the ability, which a pump of the group does not name again.
    if (first.kind !== 'each') return refuse(sentence);
    const power = lowerPtTerm(pt.power, pt.span, ctx, pt.rule);
    if (!power.ok) return power;
    const toughness = lowerPtTerm(pt.toughness, pt.span, ctx, pt.rule);
    if (!toughness.ok) return toughness;
    effects.push({
      kind: 'modifyPt',
      objects: first,
      power: power.value,
      toughness: toughness.value,
      duration: 'untilEndOfTurn',
    });
  }
  const rule = sentence.clauses[0]?.rule ?? sentence.rule;
  if (sentence.condition === undefined) return { ok: true, value: effects, rule };
  const blocked = missingFeatures(SENTENCE_NEEDS);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  const condition = lowerCondition(sentence.condition, false, ctx);
  if (!condition.ok) return condition;
  return {
    ok: true,
    value: [{ kind: 'conditional', condition: condition.value, effect: oneEffect(effects) }],
    rule,
  };
}

/** The instructions a spell may offer with "you may" and nothing after it (stage P63, D-216). */
const LONE_MAY_KINDS: ReadonlySet<string> = new Set(['shuffle', 'mill']);

/**
 * "You may search your library for a Plains card and put it onto the battlefield tapped. Then if an opponent controls more lands than you, repeat this process once." (Lorehold group 1,
 * CR 608.2d, 701.23): a "you may" search that a later "repeat this process" does again. Each search asks for itself (the engine's `search` with `optional`: a declined search is not a search,
 * CR 701.23a), so the offer is on the search and not on the ability. Null when the sentence is not one offered search or no sentence of the text repeats; a search that is more than that is
 * refused, never guessed.
 */
function lowerOfferedSearch(
  sentence: IrSentence,
  sentences: readonly IrSentence[],
  ctx: LowerContext,
): LowerResult<Effects> | null {
  const [clause, ...more] = sentence.clauses;
  if (clause?.verb !== 'search' || !clause.optional) return null;
  // An activated ability has no "you may" of its own (Demolition Field), so there the lone offer is the search's.
  if (
    !ctx.activatedBody &&
    !sentences.some((s) => s.clauses.some((c) => c.verb === 'repeatProcess'))
  ) {
    return null;
  }
  if (
    more.length > 0 ||
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    sentence.instead === true ||
    sentence.reflexive === true ||
    sentence.delayed !== undefined ||
    sentence.mayBy !== undefined
  ) {
    return refuse(sentence);
  }
  const lowered = lowerClauses([{ ...clause, optional: false }], ctx);
  if (!lowered.ok) return lowered;
  const [only, ...rest] = lowered.value;
  // The search of another player has its own "may" (`optional` already); only the controller's own is offered here.
  if (
    only?.kind !== 'search' ||
    rest.length > 0 ||
    only.optional === true ||
    only.player.kind !== 'you'
  ) {
    return refuse(sentence);
  }
  return { ok: true, value: [{ ...only, optional: true }], rule: clause.rule };
}

/**
 * "Then if an opponent controls more lands than you, repeat this process once." (Lorehold group 1, CR 608.2c): the instruction before it is done again, once, when the test holds. The
 * process is the one sentence before it, which is not a choice of targets (a second choice of targets would be another question); a text that repeats more than one sentence is refused,
 * as the words do not say how far back "this process" goes. The test is read as the instruction comes up (the engine's `conditional`). Only "once".
 */
function lowerRepeatProcess(
  sentence: IrSentence,
  steps: readonly Step[],
  ctx: LowerContext,
): LowerResult<Effects> {
  const [clause, ...more] = sentence.clauses;
  if (
    clause === undefined ||
    more.length > 0 ||
    clause.optional ||
    clause.condition !== undefined ||
    sentence.where !== undefined ||
    sentence.instead === true ||
    sentence.reflexive === true ||
    sentence.delayed !== undefined ||
    sentence.mayBy !== undefined ||
    steps.length !== 1
  ) {
    return refuse(sentence);
  }
  const [process] = steps;
  // A choice of targets in the process would be asked again, which no text says; the process is without any.
  if (process === undefined || process.effects.length === 0 || ctx.targets.length > 0) {
    return refuse(sentence);
  }
  const blocked = missingFeatures(['effect:conditional']);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  const again = oneEffect(process.effects);
  // "Repeat this process six more times." (Death Toll deck, group C, Professor Onyx): the process is done again that many more times, one after the other.
  const times = arg(clause, 'times');
  if (times !== undefined && (times.kind !== 'number' || sentence.condition !== undefined)) {
    return refuse(sentence);
  }
  if (sentence.condition === undefined) {
    return {
      ok: true,
      value: Array.from({ length: times?.kind === 'number' ? times.value : 1 }, () => again),
      rule: clause.rule,
    };
  }
  const condition = lowerCondition(sentence.condition, false, ctx);
  if (!condition.ok) return condition;
  return {
    ok: true,
    value: [{ kind: 'conditional', condition: condition.value, effect: again }],
    rule: clause.rule,
  };
}

/**
 * "Create a 1/1 black and green Insect creature token, then mill a card. If an Insect card was milled this way, put a loyalty counter on ~ and repeat this process." (Death Toll deck,
 * group C, Grist, the Hunger Tide; CR 608.2c): the sentence before it is the process, the test of this sentence is when it is done again, after what is put before "repeat". The
 * engine's `repeatWhile`. The process is the one sentence before it, ending in a mill of the controller's library (so that it ends), with no choice of targets; a sentence with no test, or
 * one that repeats more than one sentence, is refused.
 */
function lowerRepeatWhile(
  sentence: IrSentence,
  steps: readonly Step[],
  ctx: LowerContext,
): LowerResult<Effects> {
  const clauses = sentence.clauses;
  const last = clauses[clauses.length - 1];
  const [process] = steps;
  if (
    last === undefined ||
    sentence.condition === undefined ||
    sentence.where !== undefined ||
    sentence.instead === true ||
    sentence.otherwise === true ||
    sentence.reflexive === true ||
    sentence.delayed !== undefined ||
    sentence.mayBy !== undefined ||
    clauses.some((c) => c.optional || c.condition !== undefined) ||
    steps.length !== 1 ||
    process === undefined ||
    ctx.targets.length > 0 ||
    // Each pass takes cards out of a library, so the repeat ends (`validateCard` asks the same): a mill, or cards drawn before a clash (CR 701.30d, Hoarder's Greed).
    !(
      process.effects[process.effects.length - 1]?.kind === 'mill' ||
      (process.effects[process.effects.length - 1]?.kind === 'clash' &&
        process.effects.some((e) => e.kind === 'draw'))
    )
  ) {
    return refuse(sentence);
  }
  const blocked = missingFeatures(['effect:repeatWhile']);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  // The condition is read as the clause before it was lowered, which is the mill of the process (`ctx.milled`).
  const condition = lowerCondition(sentence.condition, false, ctx);
  if (!condition.ok) return condition;
  const beforeClauses = clauses.slice(0, -1);
  const before =
    beforeClauses.length === 0
      ? { ok: true as const, value: [], rule: last.rule }
      : lowerClauses(beforeClauses, ctx);
  if (!before.ok) return before;
  const effect: Effect = {
    kind: 'repeatWhile',
    effects: process.effects,
    condition: condition.value,
    ...(before.value.length === 0 ? {} : { beforeAgain: before.value }),
  };
  return { ok: true, value: [effect], rule: last.rule };
}

/**
 * "You may shuffle." (Ponder, stage P63, D-216, CR 608.2d, 701.24): a sentence of one optional instruction, with no "if you do" after it, is the engine's `may`
 * of that instruction, asked as it comes up. Only the instructions of `LONE_MAY_KINDS`; null when the sentence is not such an offer.
 */
function lowerLoneMay(sentence: IrSentence, ctx: LowerContext): LowerResult<Effects> | null {
  const [clause, ...more] = sentence.clauses;
  // Issue 100 (CR 608.2g): "..., you may cast a spell ... without paying its mana cost": the free cast asks the controller itself (and may be declined), so the "you may" of the
  // trigger that made the clause optional is already said by the engine's `castFree`, not a `may` of its own (whose answer `didPrevious` could not read).
  if (
    (clause?.verb === 'castFree' ||
      clause?.verb === 'castChosenGraveyardSpell' ||
      // Summon: Esper Valigarmanda (CR 608.2g): "You may cast an instant or sorcery card exiled with ~, and mana of any type can be spent to cast that spell."
      clause?.verb === 'castExiledWithPaying' ||
      // Mind's Dilation (CR 608.2g): "If it's a nonland card, you may cast it without paying its mana cost" after the exile of the top card: the engine's `castFree` of that card, under the test.
      (clause?.verb === 'castMovedFree' && sentence.condition?.test.kind === 'objectMatches')) &&
    clause.optional &&
    more.length === 0
  ) {
    // Death Toll deck, group D (CR 608.2c): "Then if there are twenty or more cards in your graveyard, you may play the exiled card without paying its mana cost.": a test of the
    // game the sentence starts with, which the engine's `conditional` runs the free cast under (the cast is the controller's to decline, as with no test). Any other test (what an
    // offer before it did, a kicker) is still refused here, never guessed.
    const test = sentence.condition?.test.kind;
    const stateTest =
      test === 'cardsInGraveyard' ||
      test === 'amountIs' ||
      test === 'control' ||
      // The card the exile of the top card took ("it"): read when the instruction comes up.
      (clause.verb === 'castMovedFree' && test === 'objectMatches');
    if (
      (sentence.condition !== undefined && !stateTest) ||
      sentence.instead === true ||
      sentence.where !== undefined
    ) {
      return refuse(sentence);
    }
    let guard: Condition | null = null;
    if (sentence.condition !== undefined) {
      const blocked = missingFeatures(['effect:conditional']);
      if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
      const lowered = lowerCondition(sentence.condition, false, ctx);
      if (!lowered.ok) return lowered;
      guard = lowered.value;
    }
    const play = clause.args.play;
    const offered =
      play?.kind !== 'flag'
        ? clause
        : {
            ...clause,
            args: {
              ...clause.args,
              mayWritten: { kind: 'flag' as const, value: true, span: play.span, rule: play.rule },
            },
          };
    // The lowering of `castMovedFree` asks for the "you may", which is the engine's own question (`acceptsOptional`).
    const cast = lowerClauses(
      [clause.verb === 'castMovedFree' ? offered : { ...offered, optional: false }],
      ctx,
    );
    if (!cast.ok || guard === null) return cast;
    return {
      ok: true,
      value: [{ kind: 'conditional', condition: guard, effect: oneEffect(cast.value) }],
      rule: cast.rule,
    };
  }
  // Limit Break deck (Yuffie, Materia Hunter; CR 608.2d, 701.3): "Then you may attach an Equipment you control to ~.": the choice of none or one Equipment is the offer itself (the engine's
  // `chooseObjects` of up to one, and an `attach` of nothing does nothing), so it is not wrapped in a `may`.
  if (clause?.verb === 'attachOwnToSelf' && clause.optional && more.length === 0) {
    if (
      sentence.condition !== undefined ||
      sentence.instead === true ||
      sentence.where !== undefined
    ) {
      return refuse(sentence);
    }
    return lowerClauses([{ ...clause, optional: false }], ctx);
  }
  // Issue 102 (Teval, the Balanced Scale): "Then you may return a land card from your graveyard to the battlefield tapped.": a card chosen from the graveyard, the choice of none or one is
  // the offer itself (the engine's `moveToZone` of a `choose` with `optional`), so it is not wrapped in a `may`.
  if (clause?.verb === 'putFromZone' && clause.optional && more.length === 0) {
    if (
      sentence.condition !== undefined ||
      sentence.instead === true ||
      sentence.where !== undefined
    ) {
      return refuse(sentence);
    }
    const may = { kind: 'flag' as const, value: true, span: clause.span, rule: clause.rule };
    return lowerClauses([{ ...clause, optional: false, args: { ...clause.args, may } }], ctx);
  }
  if (
    clause === undefined ||
    more.length > 0 ||
    !clause.optional ||
    (clause.verb !== 'shuffle' && clause.verb !== 'mill')
  ) {
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
): (LowerResult<Effects> & { readonly last?: number }) | null {
  const next = sentences[i + 1];
  // Death Toll deck, group D (CR 608.2c, 701.8): "you may destroy another target creature. If a creature is destroyed this way, ...": the sentence after the offer runs when
  // the destroy really destroyed a permanent.
  const destroyed = next?.condition?.test.kind === 'destroyedThisWay';
  const follows =
    next?.condition?.test.kind === 'didPrevious' || next?.reflexive === true || destroyed;
  // The sentence after the offer may ask the players itself ("If you do, each opponent may ..."): `lowerPlayersMay` reads it.
  if (next === undefined || !follows) return null;
  if (
    !sentence.clauses.every((c) => c.optional) ||
    sentence.clauses.some((c) => c.verb === 'pay')
  ) {
    return null;
  }
  if (destroyed) {
    // The condition says "a creature": the engine counts every permanent the destroy destroyed, so the offer must name creatures only (anything else is refused, never guessed).
    const [only] = sentence.clauses;
    const objects = only?.args.objects;
    if (
      sentence.clauses.length !== 1 ||
      only?.verb !== 'destroy' ||
      objects?.kind !== 'noun' ||
      objects.filter.types?.join() !== 'creature' ||
      objects.filter.anyOf !== undefined
    ) {
      return refuse(sentence);
    }
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
    // Lorehold group 1: "you may exile one of them from your graveyard" keeps its "you may": the engine's choice of none or one card is that offer.
    sentence.clauses.map((c) => ({
      ...c,
      // Issue 104: "you may exile a creature card from your graveyard" is a choice of none or one card, the offer itself.
      // Death Toll deck (Winter): "you may exile any number of cards from your graveyard with four or more card types among them" is the same kind of offer (none, or the cards chosen).
      optional:
        (c.verb === 'exileOneOfThem' ||
          c.verb === 'exileChosenCard' ||
          c.verb === 'exileGraveyardCardTypes') &&
        c.optional,
    })),
    ctx,
  );
  if (!offered.ok) return offered;
  const [only, ...more] = offered.value;
  // "You may tap X untapped Myr you control. If you do, ..." (stage P31, D-140, CR 701.26a): the choice of any number of them is the
  // offer itself (tapping none is declining it, and is not "doing it"), so the tap is not wrapped in a question of its own.
  const chooseAny =
    (only?.kind === 'tap' && only.objects.kind === 'choose' && only.objects.anyNumber) ||
    only?.kind === 'exileFromTriggerCards' ||
    (only?.kind === 'moveToZone' &&
      only.to === 'exile' &&
      only.objects.kind === 'choose' &&
      only.objects.optional === true);
  // "you may destroy ... If a creature is destroyed this way": checked above to be a destroy of creatures, which is the offer here, and not an offer "if you do" may read.
  const mayDestroy = destroyed && only?.kind === 'destroy';
  if (
    only === undefined ||
    more.length > 0 ||
    (!MAY_KINDS.has(only.kind) && !chooseAny && !mayDestroy)
  ) {
    return refuse(sentence);
  }
  const may: Effect = chooseAny ? only : { kind: 'may', effect: only };
  if (!reflexive && next.mayBy !== undefined) {
    // "You may sacrifice a creature. If you do, each opponent may sacrifice a permanent of their choice that shares a card type with it. For each opponent who doesn't, ..." (Meren deck,
    // Braids; CR 608.2c, 608.2d, 101.4): the sentence after the offer asks the players, in turn order, and what is done for those who decline is the sentence after that.
    const asking = lowerPlayersMay(next, sentences, i + 1, ctx, true);
    if (asking === null) return refuse(next);
    if (!asking.result.ok) return asking.result;
    return {
      ok: true,
      value: [
        may,
        {
          kind: 'conditional',
          condition: { kind: 'didPrevious' },
          effect: oneEffect(asking.result.value),
        },
      ],
      rule: sentence.clauses[0]?.rule ?? sentence.rule,
      last: asking.last,
    };
  }
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
    // "If a creature is destroyed this way": what the destroy counted, not whether the offer was accepted (an indestructible target is accepted and not destroyed).
    const test = next.condition === undefined ? null : lowerCondition(next.condition, false, ctx);
    if (destroyed && (test === null || !test.ok)) return test ?? refuse(next);
    const conditional: Effect = {
      kind: 'conditional',
      condition: destroyed && test?.ok === true ? test.value : { kind: 'didPrevious' },
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
 * "If it has mana value 3 or less, you may put it onto the battlefield. If you don't put it onto the battlefield, put it into your hand." (Cosmic Rebirth, D-403, CR 608.2c,
 * 608.2d, 400.3): two sentences, the first an offer to put a card a target phrase of the text named onto the battlefield (with a test before it, or without), the second what is done
 * when that did not happen: the player declined, the test failed (the offer was never made) or the card could not enter. So the effect is the engine's `may` of the move and a
 * `conditional` on "not `didPrevious`" for the other instruction; with a test the whole is `conditional(test, [may(A), conditional(not didPrevious, B)], else B)`, so that when the
 * test fails the second sentence is done without anything of the offer to read (`didPrevious` after an offer that was not made would read what an earlier instruction did).
 * Null when the sentence after is not "If you don't put it onto the battlefield, ..."; a pair of another shape is refused, never guessed.
 */
function lowerMayElse(
  sentence: IrSentence,
  sentences: readonly IrSentence[],
  i: number,
  ctx: LowerContext,
): LowerResult<Effects> | null {
  const next = sentences[i + 1];
  if (next?.condition?.test.kind !== 'notPutOntoBattlefield') return null;
  const [offer, ...more] = sentence.clauses;
  const [other, ...moreOther] = next.clauses;
  if (
    offer === undefined ||
    other === undefined ||
    more.length > 0 ||
    moreOther.length > 0 ||
    !offer.optional ||
    other.optional ||
    offer.verb !== 'putMovedOntoBattlefield' ||
    other.verb !== 'putItIntoHand' ||
    offer.condition !== undefined ||
    offer.duration !== undefined ||
    sentence.instead === true ||
    sentence.where !== undefined ||
    sentence.reflexive === true ||
    sentence.delayed !== undefined ||
    sentence.mayBy !== undefined ||
    next.instead === true ||
    next.where !== undefined ||
    next.reflexive === true ||
    next.delayed !== undefined ||
    next.mayBy !== undefined
  ) {
    return refuse(next);
  }
  const blocked = missingFeatures([
    'effect:may',
    'effect:conditional',
    'condition:didPrevious',
    'condition:not',
  ]);
  if (blocked.length > 0) return { ...refuse(next), needs: blocked };
  const test =
    sentence.condition === undefined ? undefined : lowerCondition(sentence.condition, false, ctx);
  if (test !== undefined && !test.ok) return test;
  const offered = lowerClauses([{ ...offer, optional: false }], ctx);
  if (!offered.ok) return offered;
  const instead = lowerClauses([other], ctx);
  if (!instead.ok) return instead;
  const [move, ...rest] = offered.value;
  const [otherwise, ...restOther] = instead.value;
  if (
    move === undefined ||
    otherwise === undefined ||
    rest.length > 0 ||
    restOther.length > 0 ||
    !MAY_KINDS.has(move.kind)
  ) {
    return refuse(sentence);
  }
  const offerThenOther: Effect[] = [
    { kind: 'may', effect: move },
    {
      kind: 'conditional',
      condition: { kind: 'not', term: { kind: 'didPrevious' } },
      effect: otherwise,
    },
  ];
  const value: Effect[] =
    test === undefined
      ? offerThenOther
      : [
          {
            kind: 'conditional',
            condition: test.value,
            effect: { kind: 'sequence', effects: offerThenOther },
            else: otherwise,
          },
        ];
  return { ok: true, value, rule: offer.rule };
}

/**
 * "Exile another target creature you control. You may return that card to the battlefield under its owner's control. If you don't, at the beginning of the next end step, return that card
 * to the battlefield under its owner's control with a vigilance counter and a lifelink counter on it." (Gilraen, Dúnedain Protector; CR 608.2c, 608.2d, 603.7c, 400.7, 122.6): the offer
 * is the engine's `may` of the return of the card the exile before it moved; the sentence after it, for the player who did not (declined, or the card could not come back), is a
 * `conditional` on "not `didPrevious`" of a delayed return of the same card, which the exile moved and the declined offer left as it was (`moved` is the exiled card, bound as the delayed
 * ability is made). Null when the sentence is not such an offer; a pair of another shape is refused, never guessed.
 */
function lowerOfferedReturnElse(
  sentence: IrSentence,
  sentences: readonly IrSentence[],
  i: number,
  steps: readonly Step[],
  ctx: LowerContext,
): LowerResult<Effects> | null {
  const next = sentences[i + 1];
  const [offer, ...more] = sentence.clauses;
  if (
    next?.condition?.test.kind !== 'youDont' ||
    offer?.verb !== 'return' ||
    !offer.optional ||
    next.delayed === undefined
  ) {
    return null;
  }
  const [other, ...moreOther] = next.clauses;
  const exiled = steps[steps.length - 1]?.effects.some((e) => e.kind === 'exile');
  if (
    more.length > 0 ||
    other === undefined ||
    moreOther.length > 0 ||
    other.optional ||
    other.verb !== 'return' ||
    exiled !== true ||
    offer.condition !== undefined ||
    other.condition !== undefined ||
    sentence.condition !== undefined ||
    sentence.instead === true ||
    sentence.where !== undefined ||
    sentence.reflexive === true ||
    sentence.delayed !== undefined ||
    sentence.mayBy !== undefined ||
    next.instead === true ||
    next.where !== undefined ||
    next.reflexive === true ||
    next.mayBy !== undefined ||
    next.delayed.step !== 'endStep'
  ) {
    return refuse(next);
  }
  const blocked = missingFeatures([
    'effect:may',
    'effect:conditional',
    'effect:delayedTrigger',
    'condition:didPrevious',
    'condition:not',
  ]);
  if (blocked.length > 0) return { ...refuse(next), needs: blocked };
  // Both sentences name the card the one exile moved: the offer must not make the second forget it.
  const exiledRef = ctx.exiledRef;
  const offered = lowerClauses([{ ...offer, optional: false }], ctx);
  if (!offered.ok) return offered;
  ctx.exiledRef = exiledRef;
  const later = lowerClauses([other], ctx);
  if (!later.ok) return later;
  const [move, ...rest] = offered.value;
  const [back, ...restBack] = later.value;
  if (
    move?.kind !== 'moveToZone' ||
    move.objects.kind !== 'moved' ||
    rest.length > 0 ||
    back?.kind !== 'moveToZone' ||
    back.objects.kind !== 'moved' ||
    restBack.length > 0
  ) {
    return refuse(next);
  }
  return {
    ok: true,
    value: [
      { kind: 'may', effect: move },
      {
        kind: 'conditional',
        condition: { kind: 'not', term: { kind: 'didPrevious' } },
        effect: {
          kind: 'delayedTrigger',
          at: { step: next.delayed.step, whose: next.delayed.whose },
          effect: back,
        },
      },
    ],
    rule: offer.rule,
  };
}

/**
 * "You may put a land card from among them into your hand. If you don't, put a +1/+1 counter on this creature." (Ainok Wayfarer, Blanchwood Prowler, Airlift Chaplain; D-411, CR 608.2c,
 * 608.2d): the sentence after a choice from among the cards a mill moved says what is done when no card was put into the hand: the player declined, no card matched or nothing was
 * milled. The choice is the offer itself (it starts what "if you do" reads again, `rules/move-choice.ts`), so the second sentence is a `conditional` on "not `didPrevious`". Null
 * when the sentence is not "If you don't"; one that does not follow such a choice is refused, never guessed.
 */
function lowerYouDont(
  sentence: IrSentence,
  previous: Step | undefined,
  ctx: LowerContext,
): LowerResult<Effects> | null {
  if (sentence.condition?.test.kind !== 'youDont') return null;
  const last = previous?.effects[previous.effects.length - 1];
  const afterChoice =
    previous?.effects.length === 1 &&
    last?.kind === 'moveToZone' &&
    last.objects.kind === 'choose' &&
    last.objects.fromMoved === true &&
    last.objects.optional === true;
  // Issue 100 (Baral and Kari Zev, CR 608.2c, 608.2g): "You may cast a spell ... without paying its mana cost. If you don't, ...": the free cast is the offer (it starts what "if you do" reads
  // again, `rules/cast-free.ts`), and "you don't" is that no spell was cast: declined, or none could be.
  const afterFreeCast =
    previous?.effects.length === 1 && last?.kind === 'castFree' && last.max === undefined;
  // Chandra, Torch of Defiance (CR 608.2c, 608.2g): "You may cast that card. If you don't, ...": the cast of the exiled card is the offer, and "you don't" is that no spell was cast (declined, or it
  // could not be cast: a land, nothing to pay with).
  const afterCastCard = previous?.effects.length === 1 && last?.kind === 'castCard';
  if (
    !(afterChoice || afterFreeCast || afterCastCard) ||
    sentence.instead === true ||
    sentence.where !== undefined ||
    sentence.reflexive === true ||
    sentence.delayed !== undefined ||
    sentence.mayBy !== undefined ||
    sentence.clauses.some((c) => c.optional)
  ) {
    return refuse(sentence);
  }
  const blocked = missingFeatures(['condition:didPrevious', 'effect:conditional', 'condition:not']);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  const after = lowerClauses(sentence.clauses, ctx);
  if (!after.ok) return after;
  // "... create a token. It gains haste until end of turn.": the tokens made inside the conditional are what "it" of the next sentence names (the engine's `moved`, empty when none was made).
  if (after.value.some((e) => e.kind === 'createToken' || e.kind === 'createCopies')) {
    ctx.tokensMade = true;
  }
  return {
    ok: true,
    value: [
      {
        kind: 'conditional',
        condition: { kind: 'not', term: { kind: 'didPrevious' } },
        effect: oneEffect(after.value),
      },
    ],
    rule: sentence.clauses[0]?.rule ?? sentence.rule,
  };
}

/**
 * "If you don't, create First Mate Ragavan, a legendary 2/1 red Monkey Pirate creature token. It gains haste until end of turn." (issue 100, CR 608.2c, 611.2a): the sentence after the
 * "If you don't" conditional that makes a token and says what the token gains. The tokens exist only inside that conditional, so what they gain is done there (the engine's `moved`
 * means the tokens made). Null when the sentence is not such a rider; one that does not fit is refused, never guessed.
 */
function lowerTokenRiderOfYouDont(
  sentence: IrSentence,
  previous: Step | undefined,
  ctx: LowerContext,
): LowerResult<Effects> | null {
  const [only] = previous?.effects ?? [];
  if (
    previous?.effects.length !== 1 ||
    only?.kind !== 'conditional' ||
    only.condition.kind !== 'not' ||
    only.condition.term.kind !== 'didPrevious' ||
    !ctx.tokensMade ||
    sentence.condition !== undefined ||
    sentence.clauses.some((c) => c.optional) ||
    !sentence.clauses.every((c) => c.verb === 'grantKeywordToMade' || c.verb === 'grantKeyword')
  ) {
    return null;
  }
  const lowered = lowerClauses(sentence.clauses, ctx);
  if (!lowered.ok) return lowered;
  // Only what the tokens made gain: a keyword granted to `moved`, which is those tokens here.
  if (!lowered.value.every((e) => e.kind === 'grantKeyword' && e.objects.kind === 'moved')) {
    return refuse(sentence);
  }
  const inner = only.effect;
  const effects =
    inner.kind === 'sequence' ? [...inner.effects, ...lowered.value] : [inner, ...lowered.value];
  return {
    ok: true,
    value: [{ ...only, effect: { kind: 'sequence', effects } }],
    rule: lowered.rule,
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
      // Loamcrafter Faun (CR 603.12, 701.9): "up to that many target ..." after a discard counts the cards discarded, so the ability is created only when there was one.
      ...(own.some((t) => t.upToThatMany === 'discarded')
        ? { ifThisWay: 'discarded' as const }
        : {}),
    },
    rule: next.clauses[0]?.rule ?? next.rule,
  };
}

/**
 * The reflexive ability of "When you do, create a token that's a copy of target permanent you control, ... Sacrifice it at the beginning of the next end step." (issue 105, CR 603.12): the
 * sentences after the one of "When you do" say what the same ability does next, so the token they name is the one it created. Its targets are its own.
 */
function lowerReflexiveBody(
  first: IrSentence,
  rest: readonly IrSentence[],
  ctx: LowerContext,
): LowerResult<Effect> {
  const before = ctx.targets.length;
  const { reflexive: _reflexive, ...plain } = first;
  void _reflexive;
  const body = lowerSentences([plain, ...rest], ctx);
  if (!body.ok) return body;
  const own = ctx.targets.splice(before);
  return {
    ok: true,
    value: {
      kind: 'reflexive',
      ...(own.length > 0 ? { targets: own } : {}),
      effect: ownSource(oneEffect(body.value), ctx),
    },
    rule: first.clauses[0]?.rule ?? first.rule,
  };
}

/**
 * "Draw a card, then discard a card. When you discard a nonland card this way, put two charge counters on up to one target artifact." (Federation Fleet deck, group D, Seven of Nine,
 * Tertiary Adjunct; CR 603.12, 608.2c): the engine's `reflexive` ability with `ifThisWay` of `discardedNonland`, created when the discards before it in this resolution discarded a nonland card;
 * its targets are its own. It is the last sentence of the text and follows a plain instruction of the controller that discards. Any other shape is refused, never guessed.
 */
function lowerAfterDiscard(
  sentence: IrSentence,
  sentences: readonly IrSentence[],
  i: number,
  steps: Step[],
  ctx: LowerContext,
): StepResult {
  const refused = (needs?: readonly FeatureRef[]): StepResult => ({
    stopped: needs === undefined ? refuse(sentence) : { ...refuse(sentence), needs },
  });
  if (
    i !== sentences.length - 1 ||
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    sentence.instead === true ||
    sentence.otherwise === true ||
    sentence.delayed !== undefined ||
    sentence.mayBy !== undefined ||
    sentence.clauses.some((c) => c.optional || c.condition !== undefined)
  ) {
    return refused();
  }
  const discards = steps
    .flatMap((s) => s.effects)
    .some(
      (e) =>
        (e.kind === 'discard' && e.player.kind === 'you') ||
        // Narset of the Ancient Way: "then you may discard a card": the discard is the controller's offer.
        (e.kind === 'may' && e.effect.kind === 'discard' && e.effect.player.kind === 'you'),
    );
  if (!discards) return refused();
  const blocked = missingFeatures(['effect:reflexive']);
  if (blocked.length > 0) return refused(blocked);
  // "that card's mana value" is the card discarded, of either wording (a nonland card: Narset of the Ancient Way; CR 202.3, 608.2c).
  ctx.discardedCardValue = true;
  const effect = lowerReflexive(sentence, ctx);
  ctx.discardedCardValue = false;
  if (!effect.ok) return { stopped: effect };
  if (effect.value.kind !== 'reflexive') return refused();
  steps.push({
    effects: [
      {
        ...effect.value,
        ifThisWay: sentence.afterDiscard === 'any' ? 'discarded' : 'discardedNonland',
      },
    ],
    replaceable: false,
  });
  return { last: i };
}

/**
 * "Scry 1, then exile the top card of your library. You may play that card this turn. When you exile a card this way, target creature you control gets +X/+0 until end of turn, where X is
 * that card's mana value." (Cait Sith, Fortune Teller; CR 603.12, 701.13, 202.3): the engine's `reflexive` ability with `ifMoved` and `carriesMoved`, created when the exile of the top
 * card before it moved a card; its targets are its own and "that card" is the card exiled. It is the last sentence of the text and follows an `exileTop` of the controller. Any other shape
 * is refused, never guessed.
 */
function lowerAfterExile(
  sentence: IrSentence,
  sentences: readonly IrSentence[],
  i: number,
  steps: Step[],
  ctx: LowerContext,
): StepResult {
  const refused = (needs?: readonly FeatureRef[]): StepResult => ({
    stopped: needs === undefined ? refuse(sentence) : { ...refuse(sentence), needs },
  });
  if (
    i !== sentences.length - 1 ||
    sentence.condition !== undefined ||
    sentence.instead === true ||
    sentence.otherwise === true ||
    sentence.delayed !== undefined ||
    sentence.mayBy !== undefined ||
    sentence.clauses.some((c) => c.optional || c.condition !== undefined)
  ) {
    return refused();
  }
  const exiles = steps
    .flatMap((s) => s.effects)
    .some((e) => e.kind === 'exileTop' && e.from === undefined);
  if (!exiles || ctx.exiled !== 'top') return refused();
  const blocked = missingFeatures(['effect:reflexive']);
  if (blocked.length > 0) return refused(blocked);
  const effect = lowerReflexive(sentence, ctx);
  if (!effect.ok) return { stopped: effect };
  if (effect.value.kind !== 'reflexive') return refused();
  steps.push({
    effects: [{ ...effect.value, ifMoved: true, carriesMoved: true }],
    replaceable: false,
  });
  return { last: i };
}

/**
 * "Reveal cards from the top of your library until you reveal a creature card. Put that card into your hand and the rest on the bottom of your library in a random order. When you reveal a
 * creature card this way, put X +1/+1 counters on target creature you control, where X is the mana value of that card." (Yuna's Whistle; CR 603.12, 701.20, 202.3): the engine's `reflexive` ability
 * with `ifMoved`, `ifMovedMatches` of the card type the words name and `carriesMoved`, created when the card found is of that type; its targets are its own and "that card" is the card found. It is the
 * last sentence of the text and follows a `revealUntil` of the controller's own library that puts the card found into the hand. Any other shape is refused, never guessed.
 */
const REVEAL_TYPES: readonly string[] = [
  'artifact',
  'creature',
  'enchantment',
  'instant',
  'land',
  'planeswalker',
  'sorcery',
];

function lowerAfterReveal(
  sentence: IrSentence,
  sentences: readonly IrSentence[],
  i: number,
  steps: Step[],
  ctx: LowerContext,
): StepResult {
  const refused = (needs?: readonly FeatureRef[]): StepResult => ({
    stopped: needs === undefined ? refuse(sentence) : { ...refuse(sentence), needs },
  });
  const type = sentence.afterReveal;
  if (
    type === undefined ||
    !REVEAL_TYPES.includes(type) ||
    i !== sentences.length - 1 ||
    sentence.condition !== undefined ||
    sentence.instead === true ||
    sentence.otherwise === true ||
    sentence.delayed !== undefined ||
    sentence.mayBy !== undefined ||
    sentence.clauses.some((c) => c.optional || c.condition !== undefined)
  ) {
    return refused();
  }
  const reveal = steps
    .flatMap((s) => s.effects)
    .find((e) => e.kind === 'revealUntil' && e.from === undefined && e.put === 'hand');
  if (reveal?.kind !== 'revealUntil' || reveal.filter.types?.length !== 1) return refused();
  if (!reveal.filter.types.includes(type as 'creature')) return refused();
  const blocked = missingFeatures(['effect:reflexive']);
  if (blocked.length > 0) return refused(blocked);
  // "that card" is the card found, which the reflexive ability carries as `moved` (the same reading as the exile of the top card).
  const before = ctx.exiled;
  ctx.exiled = 'top';
  const effect = lowerReflexive(sentence, ctx);
  ctx.exiled = before;
  if (!effect.ok) return { stopped: effect };
  if (effect.value.kind !== 'reflexive') return refused();
  steps.push({
    effects: [
      {
        ...effect.value,
        ifMoved: true,
        carriesMoved: true,
        ifMovedMatches: { types: [type as 'creature'] },
      },
    ],
    replaceable: false,
  });
  return { last: i };
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
): (LowerResult<Effects> & { readonly last?: number }) | null {
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
  if (next.instead === true || next.clauses.some((c) => c.optional)) {
    return refuse(next);
  }
  // A reflexive ability is the last effect of its sequence (`validateCard`); the sentences after the one of "When you do" are its own body, which only the exile of a graveyard before it reads
  // (`lowerExiledReflexive`).
  const body = sentences.slice(i + 2);
  if (body.length > 0) {
    const verb = sentence.clauses[0]?.verb;
    if (verb !== 'exile' && verb !== 'amass') return refuse(next);
    const lowered =
      verb === 'amass'
        ? lowerAmassReflexive(sentence, next, body, ctx)
        : lowerExiledReflexive(sentence, next, body, ctx);
    return lowered.ok ? { ...lowered, last: i + 1 + body.length } : lowered;
  }
  const blocked = missingFeatures(['effect:reflexive']);
  if (blocked.length > 0) return { ...refuse(next), needs: blocked };
  const done = lowerClauses(sentence.clauses, ctx);
  if (!done.ok) return done;
  const [only, ...rest] = done.value;
  // Issue 89 (Forum Filibuster, CR 603.12): "Create a 2/1 token. When you do, ...": a token created is something done.
  const madeToken = only?.kind === 'createToken';
  // CR 603.12 (Auron, Venerated Guardian): "Put a +1/+1 counter on it. When you do, ...": a counter put is something done.
  const putCounter = only?.kind === 'addCounters';
  if (
    only === undefined ||
    rest.length > 0 ||
    !(MAY_KINDS.has(only.kind) || madeToken || putCounter)
  ) {
    return refuse(sentence);
  }
  // Tip the Scales (CR 107.3c, 603.12): "When you do, all creatures get -X/-X until end of turn, where X is the sacrificed creature's toughness.": the "where X is" of the
  // reflexive sentence defines the X its clauses read, as the main loop does for a sentence of its own.
  const whereAmount = next.where;
  const defined =
    whereAmount === undefined
      ? null
      : {
          amount: whereAmount,
          used: false,
          lower: () => {
            const outer = ctx.xIs;
            ctx.xIs = null;
            try {
              return lowerAmount(whereAmount, ctx, 'body.sentence');
            } finally {
              ctx.xIs = outer;
            }
          },
        };
  const outerX = ctx.xIs;
  if (defined !== null) ctx.xIs = defined;
  const effect = lowerReflexive(next, ctx);
  ctx.xIs = outerX;
  if (!effect.ok) return effect;
  if (defined !== null) {
    if (!defined.used) return refuse(next);
    ctx.xDefined = true;
  }
  // "... attached to that token" in the reflexive ability is the token made before it: the ability carries what that resolution made (`moved`).
  if (
    madeToken &&
    effect.value.kind === 'reflexive' &&
    JSON.stringify(effect.value).includes('"moved"')
  ) {
    const blockedMoved = missingFeatures(['ability:reflexiveMoved']);
    if (blockedMoved.length > 0) return { ...refuse(next), needs: blockedMoved };
    return {
      ok: true,
      value: [only, { ...effect.value, carriesMoved: true }],
      rule: clause.rule,
    };
  }
  // A reflexive ability that does not read the token knows nothing of it: only an effect that reads it follows a token.
  if (madeToken) return refuse(next);
  return { ok: true, value: [only, effect.value], rule: clause.rule };
}

/**
 * "Exile each opponent's graveyard. When you do, choose up to one target creature card exiled this way. Create a token that's a copy of that card, except ..." (Espers to Magicite, CR 603.12,
 * 400.7j): the engine's `exile` of the cards the first sentence names, and a `reflexive` ability created when that exile moved a card (`ifMoved`), carrying the cards it exiled (`carriesMoved`):
 * the sentence of "When you do" and the sentences after it are the ability's own body, its target the "card exiled this way". Any other shape is refused, never guessed: the body must choose
 * its target by `exiledThisWay` (a reflexive ability that carries the cards cannot read them otherwise).
 */
function lowerExiledReflexive(
  sentence: IrSentence,
  next: IrSentence,
  body: readonly IrSentence[],
  ctx: LowerContext,
): LowerResult<Effects> {
  if (
    sentence.clauses.length !== 1 ||
    sentence.clauses.some((c) => c.condition !== undefined || c.duration !== undefined) ||
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    sentence.instead === true ||
    next.instead === true ||
    next.where !== undefined ||
    next.condition !== undefined ||
    [next, ...body].some((s) => s.clauses.some((c) => c.optional) || s.delayed !== undefined)
  ) {
    return refuse(next);
  }
  const blocked = missingFeatures(['effect:reflexive', 'ability:reflexiveIfMoved']);
  if (blocked.length > 0) return { ...refuse(next), needs: blocked };
  const done = lowerClauses(sentence.clauses, ctx);
  if (!done.ok) return done;
  const [only, ...rest] = done.value;
  if (only?.kind !== 'exile' || rest.length > 0 || only.objects.kind !== 'each') {
    return refuse(sentence);
  }
  const effect = lowerReflexiveBody(next, body, ctx);
  if (!effect.ok) return effect;
  if (
    effect.value.kind !== 'reflexive' ||
    !JSON.stringify(effect.value.targets ?? null).includes('"exiledThisWay":true')
  ) {
    return refuse(next);
  }
  return {
    ok: true,
    value: [only, { ...effect.value, carriesMoved: true, ifMoved: true }],
    rule: sentence.clauses[0]?.rule ?? sentence.rule,
  };
}

/**
 * "When ~ enters, amass Orcs 2. When you do, until end of turn, gain control of target nonlegendary creature an opponent controls with power less than or equal to the amassed Army's
 * power. Untap that creature. It gains haste until end of turn." (Grishnákh, Brash Instigator; CR 603.12, 701.47a): the engine's `amass` and a `reflexive` ability created when it
 * chose an Army (`ifMoved`), carrying that Army (`carriesMoved`); the sentences from "When you do" on are the ability's own body, its target chosen by `powerAtMostMoved` (the only way
 * a reflexive ability that carries the Army reads it). Any other shape is refused, never guessed.
 */
function lowerAmassReflexive(
  sentence: IrSentence,
  next: IrSentence,
  body: readonly IrSentence[],
  ctx: LowerContext,
): LowerResult<Effects> {
  if (
    sentence.clauses.length !== 1 ||
    sentence.clauses.some((c) => c.condition !== undefined || c.duration !== undefined) ||
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    sentence.instead === true ||
    next.instead === true ||
    next.where !== undefined ||
    next.condition !== undefined ||
    [next, ...body].some((s) => s.clauses.some((c) => c.optional) || s.delayed !== undefined)
  ) {
    return refuse(next);
  }
  const blocked = missingFeatures(['effect:reflexive', 'ability:reflexiveIfMoved']);
  if (blocked.length > 0) return { ...refuse(next), needs: blocked };
  const done = lowerClauses(sentence.clauses, ctx);
  if (!done.ok) return done;
  const [only, ...rest] = done.value;
  if (only?.kind !== 'amass' || rest.length > 0) return refuse(sentence);
  const effect = lowerReflexiveBody(next, body, ctx);
  if (!effect.ok) return effect;
  if (
    effect.value.kind !== 'reflexive' ||
    !JSON.stringify(effect.value.targets ?? null).includes('"powerAtMostMoved":true')
  ) {
    return refuse(next);
  }
  return {
    ok: true,
    value: [only, { ...effect.value, carriesMoved: true, ifMoved: true }],
    rule: sentence.clauses[0]?.rule ?? sentence.rule,
  };
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
  // "Return it to its owner's hand. If you do, you may search your library for a Plains card, ..." (CR 608.2c, 701.23a): the offer is the engine's `search` with `optional`
  // (a declined search is not a search), asked only when the instruction before was done. Any other optional clause is refused.
  const [only, ...others] = sentence.clauses;
  const offeredSearch =
    only?.verb === 'search' && only.optional && others.length === 0 ? only : undefined;
  if (offeredSearch === undefined && sentence.clauses.some((c) => c.optional)) {
    return refuse(sentence);
  }
  const blocked = missingFeatures(['condition:didPrevious', 'effect:conditional']);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  if (offeredSearch !== undefined) {
    const searched = lowerClauses([{ ...offeredSearch, optional: false }], ctx);
    if (!searched.ok) return searched;
    const [search, ...extra] = searched.value;
    if (
      search?.kind !== 'search' ||
      extra.length > 0 ||
      search.optional === true ||
      search.player.kind !== 'you'
    ) {
      return refuse(sentence);
    }
    return {
      ok: true,
      value: [
        {
          kind: 'conditional',
          condition: { kind: 'didPrevious' },
          effect: { ...search, optional: true },
        },
      ],
      rule: offeredSearch.rule,
    };
  }
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
 * "If you haven't cast a spell this turn, you may cast that card. If you do, you can't cast additional spells this turn." (Conduit of Worlds, CR 608.2c, 608.2g, 101.2): the offer
 * of the engine's `castCard` under the test of the first sentence, and the instruction of the second, which runs only when the card was cast (`didPrevious`, which the
 * accepted cast sets). Null when the sentence is not an offer to cast "that card" under a condition, followed by "If you do"; any other shape of either sentence is refused.
 */
function lowerCastThenIfDo(
  sentence: IrSentence,
  sentences: readonly IrSentence[],
  i: number,
  ctx: LowerContext,
): LowerResult<Effects> | null {
  const [cast, ...more] = sentence.clauses;
  if (cast?.verb !== 'castThatCard' || sentence.condition === undefined) return null;
  const next = sentences[i + 1];
  if (next?.condition?.test.kind !== 'didPrevious' || next.reflexive === true) return null;
  if (
    more.length > 0 ||
    sentence.instead === true ||
    sentence.where !== undefined ||
    sentence.delayed !== undefined ||
    sentence.reflexive === true ||
    sentence.otherwise === true ||
    next.instead === true ||
    next.where !== undefined ||
    next.delayed !== undefined ||
    next.otherwise === true ||
    next.clauses.some((c) => c.optional || c.condition !== undefined)
  ) {
    return refuse(sentence);
  }
  const blocked = missingFeatures(SENTENCE_NEEDS);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  const condition = lowerCondition(sentence.condition, false, ctx);
  if (!condition.ok) return condition;
  const offered = lowerClauses([cast], ctx);
  if (!offered.ok) return offered;
  const after = lowerClauses(next.clauses, ctx);
  if (!after.ok) return after;
  return {
    ok: true,
    value: [
      {
        kind: 'conditional',
        condition: condition.value,
        effect: {
          kind: 'sequence',
          effects: [
            ...offered.value,
            {
              kind: 'conditional',
              condition: { kind: 'didPrevious' },
              effect: oneEffect(after.value),
            },
          ],
        },
      },
    ],
    rule: cast.rule,
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

/**
 * The sentence "If this spell's additional cost was paid, exile the top three cards instead.": the earlier exile of the top cards of the controller's library with a new number.
 * Only after one sentence that is one such exile (CR 701.13), which says whose library the elliptical words mean.
 */
function ellipticalExileTop(
  sentence: IrSentence,
  clause: IrClause,
  previous: Step,
  ctx: LowerContext,
): LowerResult<Effects> {
  const [base] = previous.effects;
  if (previous.effects.length !== 1 || base?.kind !== 'exileTop' || base.from !== undefined) {
    return refuse(sentence);
  }
  if (base.faceDown === true || base.linked === true) return refuse(sentence);
  const count = amountArg(clause, 'count', ctx);
  if (!count.ok) return count;
  return { ok: true, value: [{ ...base, count: count.value }], rule: clause.rule };
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
      case 'minus':
        visit(amount.of);
        break;
      case 'difference':
      case 'extreme':
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

/** What kind of permanent a noun names: its card types, or "creature" for a creature type ("all Zombies"). */
export function kindOfNoun(noun: IrNoun): string {
  const types = noun.filter.types ?? [];
  if (types.length > 0) return types.join(' ');
  const subtypes = noun.filter.subtypes ?? [];
  return subtypes.length > 0 && subtypes.every((s) => CREATURE_TYPES.has(s)) ? 'creature' : '';
}

/** Whether `earlier` is an instruction of the kind `amount` counts, and says what the words of the amount say. */
function countsWhatHappened(
  amount: Extract<IrAmount, { kind: 'thisWay' }>,
  earlier: IrClause,
): boolean {
  const kindOf = kindOfNoun;
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
      // Issue 121 (Bloodthirsty Adversary): "pay {2}{R} any number of times. When you pay this cost one or more times, put that many +1/+1 counters": the number of times paid.
      earlier.verb === 'payAnyNumberOfTimes' ||
      // Chandra, Legacy of Fire: "Remove a loyalty counter from each of any number of permanents you control. Exile that many cards": the counters removed.
      earlier.verb === 'removeCounterFromEachChosen' ||
      (earlier.verb === 'discard' &&
        (earlier.args.anyNumber !== undefined ||
          earlier.args.upTo !== undefined ||
          earlier.args.allCards !== undefined))
    );
  }
  const [word] = amount.words;
  switch (amount.what) {
    case 'sacrificed': {
      // "Each other player sacrifices a creature of their choice. ... for each creature sacrificed this way."
      // CR 701.21a (Nahiri's Lithoforming): or the controller's own "Sacrifice X lands. For each land sacrificed this way, ...": a choice of permanents (`a`), not "sacrifice ~".
      const chosenByController =
        earlier.args.player === undefined &&
        earlier.args.objects?.kind === 'noun' &&
        earlier.args.objects.det === 'a';
      return (
        earlier.verb === 'sacrifice' &&
        (earlier.args.player !== undefined || chosenByController) &&
        (word === 'permanent' || names(earlier.args.objects).every((n) => n === word))
      );
    }
    case 'destroyedValue':
      // Death Toll deck, group D (CR 202.3, 608.2h): "the total mana value of permanents destroyed this way": every permanent a `destroy` before it destroyed.
      return earlier.verb === 'destroy';
    case 'destroyedCreaturesOfAffected':
      // Deadly Tempest (CR 608.2c): "the number of creatures they controlled that were destroyed this way": a `destroy` of creatures before it.
      return (
        earlier.verb === 'destroy' && names(earlier.args.objects).every((n) => n === 'creature')
      );
    case 'destroyedNontokenCreatures':
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
      // "X" after "tap X untapped Myr you control" (stage P31): the number the tap chose; "for each creature tapped this way" names the kind it tapped.
      return (
        earlier.verb === 'tapChosen' &&
        (word === undefined ||
          word === 'permanent' ||
          names(earlier.args.objects).every((n) => n === word))
      );
    case 'exiledCreatureCards':
      // Grey Host Reinforcements (CR 608.2c): "the number of creature cards exiled this way": an `exile` before it in the same text.
      // Journey to the Lost City: or "exile the top four cards of your library" (`exileTop`), whose cards are the ones "those cards" names.
      return earlier.verb === 'exile' || earlier.verb === 'exileTop';
    case 'exiledCreatures':
      // Issue 81 (Sunfall): "where X is the number of creatures exiled this way": an `exile` before it in the same text.
      return earlier.verb === 'exile';
    case 'discardedTypeCount':
    // Issue 81 (Occult Epiphany): "for each card type among cards discarded this way": a `discard` before it in the same text.
    case 'discardedMost':
    // Issue 279 (Windfall): "the greatest number of cards a player discarded this way": a `discard` before it in the same text.
    case 'discarded':
      // Issue 244 (Syphon Mind): "for each card discarded this way": the cards a `discard` before it made the players discard.
      return earlier.verb === 'discard';
    case 'returned':
      // Revival Experiment (CR 608.2c): "for each card returned this way": the cards the return of one card per permanent type before it put onto the battlefield.
      return earlier.verb === 'returnOnePerPermanentType';
    case 'countersRemoved':
      // Nexus Mentality: "for each counter removed this way": a `remove all counters` before it. Eventide's Shadow: "the number of counters removed this way" after counters the
      // controller chose to remove.
      return (
        earlier.verb === 'removeAllCounters' ||
        earlier.verb === 'removeChosenCounters' ||
        earlier.verb === 'removeCounterFromEachChosen'
      );
    case 'excessDamageDealt':
    // Issue 144 (Goblin Negotiation): "tokens equal to the amount of excess damage dealt to that creature this way": a `dealDamage` before it.
    case 'damageDealt':
      // Issue 159: "you gain life equal to the damage dealt this way": a `dealDamage` before it.
      return earlier.verb === 'dealDamage';
    case 'landCardsToGraveyard':
      // Eumidian Wastewaker (CR 701.9, 701.21): "for each land card put into a graveyard this way": the discards and sacrifices before it, here the discard-or-sacrifice of the players.
      return (
        earlier.verb === 'eachDiscardOrSacrifice' ||
        earlier.verb === 'discard' ||
        earlier.verb === 'sacrifice'
      );
    case 'milledCreature':
    case 'milledLand':
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
function thisWaysAreSupported(
  sentences: readonly IrSentence[],
  ctx: LowerContext,
): IrSentence | null {
  const before: IrClause[] = [];
  for (const sentence of sentences) {
    // "If the player doesn't, you mill three cards, then ... equal to the total mana value of those cards" (stage P52, D-210): the sentence is what a
    // "may have you" sentence does otherwise, run whole, so its own instructions count each other.
    const otherwise = sentence.condition?.test.kind === 'declined';
    // "You may discard all the cards in your hand. If you do, draw that many cards." (CR 608.2c): the sentence of "if you do" runs only when the offer before it was done,
    // and then counts what that offer did (a declined offer leaves the counts at 0).
    const afterOffer = sentence.condition?.test.kind === 'didPrevious';
    // Journey to the Lost City (CR 706.3, 608.2c): a row of a die results table, "If the result is 10 to 19, ..., for each creature card among those cards", counts what an instruction
    // before the roll did; the result only chooses which row runs, so the earlier instruction (not under a condition) is still the one counted.
    const test = sentence.condition?.test;
    const dieRow =
      test?.kind === 'dieResult' ||
      (test?.kind === 'and' && test.terms.every((t) => t.test.kind === 'dieResult'));
    for (const clause of sentence.clauses) {
      for (const amount of thisWaysOf(clause)) {
        if (
          (sentence.condition !== undefined && !otherwise && !afterOffer && !dieRow) ||
          clause.condition !== undefined
        ) {
          return sentence;
        }
        // D-586 (CR 602.2b, 701.21a): "for each artifact sacrificed this way" in an ability whose cost sacrifices one or more artifacts counts that cost. An instruction
        // of the text that also sacrifices makes the words ambiguous, so it is refused, never guessed.
        if (isCostSacrificeCount(amount, ctx)) {
          if (before.some((earlier) => earlier.verb === 'sacrifice')) return sentence;
          continue;
        }
        // Issue 105 (CR 107.14, 608.2c): "If you do, put that many +1/+1 counters" after "you may pay one or more {E}" counts the energy paid, which `lowerPayEnergyAny` reads.
        if (
          amount.thatMany === true &&
          afterOffer &&
          before[before.length - 1]?.verb === 'payEnergyAny'
        ) {
          continue;
        }
        if (!before.some((earlier) => countsWhatHappened(amount, earlier))) return sentence;
      }
      if (
        (sentence.condition === undefined || otherwise || afterOffer) &&
        clause.condition === undefined
      ) {
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

/** The engine features of "When you next cast an instant or sorcery spell this turn, copy that spell." (D-336). */
export const NEXT_CAST_NEEDS: readonly FeatureRef[] = ['effect:delayedCast', 'effect:copySpell'];

/**
 * "When you next cast an instant or sorcery spell this turn, copy that spell. You may choose new targets for the copy." (D-336, CR 603.7, 603.7a, 603.7b, 514.2):
 * the sentence is what a delayed triggered ability does, created as the spell or ability resolves, on the next cast by its controller of a spell the lead names; the
 * engine's `delayedCast`. The only thing it can do is copy the spell that was cast (the engine's own limit, `validateCard`); a test, a "you may" or any other
 * instruction in the sentence is not read inside it.
 */
function lowerNextCast(
  sentence: IrSentence,
  i: number,
  steps: Step[],
  ctx: LowerContext,
): StepResult {
  const stop = (failed: LowerFailure): StepResult => ({ stopped: failed });
  const blocked = missingFeatures(NEXT_CAST_NEEDS);
  if (blocked.length > 0) return stop({ ...refuse(sentence), needs: blocked });
  const spell = sentence.delayed?.spell;
  if (
    spell === undefined ||
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    sentence.reflexive === true ||
    sentence.instead === true ||
    sentence.clauses.some((c) => c.optional || c.condition !== undefined)
  ) {
    return stop(refuse(sentence));
  }
  const lowered = lowerDelayedCast(sentence, spell, ctx);
  if (!lowered.ok) return stop(lowered);
  steps.push({ effects: [lowered.value], replaceable: false });
  return { last: i };
}

/** What "Whenever a creature dies this turn, ..." needs of the engine (Massacre Girl). */
export const CREATURE_DIES_NEEDS: readonly FeatureRef[] = ['effect:delayedDiesTurn'];

/**
 * "Whenever a creature dies this turn, each creature other than ~ gets -1/-1 until end of turn." (Massacre Girl, CR 603.7, 603.7c, 603.10a, 700.4): the sentence is what a delayed
 * triggered ability does, for the turn, which the engine's `delayedDiesTurn` creates as the instructions before it have been done. The sentence names no target of its own, and a
 * test, a "you may" or a "where X" in it is not read inside it.
 */
function lowerCreatureDies(
  sentence: IrSentence,
  i: number,
  steps: Step[],
  ctx: LowerContext,
): StepResult {
  const stop = (failed: LowerFailure): StepResult => ({ stopped: failed });
  const blocked = missingFeatures(CREATURE_DIES_NEEDS);
  if (blocked.length > 0) return stop({ ...refuse(sentence), needs: blocked });
  if (
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    sentence.reflexive === true ||
    sentence.instead === true ||
    sentence.clauses.some((c) => c.optional || c.condition !== undefined)
  ) {
    return stop(refuse(sentence));
  }
  const before = ctx.targets.length;
  const inner = lowerClauses(sentence.clauses, ctx);
  if (!inner.ok) return stop(inner);
  // What the ability does reads nothing the spell chose (CR 603.7c): no target of its own.
  if (ctx.targets.length !== before) return stop(refuse(sentence));
  const effect: Effect = {
    kind: 'delayedDiesTurn',
    filter: { types: ['creature'] },
    effect: oneEffect(inner.value),
  };
  steps.push({ effects: [effect], replaceable: false });
  return { last: i };
}

/** What "Whenever one or more creatures you control deal combat damage to one or more players this turn, ..." needs of the engine (Forth Eorlingas!). */
export const COMBAT_DAMAGE_BATCH_NEEDS: readonly FeatureRef[] = [
  'effect:delayedCombatDamageBatchTurn',
];

/**
 * "Whenever one or more creatures you control deal combat damage to one or more players this turn, you become the monarch." (Forth Eorlingas!, CR 603.7, 603.7c, 603.2c, 510.2): the
 * sentence is what a delayed triggered ability does, for the turn, which the engine's `delayedCombatDamageBatchTurn` creates. The sentence names no target of its own, and a test, a
 * "you may" or a "where X" in it is not read inside it.
 */
function lowerCombatDamageBatch(
  sentence: IrSentence,
  i: number,
  steps: Step[],
  ctx: LowerContext,
): StepResult {
  const stop = (failed: LowerFailure): StepResult => ({ stopped: failed });
  const blocked = missingFeatures(COMBAT_DAMAGE_BATCH_NEEDS);
  if (blocked.length > 0) return stop({ ...refuse(sentence), needs: blocked });
  if (
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    sentence.reflexive === true ||
    sentence.instead === true ||
    sentence.clauses.some((c) => c.optional || c.condition !== undefined)
  ) {
    return stop(refuse(sentence));
  }
  const before = ctx.targets.length;
  const inner = lowerClauses(sentence.clauses, ctx);
  if (!inner.ok) return stop(inner);
  // What the ability does reads nothing the spell chose (CR 603.7c): no target of its own.
  if (ctx.targets.length !== before) return stop(refuse(sentence));
  const effect: Effect = {
    kind: 'delayedCombatDamageBatchTurn',
    filter: { types: ['creature'], controller: 'you' },
    effect: oneEffect(inner.value),
  };
  steps.push({ effects: [effect], replaceable: false });
  return { last: i };
}

/** What "Whenever a creature you control deals combat damage to that player this turn, ..." needs of the engine (issue 144). */
export const COMBAT_DAMAGE_TO_PLAYER_NEEDS: readonly FeatureRef[] = [
  'effect:delayedCombatDamageToPlayer',
  'selector:target',
];

/**
 * "Choose target opponent. Whenever a creature you control deals combat damage to that player this turn, create a tapped Treasure token." (issue 144, CR 603.7, 603.7c, 510.3a): the
 * sentence is what a delayed triggered ability does, for damage to the one player the target slot before it chose, which the engine's `delayedCombatDamageToPlayer` fixes as it is made.
 * The sentence names no target of its own, and a test, a "you may" or a "where X" in it is not read inside it.
 */
function lowerCombatDamageToThatPlayer(
  sentence: IrSentence,
  i: number,
  steps: Step[],
  ctx: LowerContext,
): StepResult {
  const stop = (failed: LowerFailure): StepResult => ({ stopped: failed });
  const blocked = missingFeatures(COMBAT_DAMAGE_TO_PLAYER_NEEDS);
  if (blocked.length > 0) return stop({ ...refuse(sentence), needs: blocked });
  if (
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    sentence.reflexive === true ||
    sentence.instead === true ||
    sentence.clauses.some((c) => c.optional || c.condition !== undefined)
  ) {
    return stop(refuse(sentence));
  }
  // "That player" is the one player a target slot of this text names: with none, or two, there is nobody to say it of.
  const players = ctx.targets.filter((t) => t.what.kind === 'player');
  const [slot] = players;
  if (players.length !== 1 || slot === undefined) return stop(refuse(sentence));
  const before = ctx.targets.length;
  const inner = lowerClauses(sentence.clauses, ctx);
  if (!inner.ok) return stop(inner);
  // What the ability does reads nothing the spell chose (CR 603.7c): no target of its own.
  if (ctx.targets.length !== before) return stop(refuse(sentence));
  const effect: Effect = {
    kind: 'delayedCombatDamageToPlayer',
    filter: { types: ['creature'], controller: 'you' },
    player: { kind: 'target', id: slot.id },
    effect: oneEffect(inner.value),
  };
  steps.push({ effects: [effect], replaceable: false });
  return { last: i };
}

/**
 * The `delayedCast` of a "When you next cast ..." sentence (D-336, Quandrix Unlimited group E): what it does is copying the spell that was cast, or the controller's own
 * instructions (draw, gain life) with an X that is the X of the spell cast ("a spell with {X} in its mana cost": "gain half X life, rounded down"). Also the extra effect of a mana ability.
 */
export function lowerDelayedCast(
  sentence: IrSentence,
  spell: NonNullable<IrSentence['delayed']>['spell'],
  ctx: LowerContext,
): LowerResult<Effect> {
  if (
    spell === undefined ||
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    sentence.reflexive === true ||
    sentence.instead === true ||
    sentence.clauses.some((c) => c.optional || c.condition !== undefined)
  ) {
    return refuse(sentence);
  }
  const filter = lowerFilter(spell);
  if (!filter.ok) return filter;
  // An X in what the spell does is the X of the spell cast (CR 107.3), only when the spell is one with an {X} in its mana cost.
  const before = ctx.castTriggerX;
  ctx.castTriggerX = filter.value.xInManaCost === true;
  const inner = lowerClauses(sentence.clauses, ctx);
  ctx.castTriggerX = before;
  if (!inner.ok) return inner;
  const effect = oneEffect(inner.value);
  const onlyCopy =
    (effect.kind === 'copySpell' || effect.kind === 'spellGainsKeyword') &&
    effect.spell.kind === 'triggerSubject';
  const onlyOwn = inner.value.every(
    (e) => e.kind === 'draw' || e.kind === 'gainLife' || e.kind === 'spellEntersWithCounters',
  );
  // CR 608.2d, 707.2 (Summon: Good King Mog XII): a choice of a permanent of the controller's, and a token that is a copy of the one chosen.
  const [choice, copy, ...rest] = inner.value;
  const copiesChosen =
    choice?.kind === 'chooseObjects' &&
    copy?.kind === 'createToken' &&
    copy.token.kind === 'copyOf' &&
    copy.token.object.kind === 'chosen' &&
    copy.token.object.id === choice.id &&
    rest.length === 0;
  if (!(onlyCopy || onlyOwn || copiesChosen)) return refuse(sentence);
  return {
    ok: true,
    value: {
      kind: 'delayedCast',
      filter: filter.value,
      effect,
      ...(sentence.delayed?.repeat === true ? { repeat: true as const } : {}),
    },
    rule: sentence.rule,
  };
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
type StepResult =
  | { readonly stopped: LowerFailure }
  | {
      readonly last: number;
      /** The "where X is ..." of the last sentence a step took was read by the step itself (a reflexive ability, CR 603.12). */
      readonly whereRead?: true;
    };

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
  // "When you discard a nonland card this way, ..." (Federation Fleet deck, group D, CR 603.12): the reflexive ability of the discards before it.
  if (sentence.afterDiscard !== undefined)
    return lowerAfterDiscard(sentence, sentences, i, steps, ctx);
  // "When you exile a card this way, ..." (Cait Sith, Fortune Teller, CR 603.12): the reflexive ability of the exile of the top card before it.
  if (sentence.afterExile === true) return lowerAfterExile(sentence, sentences, i, steps, ctx);
  // "When you reveal a creature card this way, ..." (Yuna's Whistle, CR 603.12): the reflexive ability of the reveal before it.
  if (sentence.afterReveal !== undefined)
    return lowerAfterReveal(sentence, sentences, i, steps, ctx);
  // "Then you may have ~ become a copy of that creature, except its name is ~ and it has vigilance and this ability." (Kimahri, Valiant Guardian, CR 707.9b): one offered copy, the engine's
  // `may` of the `becomeCopy` the lowering makes, after the instructions before it.
  if (first.verb === 'becomeCopyKeepingAbility') {
    if (
      sentence.clauses.length !== 1 ||
      sentence.condition !== undefined ||
      sentence.where !== undefined ||
      sentence.reflexive === true ||
      sentence.instead === true ||
      sentence.delayed !== undefined
    ) {
      return stop(refuse(sentence));
    }
    const offered = lowerClauses(sentence.clauses, ctx);
    if (!offered.ok) return stop(offered);
    steps.push({ effects: offered.value, replaceable: false });
    return { last: i };
  }
  // "Roll a four-sided die." (D-271, CR 706.3b): the result is read by the instructions after the roll in the same sequence, so a roll is a plain sentence of
  // its own: not under a condition, an "otherwise", a delayed trigger, a question to a player or a reflexive ability, where the engine would not keep it for them.
  if (
    sentence.clauses.some((c) => c.verb === 'roll') &&
    (sentence.condition !== undefined ||
      sentence.otherwise === true ||
      sentence.delayed !== undefined ||
      sentence.reflexive === true ||
      sentence.mayBy !== undefined ||
      sentence.instead === true ||
      sentence.where !== undefined ||
      sentence.clauses.some((c) => c.optional || c.condition !== undefined))
  ) {
    return stop(refuse(sentence));
  }
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
      sentence.reflexive === true
    ) {
      return stop(refuse(sentence));
    }
    // "Otherwise, you may cast it without paying its mana cost." (D-394, CR 608.2c): a clause the text made optional is lowered only by an instruction that asks the question
    // itself (`acceptsOptional`: the engine's `castFree`); any other optional clause makes `lowerClauses` fail, so it is never run as if it were not a choice.
    const other = lowerClauses(sentence.clauses, ctx);
    if (!other.ok) return stop(other);
    // "If it was a creature card, create a Rogue. If it was a land card, create a Treasure. Otherwise, you gain 3 life." (Misfortune Teller, CR 608.2c, 205.2): after a run of
    // conditional instructions that each test the same object (they do not exclude each other: a card that is both a creature and a land does both), "otherwise" is
    // for the case where none of the tests held, so it is its own conditional on the negation of all of them, not the `else` of the last one.
    const run: Extract<Effect, { kind: 'conditional' }>[] = [];
    for (let k = steps.length - 1; k >= 0; k--) {
      const only = steps[k]?.effects.length === 1 ? steps[k]?.effects[0] : undefined;
      if (only?.kind !== 'conditional' || only.else !== undefined) break;
      run.unshift(only);
    }
    const head = run[0];
    const same = run.every(
      (c) =>
        c.condition.kind === 'objectMatches' &&
        head?.condition.kind === 'objectMatches' &&
        JSON.stringify(c.condition.of) === JSON.stringify(head.condition.of),
    );
    if (run.length >= 2 && same) {
      steps.push({
        effects: [
          {
            kind: 'conditional',
            condition: { kind: 'not', term: { kind: 'or', terms: run.map((c) => c.condition) } },
            effect: oneEffect(other.value),
          },
        ],
        replaceable: false,
      });
      return { last: i };
    }
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
    // "When you next cast an instant or sorcery spell this turn, copy that spell." (D-336, CR 603.7, 603.7a): the engine's `delayedCast`.
    if (step === 'nextCast') return lowerNextCast(sentence, i, steps, ctx);
    if (step === 'combatDamageToThatPlayer')
      return lowerCombatDamageToThatPlayer(sentence, i, steps, ctx);
    if (step === 'combatDamageBatch') return lowerCombatDamageBatch(sentence, i, steps, ctx);
    if (step === 'creatureDies') return lowerCreatureDies(sentence, i, steps, ctx);
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
  // "You may search your library for a Plains card and put it onto the battlefield tapped. Then if an opponent controls more lands than you, repeat this process once." (Lorehold group 1).
  const offeredSearch = lowerOfferedSearch(sentence, sentences, ctx);
  if (offeredSearch !== null) {
    if (!offeredSearch.ok) return stop(offeredSearch);
    steps.push({ effects: offeredSearch.value, replaceable: false });
    return { last: i };
  }
  // "..., put a loyalty counter on ~ and repeat this process." (Death Toll deck, group C, Grist, the Hunger Tide).
  if (sentence.clauses.some((c) => c.verb === 'repeatProcessAgain')) {
    const last = sentence.clauses[sentence.clauses.length - 1];
    if (last?.verb !== 'repeatProcessAgain') return stop(refuse(sentence));
    const repeated = lowerRepeatWhile(sentence, steps, ctx);
    if (!repeated.ok) return stop(repeated);
    steps.pop();
    steps.push({ effects: repeated.value, replaceable: false });
    return { last: i };
  }
  if (first.verb === 'repeatProcess') {
    const repeated = lowerRepeatProcess(sentence, steps, ctx);
    if (!repeated.ok) return stop(repeated);
    steps.push({ effects: repeated.value, replaceable: false });
    return { last: i };
  }
  // "You may pay any amount of {R}. When you do, it deals that much damage to any target." (stage P34, D-152, CR 603.12, 118.1).
  // Issue 105 (Druid of Purification): "Starting with you, each player may choose ... Destroy each permanent chosen this way."
  const eachChoose = lowerEachPlayerChoosesDestroy(sentence, sentences, i, ctx);
  if (eachChoose !== null) {
    if (!eachChoose.ok) return stop(eachChoose);
    steps.push({ effects: eachChoose.value, replaceable: false });
    return { last: i + 1 };
  }
  // Issue 105: "You may pay one or more {E}. If you do, ..." and "When you do, ...".
  const payEnergy = lowerPayEnergyAny(sentence, sentences, i, ctx);
  if (payEnergy !== null) {
    if (!payEnergy.ok) return stop(payEnergy);
    steps.push({ effects: payEnergy.value, replaceable: false });
    return {
      last: i + 1,
      ...(sentences[i + 1]?.where === undefined ? {} : { whereRead: true as const }),
    };
  }
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
  const additional = lowerEntersWithAdditional(sentence, steps[steps.length - 1]);
  if (additional !== null) {
    if (!additional.ok) return stop(additional);
    steps.pop();
    steps.push({ effects: additional.value, replaceable: false });
    return { last: i };
  }
  const anyColor = lowerAnyColorRider(sentence, steps[steps.length - 1]);
  if (anyColor !== null) {
    if (!anyColor.ok) return stop(anyColor);
    steps.pop();
    steps.push({ effects: anyColor.value, replaceable: false });
    return { last: i };
  }
  const regenerated = lowerCantBeRegenerated(sentence, sentences[i - 1], steps[steps.length - 1]);
  if (regenerated !== null) {
    if (!regenerated.ok) return stop(regenerated);
    steps.pop();
    steps.push({ effects: regenerated.value, replaceable: false });
    return { last: i };
  }
  // "Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way." (D-585, CR 608.2d, 106.4, 605.1a): the two sentences are one `chooseOne`.
  const chosenColor = lowerChooseColorMana(sentence, sentences, i, ctx);
  if (chosenColor !== null) {
    if (!chosenColor.ok) return stop(chosenColor);
    steps.push({ effects: chosenColor.value, replaceable: false });
    return { last: i + 1 };
  }
  // "Each player may discard a card." and "Target opponent may have you draw three cards. If the player doesn't, ..." (stage P52, D-210, CR 608.2d, 101.4).
  const asking = lowerPlayersMay(sentence, sentences, i, ctx);
  if (asking !== null) {
    if (!asking.result.ok) return stop(asking.result);
    steps.push({ effects: asking.result.value, replaceable: false });
    return { last: asking.last };
  }
  if (sentence.condition?.test.kind === 'declined') return stop(refuse(sentence));
  // "You may return that card to the battlefield under its owner's control. If you don't, at the beginning of the next end step, return that card ..." (Gilraen, CR 608.2c, 603.7c).
  const returnOrLater = lowerOfferedReturnElse(sentence, sentences, i, steps, ctx);
  if (returnOrLater !== null) {
    if (!returnOrLater.ok) return stop(returnOrLater);
    steps.push({ effects: returnOrLater.value, replaceable: false });
    return { last: i + 1 };
  }
  // "If it has mana value 3 or less, you may put it onto the battlefield. If you don't put it onto the battlefield, put it into your hand." (D-403, CR 608.2c, 608.2d).
  const putOrElse = lowerMayElse(sentence, sentences, i, ctx);
  if (putOrElse !== null) {
    if (!putOrElse.ok) return stop(putOrElse);
    steps.push({ effects: putOrElse.value, replaceable: false });
    return { last: i + 1 };
  }
  // "If you haven't cast a spell this turn, you may cast that card. If you do, you can't cast additional spells this turn." (Conduit of Worlds, CR 608.2c, 608.2g).
  const castThen = lowerCastThenIfDo(sentence, sentences, i, ctx);
  if (castThen !== null) {
    if (!castThen.ok) return stop(castThen);
    steps.push({ effects: castThen.value, replaceable: false });
    return { last: i + 1 };
  }
  // Issue 100: "... If you don't, create a token. It gains haste until end of turn.": the rider is about the token, which is made only when the player did not, so it joins that instruction.
  const rider = lowerTokenRiderOfYouDont(sentence, steps[steps.length - 1], ctx);
  if (rider !== null) {
    if (!rider.ok) return stop(rider);
    steps.pop();
    steps.push({ effects: rider.value, replaceable: false });
    return { last: i };
  }
  // "You may put a land card from among them into your hand. If you don't, put a +1/+1 counter on this creature." (D-411, CR 608.2c).
  const notTaken = lowerYouDont(sentence, steps[steps.length - 1], ctx);
  if (notTaken !== null) {
    if (!notTaken.ok) return stop(notTaken);
    steps.push({ effects: notTaken.value, replaceable: false });
    return { last: i };
  }
  // "Then you may choose a token you control. If you do, each other token you control becomes a copy of that token." (Prismari group 1, D-642).
  const chosenToken = lowerChooseTokenPair(sentence, sentences, i, ctx);
  if (chosenToken !== null) {
    if (!chosenToken.ok) return stop(chosenToken);
    steps.push({ effects: chosenToken.value, replaceable: false });
    return { last: i + 1 };
  }
  // Issue 105 (Saheeli, Radiant Creator): the sentences that follow "When you do, ..." belong to that reflexive ability.
  const afterReflexive = sentences[i + 1]?.reflexive === true ? sentences.slice(i + 2) : [];
  const offered = lowerMayPay(sentence, sentences[i + 1], ctx, afterReflexive);
  if (offered !== null) {
    if (!offered.ok) return stop(offered);
    steps.push({ effects: offered.value, replaceable: false });
    return { last: afterReflexive.length > 0 ? sentences.length - 1 : i + 1 };
  }
  // "You may discard a card. If you do, draw a card." and "You may exile it. When you do, ..." (stage P30, D-135, CR 608.2c, 603.12).
  const asked = lowerMay(sentence, sentences, i, ctx);
  if (asked !== null) {
    if (!asked.ok) return stop(asked);
    steps.push({ effects: asked.value, replaceable: false });
    return { last: asked.last ?? i + 1 };
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
    return {
      last: reflexed.last ?? i + 1,
      ...(sentences[i + 1]?.where === undefined ? {} : { whereRead: true as const }),
    };
  }
  // "creatures you control get +1/+1 until end of turn. Untap those creatures." (stage P64, D-217, CR 611.2c): the group the instruction before it named.
  if (first.verb === 'untapThose' || first.verb === 'pumpThose') {
    const untapped = lowerThoseGroup(sentence, steps[steps.length - 1], ctx);
    if (!untapped.ok) return stop(untapped);
    steps.push({ effects: untapped.value, replaceable: false });
    return { last: i };
  }
  // "Goad all creatures your opponents control. Until your next turn, those creatures can't block." (Riders of Rohan deck, group B, CR 611.2c): the group the goad before it named.
  if (first.verb === 'restrictThose') {
    const restricted = lowerThoseRestriction(sentence, steps[steps.length - 1]);
    if (!restricted.ok) return stop(restricted);
    steps.push({ effects: restricted.value, replaceable: false });
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
      // "Roll a d6. If the result is 6, draw a card instead." (D-271, CR 706.3b, 608.2c): a roll is not replaced by the sentence after it, which reads its
      // result: as the else of that sentence the roll would run after the test, with no result to read.
      replaceable: sentence.clauses.length === 1 && first.verb !== 'roll',
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
    // "If you cast ~ during your main phase, you may exile up to one other target ...": one optional exile of a target; the question is asked as it resolves (the engine's
    // `may`, CR 608.2d) and the target is chosen as the spell is cast (CR 601.2c).
    const [only] = sentence.clauses;
    const mayExile =
      sentence.clauses.length === 1 && only?.optional === true && only.verb === 'exile';
    if (mayExile) {
      const blocked = missingFeatures(['effect:may']);
      if (blocked.length > 0) return stop({ ...refuse(sentence), needs: blocked });
    }
    const lowerOnce = lowerClauses(
      mayExile && only !== undefined ? [{ ...only, optional: false }] : sentence.clauses,
      ctx,
    );
    if (!lowerOnce.ok) return stop(lowerOnce);
    const [exiled, ...others] = lowerOnce.value;
    if (mayExile && (exiled === undefined || others.length > 0)) return stop(refuse(sentence));
    const lowered = {
      ...lowerOnce,
      value:
        mayExile && exiled !== undefined
          ? [{ kind: 'may' as const, effect: exiled }]
          : lowerOnce.value,
    };
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
    // "If you cast ~ during your main phase, you may exile up to one other target ...": the slot exists only if the spell was cast in its controller's main phase (CR 601.2c).
    if (sentence.condition.test.kind === 'castInOwnMainPhase') {
      if (ctx.owner !== 'spell') return stop(refuse(sentence));
      const blocked = missingFeatures(['ability:ifCastInOwnMain']);
      if (blocked.length > 0) return stop({ ...refuse(sentence), needs: blocked });
      for (let k = targetsBefore; k < ctx.targets.length; k += 1) {
        const spec = ctx.targets[k];
        if (spec !== undefined) ctx.targets[k] = { ...spec, ifCastInOwnMain: true };
      }
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
      : sentence.clauses.length === 1 && isLibraryless(first)
        ? ellipticalExileTop(sentence, first, previous, ctx)
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
  if (
    sentence.condition.test.kind === 'giftPromised' &&
    markGiftTargets(ctx, [slotsFrom, ctx.targets.length], previous, replacement.value)
  ) {
    const blocked = missingFeatures(['ability:ifGiftPromised']);
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

/** A word that names the controller of the ability in its text (CR 608.2d): "you", "your", "you've", "yourself". */
const CONTROLLER_WORD = /\byou(?:r|rs|rself|'(?:ve|re|ll|d))?\b/iu;

/**
 * A word that is relative to the controller too: "an opponent" and "an opponent's" are the opponents of the controller (CR 102.2), and the engine would read them as the opponents of the
 * asked player (`runsAs: 'chooser'`); "another player" and "other players" are the players but the controller. The selector of the sentence ("each opponent may") is not tested, only its clauses.
 */
const OTHER_PLAYER_WORD = /\b(?:opponents?|another player|other players?)\b/iu;

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
  /** The sentence starts with "If you do," after an offer (`lowerMay`, Braids): that condition is the offer's, and the effect is wrapped by the caller. */
  afterOffer = false,
): { readonly result: LowerResult<Effects>; readonly last: number } | null {
  const by = sentence.mayBy;
  if (by === undefined) return null;
  const refused = (result: LowerResult<Effects>) => ({ result, last: i });
  const blocked = missingFeatures(['effect:playersMay']);
  if (blocked.length > 0) return refused({ ...refuse(sentence), needs: blocked });
  // CR 608.2c (Selvala, Heart of the Wilds): "Its controller may draw a card if its power is greater than each other creature's power": a test at the end of the sentence is read as the
  // instruction comes up, before the player is asked, so the offer is the `then` of a `conditional`. A test that reads what was declined or done before it is not one of these.
  const trailing =
    !afterOffer &&
    sentence.condition !== undefined &&
    sentence.condition.test.kind !== 'declined' &&
    sentence.condition.test.kind !== 'didPrevious'
      ? sentence.condition
      : undefined;
  if (
    (afterOffer
      ? sentence.condition?.test.kind !== 'didPrevious'
      : sentence.condition !== undefined && trailing === undefined) ||
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
  // D-287: with no "have you" the player asked does the instruction, as "you" (`runsAs: 'chooser'`): a rule that reads "you" or "your" of the controller refuses then.
  const askedActs = !by.haveYou;
  // A word of the text that says "you" or "your" is the controller (CR 608.2d), which the engine would run as the asked player: the sentence, and the "if they don't" sentence
  // that follows it, are not read then, whatever clause or amount says it. Without the text of the ability (a quotation lowered on its own) it cannot be told, so it is refused.
  // Braids: the sentence "For each opponent who doesn't, ..." is run by the engine as the controller, with "that player" the opponent who declined (`playerMay`, `declinedBy`), so
  // its "you" is the controller's and it is read; after an offer ("If you do, each opponent may ...") the words before the clauses are the offer's own condition, not the asked
  // player's instruction.
  if (askedActs) {
    const next = sentences[i + 1];
    const declinedAfter =
      next?.condition?.test.kind === 'declined' &&
      next.condition.rule !== 'condition.each-opponent-declines';
    const spans = [
      ...(afterOffer ? [] : [sentence]),
      ...sentence.clauses,
      ...(declinedAfter && next !== undefined ? [next, ...next.clauses] : []),
    ];
    const start = Math.min(...spans.map((n) => n.span.start));
    const end = Math.max(...spans.map((n) => n.span.end));
    if (ctx.text === '' || CONTROLLER_WORD.test(ctx.text.slice(start, end))) {
      return refused(refuse(sentence));
    }
    // D-287: the same for a word relative to the controller that is not "you": "each opponent may draw a card for each creature an opponent controls" counts the creatures of the
    // opponents of the asked player. Only the clauses are read, not the selector.
    const clauses = [
      ...sentence.clauses,
      ...(next?.condition?.test.kind === 'declined' ? next.clauses : []),
    ];
    if (clauses.some((c) => OTHER_PLAYER_WORD.test(ctx.text.slice(c.span.start, c.span.end)))) {
      return refused(refuse(sentence));
    }
  }
  const wasAsked = ctx.askedActs;
  ctx.askedActs = askedActs;
  const body = lowerClauses(sentence.clauses, ctx);
  ctx.askedActs = wasAsked;
  if (!body.ok) return refused(body);
  const next = sentences[i + 1];
  const declines = next?.condition?.test.kind === 'declined';
  let otherwise: Effect | undefined;
  // "For each opponent who doesn't" (Braids) says something only about a sentence that asked each opponent: for the players of any other sentence it would also run for a player who is no opponent.
  if (
    declines &&
    next?.condition?.rule === 'condition.each-opponent-declines' &&
    players.value.kind !== 'eachOpponent'
  ) {
    return refused(refuse(next));
  }
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
    // Death Toll deck, group C (Professor Onyx): "Each opponent may discard a card. If they don't, they lose 3 life.": "they" is the player who declined, not every player asked
    // (the engine's `declinedPlayer`, D-576), which is who "they" and "that player" name while the sentence of "if they don't" is lowered.
    const wasDeclined = ctx.declinedPlayer;
    ctx.declinedPlayer = !by.haveYou;
    const other = lowerClauses(next.clauses, ctx);
    ctx.declinedPlayer = wasDeclined;
    if (!other.ok) return refused(other);
    otherwise = oneEffect(other.value);
  }
  const asked: Effect = {
    kind: 'playersMay',
    players: players.value,
    effect: oneEffect(body.value),
    ...(by.haveYou ? {} : { runsAs: 'chooser' as const }),
    ...(otherwise === undefined ? {} : { otherwise }),
  };
  let effect: Effect = asked;
  if (trailing !== undefined) {
    const missing = missingFeatures(['effect:conditional']);
    if (missing.length > 0) return refused({ ...refuse(sentence), needs: missing });
    const test = lowerCondition(trailing, false, ctx);
    if (!test.ok) return refused(test);
    effect = { kind: 'conditional', condition: test.value, effect: asked };
  }
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
/** The sentence without the range of its row (D-525): what the lowering of a row reads. */
function withoutRow(sentence: IrSentence): IrSentence {
  const { dieRow: _row, ...rest } = sentence;
  void _row;
  return rest;
}

/**
 * The text of a die roll with its results table (D-525, CR 706.3, 706.3a, 706.3b): "Roll a d20. 1—9 | Tap all creatures your opponents control. 10—19 | ..." The sentences before
 * the first row are the roll, whose effect is the last of them (`rollDie`: the die this table reads); each row is the sentences from its range up to the next one, lowered as the
 * text of a spell of their own, and becomes the `conditional` of the engine whose condition is the result being in the row's range. The rows must be exactly the table of the die: the first
 * starts at 1, each starts right after the one before it, and the last ends at the sides of the die, so that every result has one row (a table with a gap or an overlap is
 * not read).
 */
function lowerDieTable(
  sentences: readonly IrSentence[],
  first: number,
  ctx: LowerContext,
): LowerResult<Effects> {
  const preface = sentences.slice(0, first);
  const lead = preface[0];
  if (lead === undefined) return refuse(sentences[first] as IrSentence);
  const roll = lowerSentences(preface, ctx);
  if (!roll.ok) return roll;
  const sides = ctx.dieSides;
  if (sides === null || roll.value[roll.value.length - 1]?.kind !== 'rollDie') return refuse(lead);
  const blocked = missingFeatures(['effect:conditional', 'condition:dieResult', 'condition:and']);
  if (blocked.length > 0) return { ...refuse(lead), needs: blocked };
  const effects: Effect[] = [...roll.value];
  let expected = 1;
  let i = first;
  while (i < sentences.length) {
    const head = sentences[i];
    const range = head?.dieRow;
    if (head === undefined || range === undefined) return refuse(sentences[i] ?? lead);
    let end = i + 1;
    while (end < sentences.length && sentences[end]?.dieRow === undefined) end += 1;
    if (range.from !== expected || range.to < range.from || range.to > sides) return refuse(head);
    expected = range.to + 1;
    const row = lowerSentences(sentences.slice(i, end).map(withoutRow), ctx);
    if (!row.ok) return row;
    const atLeast: Condition = {
      kind: 'dieResult',
      compare: { cmp: 'atLeast', value: range.from },
    };
    const atMost: Condition = { kind: 'dieResult', compare: { cmp: 'atMost', value: range.to } };
    const condition: Condition =
      range.from === range.to
        ? { kind: 'dieResult', compare: { cmp: 'equal', value: range.from } }
        : range.from === 1
          ? atMost
          : range.to === sides
            ? atLeast
            : { kind: 'and', terms: [atLeast, atMost] };
    effects.push({ kind: 'conditional', condition, effect: oneEffect(row.value) });
    i = end;
  }
  if (expected !== sides + 1) return refuse(sentences[sentences.length - 1] ?? lead);
  return { ok: true, value: effects, rule: 'body.sentence' };
}

/**
 * "Create X 1/1 white Soldier creature tokens. If X is 5 or more, destroy all other creatures." (issue 233, CR 608.2c): in a spell, "other" in "destroy all other creatures" names
 * nothing of the spell itself (it is no permanent), so it can only mean the tokens an instruction before it created; the engine's `each` with `except` of `moved` says so. A
 * spell that has no such instruction before it leaves "other" without an antecedent, and the whole text is refused (null), never guessed.
 */
function otherThanCreated(effects: readonly Effect[]): Effect[] | null {
  let created = false;
  let broken = false;
  const rewrite = (effect: Effect): Effect => {
    if (effect.kind === 'createToken') {
      created = true;
      return effect;
    }
    if (effect.kind === 'conditional') {
      return {
        ...effect,
        effect: rewrite(effect.effect),
        ...(effect.else === undefined ? {} : { else: rewrite(effect.else) }),
      };
    }
    if (
      effect.kind === 'destroy' &&
      'filter' in effect.objects &&
      effect.objects.filter.other === true
    ) {
      if (!created) {
        broken = true;
        return effect;
      }
      const { other: _other, ...filter } = effect.objects.filter;
      void _other;
      return { ...effect, objects: { kind: 'each', filter, except: { kind: 'moved' } } };
    }
    return effect;
  };
  const out = effects.map(rewrite);
  return broken ? null : out;
}

/**
 * Issue 105 (Lightning Runner, Rampaging Aetherhood; CR 608.2c): "You get {E}{E}, then you may pay eight {E}." says two instructions in one sentence: what comes before the
 * offer, and the offer. They are read as the two sentences they are, the offer keeping the sentence's other words, so the offer is lowered with the sentence after it.
 */
function splitBeforeOffer(sentences: readonly IrSentence[]): readonly IrSentence[] {
  const out: IrSentence[] = [];
  for (const sentence of sentences) {
    const last = sentence.clauses[sentence.clauses.length - 1];
    const lead = sentence.clauses.slice(0, -1);
    const offers = last?.optional === true && (last.verb === 'pay' || last.verb === 'payEnergyAny');
    if (
      !offers ||
      lead.length === 0 ||
      lead.some((c) => c.optional) ||
      sentence.condition !== undefined ||
      sentence.where !== undefined ||
      sentence.delayed !== undefined
    ) {
      out.push(sentence);
      continue;
    }
    out.push({ ...sentence, clauses: lead }, { ...sentence, clauses: [last] });
  }
  return out;
}

/**
 * CR 701.9 (Nantuko Cultivator): "you may discard any number of cards" says what "discard any number of cards" says: the player may choose none, so the offer is not
 * asked on its own. The clause loses its `optional`.
 */
export function withoutAnyNumberOffer(sentences: readonly IrSentence[]): readonly IrSentence[] {
  const offer = (c: IrClause) =>
    c.optional && c.verb === 'discard' && c.args.anyNumber !== undefined;
  return sentences.map((s) =>
    s.clauses.some(offer)
      ? {
          ...s,
          clauses: s.clauses.map((c) => {
            if (!offer(c)) return c;
            // Loamcrafter Faun: "you may discard one or more land cards" is read as the same offer (the player chooses, and may choose none); "one or more" with no "you may" is a
            // discard of at least one, which that choice does not say, so such a clause keeps its argument and the lowering refuses it.
            const { oneOrMore: _one, ...args } = c.args;
            void _one;
            return { ...c, args, optional: false };
          }),
        }
      : s,
  );
}

export function lowerSentences(
  input: readonly IrSentence[],
  ctx: LowerContext,
): LowerResult<Effects> {
  const sentences = splitBeforeOffer(withoutAnyNumberOffer(input));
  // D-525 (CR 706.3): the rows of a results table make the whole text of the roll one ability.
  const firstRow = sentences.findIndex((s) => s.dieRow !== undefined);
  if (firstRow >= 0) return lowerDieTable(sentences, firstRow, ctx);
  const steps: Step[] = [];
  const unordered = thisWaysAreSupported(sentences, ctx);
  if (unordered !== null) return refuse(unordered);
  let currentX: LowerContext['xIs'] = null;
  for (let i = 0; i < sentences.length; i += 1) {
    const sentence = sentences[i];
    if (sentence === undefined) break;
    const definedXCost = sentence.clauses
      .map((clause) => clause.args.cost)
      .find((cost) => cost?.kind === 'costList');
    const costAmount =
      definedXCost?.kind === 'costList'
        ? definedXCost.costs.find((cost) => cost.kind === 'payLife' && cost.definesX === true)
        : undefined;
    const whereAmount =
      sentence.where ?? (costAmount?.kind === 'payLife' ? costAmount.amount : undefined);
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
    if (defined !== null) currentX = defined;
    ctx.xIs = currentX;
    const result = lowerStep(sentences, i, steps, ctx);
    ctx.xIs = null;
    if ('stopped' in result) return result.stopped;
    if (defined !== null && !defined.used) return refuse(sentence);
    if (defined !== null) ctx.xDefined = true;
    if (
      result.last > i &&
      sentences[result.last]?.where !== undefined &&
      !('whereRead' in result && result.whereRead === true)
    ) {
      return refuse(sentence);
    }
    i = result.last;
  }
  const flat = steps.flatMap((s) => s.effects);
  const last = sentences[sentences.length - 1];
  // Issue 233 (Martial Coup): "destroy all other creatures" in a spell leaves out the tokens an instruction before it created, not the spell.
  const effects = ctx.owner === 'spell' ? otherThanCreated(flat) : flat;
  if (last !== undefined && (effects === null || !lossReadsAreOrdered(effects))) {
    return refuse(last);
  }
  return { ok: true, value: effects ?? [], rule: 'body.sentence' };
}
