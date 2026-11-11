/**
 * Effect rules of stage P33 (D-149, D-150): what the engine's Angels slice reads. "Proliferate" (CR 701.34), "for each opponent, exile up
 * to one target nonland permanent that player controls until ~ leaves the battlefield" (CR 610.3, 115.1) and the two sentences that say
 * something about the ability before them: "This ability triggers only once each turn." (CR 603.2) and "Spend this mana only to cast an
 * Angel spell." (CR 106.6). The lowering of the ability that holds them reads them; anywhere else they are read and not run.
 */
import {
  fail,
  literal,
  map,
  optional,
  type ParseContext,
  pattern,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrFilter, IrFlag, IrNoun, Span } from '../../ir/types';
import { BOUNDARY, permanentPhrase, spellPhrase, withoutZone } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/** `effect.proliferate`: "proliferate" (CR 701.34a: choose any number of permanents and/or players, then give each another counter of each kind). */
export const EFFECT_PROLIFERATE = defineRule<Clauses>({
  id: 'effect.proliferate',
  family: 'effect',
  leading: ['proliferate'],
  cites: ['CR 701.34 (Proliferate)', 'CR 701.34a (Proliferate)', 'CR 122.1 (Counters)'],
  examples: ['proliferate', 'Proliferate'],
  rejects: [
    'proliferate twice',
    'proliferate target creature',
    'proliferates',
    'proliferate it',
    'proliferate and draw a card',
    'proliferating',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(new RegExp(`proliferate${BOUNDARY}(?! (?:twice|it|that|target))`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    // "Proliferate and draw a card" is two instructions, which the sentence's join reads (the clause itself is a whole instruction).
    return {
      ok: true,
      value: [makeClause('effect.proliferate', 'proliferate', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

function flag(rule: string, span: Span): IrFlag {
  return { kind: 'flag', value: true, span, rule };
}

/** " until ~ leaves the battlefield" (CR 610.3): what the effect lasts for. */
export const UNTIL_SOURCE_LEAVES = pattern(
  new RegExp(` until ~ leaves the battlefield${BOUNDARY}`, 'iu'),
);

/**
 * The phrase after "for each opponent, <verb> up to one target " up to and with " that player controls": the noun of the slot with one target
 * for each opponent (CR 115.1, 601.2c). The permanent is whatever phrase of the permanent family names no controller ("that player controls"
 * is the controller). `from` is where the sentence began, for the spans.
 */
function perOpponentNoun(
  ctx: ParseContext,
  from: number,
  verb: 'exile' | 'destroy',
  at: number,
  id: string,
) {
  const phrase = spanned(
    satisfy(
      map(permanentPhrase(false, 'all'), withoutZone),
      (filter: IrFilter) => filter.controller === undefined,
    ),
  )(ctx, at);
  if (!phrase.ok) return phrase;
  const that = pattern(new RegExp(` that player controls${BOUNDARY}`, 'iu'))(ctx, phrase.pos);
  if (!that.ok) return that;
  const filter: IrFilter = { ...phrase.value.value, zone: 'battlefield', controller: 'opponent' };
  const nounAt = from + `for each opponent, ${verb} `.length;
  const oneAt = nounAt + 'up to '.length;
  const noun: IrNoun = {
    kind: 'noun',
    det: 'target',
    filter,
    count: { kind: 'number', value: 1, span: { start: oneAt, end: oneAt + 'one'.length } },
    upTo: true,
    plural: false,
    other: false,
    perOpponent: true,
    span: { start: nounAt, end: that.pos },
    rule: id,
  };
  return { ok: true as const, value: noun, pos: that.pos };
}

/**
 * `effect.exile-per-opponent`: "for each opponent, exile up to one target nonland permanent that player controls until ~ leaves the
 * battlefield" (CR 115.1, 601.2c, 603.3d: one slot that takes at most one target of each opponent; CR 610.3: the exiled cards return when the
 * source leaves). "Up to one" only, since a player who controls nothing of the kind cannot be chosen; the permanent is whatever
 * phrase of the permanent family names no controller ("that player controls" is the controller), and the "until" is optional.
 */
export const EFFECT_EXILE_PER_OPPONENT = defineRule<Clauses>({
  id: 'effect.exile-per-opponent',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 610.3 (Duration of Continuous Effects)',
    'CR 603.3d (Handling Triggered Abilities)',
  ],
  examples: [
    'for each opponent, exile up to one target nonland permanent that player controls until ~ leaves the battlefield',
    'for each opponent, exile up to one target creature that player controls',
    'for each opponent, exile up to one target artifact or enchantment that player controls until ~ leaves the battlefield',
  ],
  rejects: [
    'for each opponent, exile target creature that player controls',
    'for each opponent, exile up to two target creatures that player controls',
    'for each opponent, exile up to one target creature',
    'for each opponent, exile up to one target creature you control',
    'for each opponent, exile up to one target creature an opponent controls',
    'for each opponent, exile up to one target creature that player controls until end of turn',
    'for each opponent, exile up to one target creature that player controls until ~ leaves the battlefield and draw a card',
    'for each player, exile up to one target creature that player controls',
    'for each opponent, destroy up to one target creature that player controls',
    'exile up to one target creature that player controls',
    'for each opponent, exile up to one target card from a graveyard that player controls',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-per-opponent';
    const head = literal('for each opponent, exile up to one target ')(ctx, pos);
    if (!head.ok) return head;
    const noun = perOpponentNoun(ctx, pos, 'exile', head.pos, id);
    if (!noun.ok) return noun;
    const until = UNTIL_SOURCE_LEAVES(ctx, noun.pos);
    const end = until.ok ? until.pos : noun.pos;
    const span = { start: pos, end };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'exile',
          {
            objects: noun.value,
            ...(until.ok ? { until: flag(id, span) } : {}),
          },
          span,
        ),
      ],
      pos: end,
    };
  },
});

/**
 * `effect.destroy-per-opponent`: "for each opponent, destroy up to one target artifact or enchantment that player controls" (CR 115.1, 601.2c:
 * one slot that takes at most one target of each opponent; CR 701.8a: destroy). The same slot as the exile (D-150), read for destroy (D-961).
 * "Up to one" only: without it each opponent would need a target, and a player who controls nothing of the kind could not be chosen (the engine's
 * slot has no minimum); "up to two" and the other counts are not this slot.
 */
export const EFFECT_DESTROY_PER_OPPONENT = defineRule<Clauses>({
  id: 'effect.destroy-per-opponent',
  family: 'effect',
  leading: ['for'],
  cites: ['CR 115.1 (Targets)', 'CR 601.2c (Casting Spells)', 'CR 701.8a (Destroy)'],
  examples: [
    'for each opponent, destroy up to one target artifact or enchantment that player controls',
    'for each opponent, destroy up to one target creature that player controls',
    'for each opponent, destroy up to one target nonland permanent that player controls',
    'for each opponent, destroy up to one target artifact that player controls',
  ],
  rejects: [
    'for each opponent, destroy target artifact or enchantment that player controls',
    'for each opponent, destroy up to two target artifacts that player controls',
    'for each opponent, destroy up to one target artifact or enchantment',
    'for each opponent, destroy up to one target artifact or enchantment you control',
    'for each opponent, destroy up to one target artifact or enchantment an opponent controls',
    'for each opponent, destroy up to one target artifact or enchantment that player owns',
    'for each opponent, destroy up to one target artifact or enchantment that player controls until end of turn',
    'for each opponent, destroy up to one target artifact or enchantment that player controls and draw a card',
    'for each opponent, destroy up to one target artifact or enchantment that player controls. you draw a card',
    'for each player, destroy up to one target artifact or enchantment that player controls',
    'for each creature, destroy up to one target artifact or enchantment that player controls',
    'for each other opponent, destroy up to one target artifact or enchantment that player controls',
    'for each opponent who controls an artifact, destroy up to one target artifact that player controls',
    "for each opponent, destroy up to one target artifact card in that player's graveyard",
    'for each opponent, destroy up to one target artifact or enchantment that player controls unless they pay {2}',
    'destroy up to one target artifact or enchantment that player controls',
    'for each opponent, destroys up to one target artifact or enchantment that player controls',
    'for each opponent, you may destroy up to one target artifact or enchantment that player controls',
    "for each opponent, destroy up to one target artifact or enchantment that player controls. it can't be regenerated",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.destroy-per-opponent';
    const head = literal('for each opponent, destroy up to one target ')(ctx, pos);
    if (!head.ok) return head;
    const noun = perOpponentNoun(ctx, pos, 'destroy', head.pos, id);
    if (!noun.ok) return noun;
    const span = { start: pos, end: noun.pos };
    return {
      ok: true,
      value: [makeClause(id, 'destroy', { objects: noun.value }, span)],
      pos: noun.pos,
    };
  },
});

/**
 * `effect.once-each-turn`: "This ability triggers only once each turn." (CR 603.2, 122.6: a limit on how often the triggered ability before it
 * triggers). It is not an instruction: the lowering of the triggered ability that holds it sets the engine's `oncePerTurn` and drops the
 * sentence; in any other place it is read and not run.
 */
export const EFFECT_ONCE_EACH_TURN = defineRule<Clauses>({
  id: 'effect.once-each-turn',
  family: 'effect',
  leading: ['this'],
  cites: ['CR 603.2 (Handling Triggered Abilities)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: [
    'this ability triggers only once each turn',
    'This ability triggers only once each turn',
  ],
  rejects: [
    'this ability triggers only once',
    'this ability triggers only twice each turn',
    'this ability triggers only once each turn and draw a card',
    'this ability triggers once each turn',
    'this ability can be activated only once each turn',
    'this ability triggers only once each combat',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(new RegExp(`this ability triggers only once each turn${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause('effect.once-each-turn', 'oncePerTurn', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.spend-only`: "Spend this mana only to cast an Angel spell.", "Spend this mana only to cast creature spells.", "Spend this mana
 * only to cast artifact or creature spells." (CR 106.6: a mana ability may restrict what its mana can be spent on; the mana stays in the pool until
 * it empties). It says something about the mana ability before it: the lowering of that ability gives the engine its `spendOnly` (the card
 * types and creature types of the spells it may pay for); anywhere else it is read and not run.
 */
export const EFFECT_SPEND_ONLY = defineRule<Clauses>({
  id: 'effect.spend-only',
  family: 'effect',
  leading: ['spend'],
  cites: ['CR 106.6 (Mana)', 'CR 106.4 (Mana)', 'CR 605.1a (Mana Abilities)'],
  examples: [
    'spend this mana only to cast an Angel spell',
    'spend this mana only to cast creature spells',
    'spend this mana only to cast an artifact or creature spell',
    'spend this mana only to cast a creature spell',
    'spend this mana only to cast Dragon spells',
    // Stage P34 (D-152): the abilities of the permanents of the same kind.
    'spend this mana only to cast Dragon spells or activate abilities of Dragons',
    'spend this mana only to cast artifact spells or activate abilities of artifacts',
    'spend this mana only to cast a Dragon creature spell',
  ],
  rejects: [
    'spend this mana only to cast',
    'spend this mana only to cast an Angel',
    'spend this mana only to cast spells',
    'spend this mana only on an Angel spell',
    'spend this mana only to activate abilities',
    'spend this mana only to cast Angel spell',
    'spend this mana only to cast an Angel spells',
    'spend this mana only to cast an Angel spell and draw a card',
    'spend this mana only to cast a spell with flying',
    'spend only this mana to cast an Angel spell',
    'spend this mana only to cast Dragon spells or activate abilities of Elves',
    'spend this mana only to cast Dragon spells or activate abilities of Dragon creatures',
    'spend this mana only to cast Dragon spells or activate abilities',
    'spend this mana only to cast Dragon spells or activate abilities of Dragons you control',
    'spend this mana only to cast creature spells or activate abilities of Dragons',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.spend-only';
    const head = literal('spend this mana only to cast ')(ctx, pos);
    if (!head.ok) return head;
    const article = pattern(/an? /iu)(ctx, head.pos);
    const phrase = spanned(spellPhrase(!article.ok))(ctx, article.ok ? article.pos : head.pos);
    if (!phrase.ok) return phrase;
    // A spell is named by its card types or its creature types: a color, a quality or a count says more than the engine's restriction.
    const filter: IrFilter = phrase.value.value;
    // "spells" with no type says nothing a restriction could use.
    if (filter.types === undefined && filter.subtypes === undefined && filter.anyOf === undefined) {
      return fail(ctx, pos);
    }
    // Stage P34 (D-152): "... or activate abilities of Dragons", the abilities of the permanents of the same kind as the spells (CR 106.6).
    const abilities = optional(
      sequence(
        literal(' or activate abilities of '),
        spanned(map(permanentPhrase(true, 'all'), withoutZone)),
      ),
      null,
    )(ctx, phrase.pos);
    if (!abilities.ok) return abilities;
    const named = abilities.value?.[1];
    if (named !== undefined) {
      const same = (a: readonly string[] | undefined, b: readonly string[] | undefined) =>
        JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());
      const bare = Object.keys(named.value).every((k) => ['types', 'subtypes', 'raw'].includes(k));
      const kinds = Object.keys(filter).every((k) =>
        ['types', 'subtypes', 'raw', 'zone', 'stackKind'].includes(k),
      );
      if (!bare || !kinds || !same(named.value.types, filter.types)) return fail(ctx, pos);
      if (!same(named.value.subtypes, filter.subtypes)) return fail(ctx, pos);
    }
    const end = abilities.pos;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: true,
      other: false,
      span: phrase.value.span,
      rule: id,
    };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'spendOnly',
          {
            spells: noun,
            ...(named === undefined ? {} : { alsoAbilities: flag(id, { start: phrase.pos, end }) }),
          },
          { start: pos, end },
        ),
      ],
      pos: end,
    };
  },
});

export const ANGEL_EFFECT_RULES = [
  EFFECT_PROLIFERATE,
  EFFECT_EXILE_PER_OPPONENT,
  EFFECT_DESTROY_PER_OPPONENT,
  EFFECT_ONCE_EACH_TURN,
  EFFECT_SPEND_ONLY,
].map(quietly);
