/**
 * Effect rules of group 4 of the Gisa deck (issue 41, D-459, D-460): the sentences after "Return target creature card from your graveyard to the battlefield." of Whip of
 * Erebos ("It gains haste. Exile it at the beginning of the next end step. If it would leave the battlefield, exile it instead of putting it anywhere else.") and the effect of
 * Ghost Vacuum ("Put each creature card exiled with ~ onto the battlefield under your control with a flying counter on it."; its next sentence, "Each of them is a 1/1 Spirit in
 * addition to its other types.", is `effect.becomes-in-addition` of the Hofri deck). Every sentence is about the objects the instruction before it put onto the battlefield, which the
 * lowering checks (`ctx.movedOnto`).
 */
import { fail, literal, map, optional, pattern, sequence } from '../../combinators';
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
 * the object stays on the battlefield, about the permanent the instruction before it put there). The engine's `exileIfLeaves` of the `moved` objects. The permanent is "it" or, as
 * From the Catacombs says it, "that creature". Not read: another condition ("would die"), "this turn", another object.
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
    // From the Catacombs (CR 614.1a): the creature the sentence before put onto the battlefield.
    'if that creature would leave the battlefield, exile it instead of putting it anywhere else',
  ],
  rejects: [
    'if that permanent would leave the battlefield, exile it instead of putting it anywhere else',
    'if those creatures would leave the battlefield, exile them instead of putting them anywhere else',
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
    const rider =
      / would leave the battlefield, exile it instead of putting it anywhere else(?![\p{L}\p{N}])/iu;
    const r = sequence(literal('if '), IT(), pattern(rider))(ctx, pos);
    if (r.ok) {
      if (!endsSentence()(ctx, r.pos)) return fail(ctx, pos);
      const span = { start: pos, end: r.pos };
      return {
        ok: true,
        value: [makeClause(id, 'exileIfLeaves', { objects: r.value[1] }, span)],
        pos: r.pos,
      };
    }
    // "that creature" is read as "it" is: the permanent the instruction before it put onto the battlefield, which the binding pass and the lowering check.
    const that = sequence(literal('if that creature'), pattern(rider))(ctx, pos);
    if (!that.ok) return that;
    if (!endsSentence()(ctx, that.pos)) return fail(ctx, pos);
    const span = { start: pos, end: that.pos };
    const objects: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: 'that creature' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos + 3, end: pos + 3 + 'that creature'.length },
      rule: id,
    };
    return {
      ok: true,
      value: [makeClause(id, 'exileIfLeaves', { objects }, span)],
      pos: that.pos,
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

/**
 * `effect.put-target-exiled-with-battlefield`: "Put target creature card exiled with ~ onto the battlefield tapped under your control with two additional +1/+1 counters on it." (The Darkness
 * Crystal; CR 607.2a: a card the linked ability of the permanent exiled; CR 115.1 it is a target; CR 110.2a, 122.6 and 614.1c: it enters tapped, under your control, with the counters on
 * it). The engine's `moveToZone` of the target card of the exile to the battlefield, with the counters. The words "additional" and "tapped" are optional, "a" or a number of counters.
 * Not read: "each", "a card", another zone, "under its owner's control", "exiled with" another object, a counter that is not a +1/+1 counter, a count of 0 or one that is not a
 * number.
 */
export const EFFECT_PUT_TARGET_EXILED_WITH_BATTLEFIELD = defineRule<Clauses>({
  id: 'effect.put-target-exiled-with-battlefield',
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 607.2a (Linked Abilities)',
    'CR 115.1 (Targets)',
    'CR 110.2a (Permanents)',
    'CR 122.6 (Counters)',
    'CR 614.1c (Replacement Effects)',
  ],
  examples: [
    'put target creature card exiled with ~ onto the battlefield tapped under your control with two additional +1/+1 counters on it',
    'put target creature card exiled with ~ onto the battlefield under your control',
    'put target card exiled with ~ onto the battlefield tapped under your control with an additional +1/+1 counter on it',
  ],
  rejects: [
    'put each creature card exiled with ~ onto the battlefield tapped under your control',
    "put target creature card exiled with ~ onto the battlefield under its owner's control",
    'put target creature card exiled with ~ onto the battlefield',
    'put target creature card exiled with ~ into your hand',
    'put target creature card exiled with that creature onto the battlefield under your control',
    'put target creature card exiled with ~ onto the battlefield under your control with two additional flying counters on it',
    'put target creature card exiled with ~ onto the battlefield under your control with zero additional +1/+1 counters on it',
    'put target creature card exiled with ~ onto the battlefield under your control and draw a card',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.put-target-exiled-with-battlefield';
    const r = sequence(
      literal('put '),
      family<IrNoun>('noun', { only: ['noun.target-card-exiled-with-self'] }),
      pattern(/ onto the battlefield( tapped)? under your control/iu),
      optional(
        sequence(pattern(/ with (?:an? |(two|three|four) )additional \+1\/\+1 counters? on it/iu)),
        null,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, objects, where, counters] = r.value;
    if (!endsSentence()(ctx, r.pos)) return fail(ctx, pos);
    const count =
      counters === null
        ? 0
        : ({ two: 2, three: 3, four: 4 }[(counters[0][1] ?? '').toLowerCase()] ?? 1);
    const span = { start: pos, end: r.pos };
    const to: IrArg = {
      kind: 'zoneSpec',
      zone: 'battlefield',
      whose: 'you',
      ...(where[1] === undefined ? {} : { tapped: true as const }),
      ...(counters === null ? {} : { counters: { counter: '+1/+1', count } }),
      span,
      rule: id,
    };
    return { ok: true, value: [makeClause(id, 'return', { objects, to }, span)], pos: r.pos };
  },
});

/**
 * `effect.return-to-command-zone-at-end-step`: "Return it to the command zone at the beginning of the next end step." (issue 103, Hellkite Courser; CR 603.7, 603.7c, 400.7j, 903.9: a
 * delayed triggered ability about the commander the instruction before it put onto the battlefield; once that object has changed zones it is a new object and the ability does nothing).
 * The engine's `delayedTrigger` at the end step of each turn, whose effect moves the `moved` objects to the command zone. Not read: "your next end step", another object than "it",
 * another zone, another step.
 */
export const EFFECT_RETURN_TO_COMMAND_AT_END_STEP = defineRule<Clauses>({
  id: 'effect.return-to-command-zone-at-end-step',
  family: 'effect',
  leading: ['return'],
  cites: [
    'CR 603.7 (Delayed Triggered Abilities)',
    'CR 603.7c (Delayed Triggered Abilities)',
    'CR 400.7j (General)',
    'CR 903.9 (Commander)',
  ],
  examples: [
    'return it to the command zone at the beginning of the next end step',
    'Return it to the command zone at the beginning of the next end step',
  ],
  rejects: [
    'return it to the command zone at the beginning of your next end step',
    'return it to the command zone at the beginning of the next end step and draw a card',
    'return it to the command zone',
    'return it to the command zone at the beginning of the next end',
    'return them to the command zone at the beginning of the next end step',
    "return it to its owner's hand at the beginning of the next end step",
    'return target creature to the command zone at the beginning of the next end step',
    'return ~ to the command zone at the beginning of the next end step',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.return-to-command-zone-at-end-step';
    const r = sequence(
      literal('return '),
      IT(),
      pattern(/ to the command zone at the beginning of the next end step(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    if (!endsSentence()(ctx, r.pos)) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [makeClause(id, 'returnToCommandAtEndStep', { objects: r.value[1] }, span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.return-to-hand-at-end-step`: "Return it to your hand at the beginning of the next end step." (Nahiri, the Harbinger; CR 603.7, 603.7c, 400.7: a delayed triggered ability about the
 * permanent the instruction before it put onto the battlefield; once that object has changed zones it is a new object and the ability does nothing). The engine's `delayedTrigger` at the end
 * step of each turn, whose effect moves the `moved` objects to their owner's hand. Not read: "your next end step", another object than "it", another zone, another step, "its owner's hand".
 */
export const EFFECT_RETURN_TO_HAND_AT_END_STEP = defineRule<Clauses>({
  id: 'effect.return-to-hand-at-end-step',
  family: 'effect',
  leading: ['return'],
  cites: [
    'CR 603.7 (Delayed Triggered Abilities)',
    'CR 603.7c (Delayed Triggered Abilities)',
    'CR 400.7 (General)',
  ],
  examples: [
    'return it to your hand at the beginning of the next end step',
    'Return it to your hand at the beginning of the next end step',
  ],
  rejects: [
    'return it to your hand at the beginning of your next end step',
    'return it to your hand at the beginning of the next end step and draw a card',
    'return it to your hand',
    'return it to your hand at the beginning of the next end',
    'return them to your hand at the beginning of the next end step',
    "return it to its owner's hand at the beginning of the next end step",
    'return target creature to your hand at the beginning of the next end step',
    'return ~ to your hand at the beginning of the next end step',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.return-to-hand-at-end-step';
    const r = sequence(
      literal('return '),
      IT(),
      pattern(/ to your hand at the beginning of the next end step(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    if (!endsSentence()(ctx, r.pos)) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [makeClause(id, 'returnToHandAtEndStep', { objects: r.value[1] }, span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.put-commander-from-command-zone`: "You may put a commander you own from the command zone onto the battlefield." (issue 103, Hellkite Courser; CR 903.3, 400.7, 110.2a:
 * the card enters under the control of the player who puts it; CR 608.2d: the player chooses it as the instruction runs). A commander its owner designated, among the cards in the
 * command zone of that player; with "you may" the player may choose none. Not read: another zone, "target", a number, "under its owner's control", tapped, "a commander" of any owner.
 */
export const EFFECT_PUT_COMMANDER_FROM_COMMAND_ZONE = defineRule<Clauses>({
  id: 'effect.put-commander-from-command-zone',
  family: 'effect',
  leading: ['you', 'put'],
  cites: [
    'CR 903.3 (Commander)',
    'CR 400.7 (General)',
    'CR 110.2a (Permanents)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'you may put a commander you own from the command zone onto the battlefield',
    'put a commander you own from the command zone onto the battlefield',
  ],
  rejects: [
    'you may put a commander you own from the command zone onto the battlefield tapped',
    'you may put a commander you own from the command zone onto the battlefield and draw a card',
    'you may put a commander from the command zone onto the battlefield',
    'you may put a commander you own from your graveyard onto the battlefield',
    'you may put target commander you own from the command zone onto the battlefield',
    'you may put two commanders you own from the command zone onto the battlefield',
    'you may put a commander you own from the command zone into your hand',
    'you may put a creature you own from the command zone onto the battlefield',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.put-commander-from-command-zone';
    const r = spanned(
      pattern(
        /(you may )?put a commander you own from the command zone onto the battlefield(?![\p{L}\p{N}])(?!\s+(?:and|tapped|under))/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = r.value.span;
    const objects: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: { raw: 'a commander you own', commander: 'yours', card: true },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: id,
    };
    const may: IrArg = {
      kind: 'flag',
      value: r.value.value[1] !== undefined,
      span: { start: pos, end: pos },
      rule: id,
    };
    return {
      ok: true,
      value: [
        {
          ...makeClause(id, 'putCommanderFromCommandZone', { objects, may }, span),
          optional: may.value,
        },
      ],
      pos: r.pos,
    };
  },
});

/** Quiet: a line these rules do not read stops where it always did. */
export const GISA_G4_EFFECT_RULES = [
  quietly(EFFECT_PUT_COMMANDER_FROM_COMMAND_ZONE),
  quietly(EFFECT_RETURN_TO_COMMAND_AT_END_STEP),
  quietly(EFFECT_RETURN_TO_HAND_AT_END_STEP),
  quietly(EFFECT_GAIN_KEYWORD_FOR_GOOD),
  quietly(EFFECT_EXILE_AT_END_STEP),
  quietly(EFFECT_EXILE_INSTEAD_WHEN_LEAVING),
  quietly(EFFECT_PUT_EXILED_WITH_BATTLEFIELD),
  quietly(EFFECT_PUT_TARGET_EXILED_WITH_BATTLEFIELD),
];
