/**
 * Effect rules of group 4 of the Gisa deck (issue 41, D-1430, D-1431): the sentences after "Return target creature card from your graveyard to the battlefield." of Whip of
 * Erebos ("It gains haste. Exile it at the beginning of the next end step. If it would leave the battlefield, exile it instead of putting it anywhere else.") and the effect of
 * Ghost Vacuum ("Put each creature card exiled with ~ onto the battlefield under your control with a flying counter on it."; its next sentence, "Each of them is a 1/1 Spirit in
 * addition to its other types.", is `effect.becomes-in-addition` of the Hofri deck). Every sentence is about the objects the instruction before it put onto the battlefield, which the
 * lowering checks (`ctx.movedOnto`).
 */
import { fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrArg, IrNoun } from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const IT = () => family<IrNoun>('noun', { only: ['noun.it'] });

/** Succeeds, reading nothing, when the text from here on is the end of the sentence (a period or the end of the text). */
function endsSentence(): (ctx: { text: string }, pos: number) => boolean {
  return (ctx, pos) => /^(?:\.|$)/u.test(ctx.text.slice(pos));
}

/**
 * `effect.gain-keyword-for-good`: "It gains haste." with no duration (CR 611.2a: an effect with no duration lasts for as long as the object it changes exists; CR 613.1f, layer 6),
 * about the permanent the instruction before it put onto the battlefield. A subject "it" and the keywords the engine can grant; a duration ("until end of turn") is
 * `effect.gain-keyword`'s. The engine's `grantKeyword` with the duration `permanent` of the `moved` objects.
 */
export const EFFECT_GAIN_KEYWORD_FOR_GOOD = defineRule<Clauses>({
  id: 'effect.gain-keyword-for-good',
  family: 'effect',
  leading: ['it'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 702.10 (Haste)',
  ],
  examples: ['it gains haste', 'It gains haste', 'it gains flying', 'it gains flying and haste'],
  rejects: [
    'it gains haste until end of turn',
    'it gains',
    'it gains haste and draw a card',
    'it gain haste',
    'it also gains haste',
    'target creature gains haste',
    'it gains banana',
    'it gets +1/+1 and gains haste',
    'its gains haste',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.gain-keyword-for-good';
    const r = sequence(
      IT(),
      spanned(map(sequence(literal(' gains '), KEYWORD_WORDS), ([, words]) => words)),
    )(ctx, pos);
    if (!r.ok) return r;
    if (!endsSentence()(ctx, r.pos)) return fail(ctx, pos);
    const [subject, gains] = r.value;
    const clauses = gains.value.map((name, i): Clauses[number] => {
      const keyword: IrArg = { kind: 'keywordName', name, span: gains.span, rule: id };
      const clause = makeClause(
        id,
        'grantKeywordForGood',
        { objects: subject, keyword },
        gains.span,
      );
      return i < gains.value.length - 1 ? { ...clause, connector: 'and' } : clause;
    });
    return { ok: true, value: clauses, pos: r.pos };
  },
});

/**
 * `effect.exile-at-end-step`: "Exile it at the beginning of the next end step." (CR 603.7, 603.7c, 400.7j: a delayed triggered ability about the permanent the instruction before it
 * put onto the battlefield; once that object has changed zones it is a new object and the ability does nothing). The engine's `delayedTrigger` at the end step of each turn, whose
 * effect exiles the `moved` objects. Not read: "your next end step", another object than "it", another verb ("Sacrifice it ...").
 */
export const EFFECT_EXILE_AT_END_STEP = defineRule<Clauses>({
  id: 'effect.exile-at-end-step',
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 603.7 (Delayed Triggered Abilities)',
    'CR 603.7c (Delayed Triggered Abilities)',
    'CR 400.7j (General)',
  ],
  examples: [
    'exile it at the beginning of the next end step',
    'Exile it at the beginning of the next end step',
  ],
  rejects: [
    'exile it at the beginning of your next end step',
    'exile it at the beginning of the next end step and draw a card',
    'exile it',
    'exile it at the beginning of the next end',
    'exile them at the beginning of the next end step',
    'sacrifice it at the beginning of the next end step',
    'exile target creature at the beginning of the next end step',
    'exile ~ at the beginning of the next end step',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-at-end-step';
    const r = sequence(
      literal('exile '),
      IT(),
      pattern(/ at the beginning of the next end step(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    if (!endsSentence()(ctx, r.pos)) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [makeClause(id, 'exileAtEndStep', { objects: r.value[1] }, span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.exile-instead-when-leaving`: "If it would leave the battlefield, exile it instead of putting it anywhere else." (CR 614.1a, 614.6: a replacement effect that lasts as long as
 * the object stays on the battlefield, about the permanent the instruction before it put there). The engine's `exileIfLeaves` of the `moved` objects. Not read: another condition
 * ("would die"), "this turn", another object.
 */
export const EFFECT_EXILE_INSTEAD_WHEN_LEAVING = defineRule<Clauses>({
  id: 'effect.exile-instead-when-leaving',
  family: 'effect',
  leading: ['if'],
  cites: [
    'CR 614.1a (Replacement Effects)',
    'CR 614.6 (Replacement Effects)',
    'CR 400.7 (General)',
  ],
  examples: [
    'if it would leave the battlefield, exile it instead of putting it anywhere else',
    'If it would leave the battlefield, exile it instead of putting it anywhere else',
  ],
  rejects: [
    'if it would leave the battlefield, exile it instead',
    'if it would die, exile it instead of putting it anywhere else',
    'if it would leave the battlefield, exile it instead of putting it into a graveyard',
    'if ~ would leave the battlefield, exile it instead of putting it anywhere else',
    'if it would leave the battlefield this turn, exile it instead of putting it anywhere else',
    'if it would leave the battlefield, exile it instead of putting it anywhere else and draw a card',
    'if they would leave the battlefield, exile them instead of putting them anywhere else',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-instead-when-leaving';
    const r = sequence(
      literal('if '),
      IT(),
      pattern(
        / would leave the battlefield, exile it instead of putting it anywhere else(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    if (!endsSentence()(ctx, r.pos)) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [makeClause(id, 'exileIfLeaves', { objects: r.value[1] }, span)],
      pos: r.pos,
    };
  },
});

/** The card types a "each [type] card exiled with ~" names. */
const LINKED_TYPES = ['creature', 'artifact', 'enchantment', 'land', 'planeswalker'] as const;

/**
 * `effect.put-exiled-with-battlefield`: "Put each creature card exiled with ~ onto the battlefield under your control with a flying counter on it." (CR 607.2a: the cards the linked ability of
 * the permanent exiled, read from its last-known information when it was sacrificed to pay for this; CR 110.2a, 122.6 and 614.1c: they enter under your control with the counter on
 * them). The engine's `moveToZone` of the `linkedExile` cards of the kind, to the battlefield under the control of the player, with the counter. A counter "with a [keyword] counter on
 * it" is optional. Not read: "a card", the number of cards, another zone, "under its owner's control", tapped, "exiled with" another object, more than one counter.
 */
export const EFFECT_PUT_EXILED_WITH_BATTLEFIELD = defineRule<Clauses>({
  id: 'effect.put-exiled-with-battlefield',
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 607.2a (Linked Abilities)',
    'CR 110.2a (Permanents)',
    'CR 122.6 (Counters)',
    'CR 614.1c (Replacement Effects)',
  ],
  examples: [
    'put each creature card exiled with ~ onto the battlefield under your control with a flying counter on it',
    'put each creature card exiled with ~ onto the battlefield under your control',
    'put each artifact card exiled with ~ onto the battlefield under your control with a +1/+1 counter on it',
  ],
  rejects: [
    'put each card exiled with ~ onto the battlefield under your control',
    'put a creature card exiled with ~ onto the battlefield under your control',
    'put each creature card exiled with ~ into your hand',
    "put each creature card exiled with ~ onto the battlefield under its owner's control",
    'put each creature card exiled with ~ onto the battlefield',
    'put each creature card exiled with ~ onto the battlefield under your control tapped',
    'put each creature card exiled with ~ onto the battlefield under your control with a flying counter on it and draw a card',
    'put each creature card exiled with that creature onto the battlefield under your control',
    'put each creature card exiled with ~ onto the battlefield under your control with two flying counters on it',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.put-exiled-with-battlefield';
    const types = LINKED_TYPES.join('|');
    const r = spanned(
      pattern(
        new RegExp(
          `put each (${types}) card exiled with ~ onto the battlefield under your control(?: with an? ([+\\-\\p{L}/0-9]+(?: [\\p{L}]+)?) counter on it)?(?![\\p{L}\\p{N}])(?!\\s+(?:and|tapped))`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = r.value.span;
    const type = (r.value.value[1] ?? '').toLowerCase();
    const counter = r.value.value[2]?.toLowerCase();
    const objects: IrNoun = {
      kind: 'noun',
      det: 'linkedExile',
      filter: { raw: `each ${type} card exiled with ~`, types: [type] },
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: id,
    };
    const to: IrArg = {
      kind: 'zoneSpec',
      zone: 'battlefield',
      whose: 'you',
      ...(counter === undefined ? {} : { counters: { counter, count: 1 } }),
      span,
      rule: id,
    };
    return {
      ok: true,
      value: [makeClause(id, 'putLinkedExile', { objects, to }, span)],
      pos: r.pos,
    };
  },
});

/** Quiet: a line these rules do not read stops where it always did. */
export const GISA_G4_EFFECT_RULES = [
  quietly(EFFECT_GAIN_KEYWORD_FOR_GOOD),
  quietly(EFFECT_EXILE_AT_END_STEP),
  quietly(EFFECT_EXILE_INSTEAD_WHEN_LEAVING),
  quietly(EFFECT_PUT_EXILED_WITH_BATTLEFIELD),
];
