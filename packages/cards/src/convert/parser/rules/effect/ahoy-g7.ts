/**
 * Effect rules of group 7 of the Ahoy Mateys deck (control and "until" effects).
 *
 * - `effect.lead-gain-becomes-subtype`: "Until end of turn, it gains haste and becomes a Pirate in addition to its other types." (Coercive Recruiter, CR 613.1d, 613.1f, 205.3m, 611.2a).
 * - `effect.doesnt-untap-while-controlling`: "That creature doesn't untap during its controller's untap step for as long as you control ~." (Merchant Raiders, CR 502.3, 611.2b).
 *
 * "target creature ... loses all abilities and has base power and toughness 0/1 until end of turn" (Warkite Marauder) is `effect.loses-abilities`; "gain control of target nonland
 * permanent controlled by a player who was dealt combat damage by three or more Pirates this turn" (Admiral Beckett Brass) is `effect.gain-control` with `noun.target-permanent-controller-dealt-damage-by`.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrClause, IrDuration, IrKeywordArg, IrNoun, IrTypeList } from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { defineRule, family, spanned } from '../registry';
import { CREATURE_TYPE_LIST } from './becomes';
import { type Clauses, makeClause, operands } from './operands';

const BOUNDARY = '(?![\\p{L}\\p{N}])';

/**
 * `effect.lead-gain-becomes-subtype`: "Until end of turn, it gains haste and becomes a Pirate in addition to its other types." (CR 611.2a, 613.1f, 613.1d, 205.3m, 205.1b: one object gets
 * keywords and, in the same words and for the same duration, a creature type added to the types it has; the type is added, nothing is replaced). The duration first, then the one object
 * the text named before ("it", "that creature"); the engine's `grantKeyword` and an additive `setTypes` of the subtype, both until end of turn. Not read: another duration, a type that
 * replaces ("becomes a Pirate" alone), more than one type, a card type, a pump or a color, another verb for the keywords, a plural object, no keywords.
 */
export const EFFECT_LEAD_GAIN_BECOMES_SUBTYPE = defineRule<Clauses>({
  id: 'effect.lead-gain-becomes-subtype',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 205.3m (Subtypes)',
    'CR 205.1b (Type Line)',
  ],
  examples: [
    'Until end of turn, it gains haste and becomes a Pirate in addition to its other types',
    'Until end of turn, that creature gains haste and becomes a Pirate in addition to its other types',
    'Until end of turn, it gains flying and vigilance and becomes an Elf in addition to its other types',
  ],
  rejects: [
    'Until end of turn, it gains haste and becomes a Pirate',
    'Until end of turn, it gains haste and becomes a Pirate in addition to its other types until end of turn',
    'Until your next turn, it gains haste and becomes a Pirate in addition to its other types',
    'Until end of turn, it gain haste and becomes a Pirate in addition to its other types',
    'Until end of turn, they gain haste and become Pirates in addition to their other types',
    'Until end of turn, it gains haste and becomes a Banana in addition to its other types',
    'Until end of turn, it gains haste and becomes a pirate in addition to its other types',
    'Until end of turn, it becomes a Pirate in addition to its other types',
    'Until end of turn, it gets +1/+1 and becomes a Pirate in addition to its other types',
    'Until end of turn, it gains haste and becomes a blue Pirate in addition to its other types',
    'Until end of turn, it gains flash and becomes a Pirate in addition to its other types',
    'Until end of turn, target creature gains haste and becomes a Pirate in addition to its other types',
  ],
  parse: (ctx, pos) => {
    const rule = 'effect.lead-gain-becomes-subtype';
    const head = sequence(
      family<IrDuration>('duration'),
      literal(', '),
      family<IrNoun>('noun', { only: ['noun.it', 'noun.that-object'] }),
      literal(' gains '),
      spanned(KEYWORD_WORDS),
      literal(' and becomes '),
      pattern(/an? /iu),
      spanned(CREATURE_TYPE_LIST),
      spanned(
        pattern(new RegExp(` in addition to (?:its|his|her|their) other types${BOUNDARY}`, 'iu')),
      ),
    )(ctx, pos);
    if (!head.ok) return head;
    const [duration, , subject, , keywords, , , types, additive] = head.value;
    if (duration.scope !== 'untilEndOfTurn' || subject.plural) return fail(ctx, pos);
    // The article is the one of the first word of the type: "an Elf", "a Pirate".
    const out: IrClause[] = [];
    keywords.value.forEach((name) => {
      const keyword: IrKeywordArg = { kind: 'keywordName', name, span: keywords.span, rule };
      out.push({
        ...makeClause(rule, 'grantKeyword', { objects: subject, keyword }, keywords.span),
        duration,
        connector: 'and',
      });
    });
    const typeList: IrTypeList = {
      kind: 'typeList',
      subtypes: types.value,
      additive: true,
      span: types.span,
      rule,
    };
    out.push({
      ...makeClause(
        rule,
        'becomes',
        { objects: subject, types: typeList },
        { start: types.span.start, end: additive.span.end },
      ),
      duration,
    });
    return { ok: true, value: out, pos: head.pos };
  },
});

const WHILE_CONTROLLING =
  / doesn['’]t untap during its controller['’]s untap step for as long as you control ~(?![\p{L}\p{N}])/iu;

/**
 * `effect.doesnt-untap-while-controlling`: "That creature doesn't untap during its controller's untap step for as long as you control ~." (CR 502.3, 611.2b, 611.2c: the
 * permanent the text named, fixed when the effect begins, stays tapped through every untap step of its controller until the controller of the ability no longer controls the permanent
 * with the ability; if that has already happened as the effect would begin, it does nothing). The object is a target or what an earlier instruction named; the engine's `restrict` of
 * `doesntUntap` with the duration `forAsLongAsYouControlThis`. Not read: "next untap step" (`effect.doesnt-untap-next`), "your" step, another player's permanent with the words "as long
 * as that player controls", "for as long as ~ remains tapped", a group, no duration.
 */
export const EFFECT_DOESNT_UNTAP_WHILE_CONTROLLING = defineRule<Clauses>({
  id: 'effect.doesnt-untap-while-controlling',
  family: 'effect',
  leading: ['target', 'that'],
  cites: [
    'CR 502.3 (Untap Step)',
    'CR 611.2b (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    "that creature doesn't untap during its controller's untap step for as long as you control ~",
    "target creature doesn't untap during its controller's untap step for as long as you control ~",
    'that creature doesn’t untap during its controller’s untap step for as long as you control ~',
  ],
  rejects: [
    "that creature doesn't untap during its controller's next untap step",
    "that creature doesn't untap during its controller's untap step",
    "that creature doesn't untap during its controller's untap step for as long as you control a Pirate",
    "that creature doesn't untap during your untap step for as long as you control ~",
    "that creature doesn't untap during its controller's untap step for as long as ~ remains tapped",
    "that creature doesn't untap during its controller's untap step for as long as that player controls ~",
    "those creatures don't untap during their controllers' untap steps for as long as you control ~",
    "that creature doesn't untap during its controller's untap step until end of turn",
    "that creature don't untap during its controller's untap step for as long as you control ~",
    "that creature doesn't untap during its controller's untap step for as long as you control ~ and draw a card",
    "~ doesn't untap during its controller's untap step for as long as you control ~",
  ],
  parse: (ctx, pos) => {
    const rule = 'effect.doesnt-untap-while-controlling';
    const subject = operands(['noun.target-permanent', 'noun.that-object'], rule)(ctx, pos);
    if (!subject.ok) return subject;
    if (subject.value.kind !== 'noun' || subject.value.plural) return fail(ctx, pos);
    const words = spanned(pattern(WHILE_CONTROLLING))(ctx, subject.pos);
    if (!words.ok) return words;
    // The sentence ends here.
    if (!/^(?:\.|$)/u.test(ctx.text.slice(words.pos))) return fail(ctx, pos);
    return {
      ok: true,
      value: [
        makeClause(
          rule,
          'doesntUntapWhileControlling',
          { objects: subject.value },
          { start: pos, end: words.pos },
        ),
      ],
      pos: words.pos,
    };
  },
});

export const AHOY_G7_EFFECT_RULES = [
  EFFECT_LEAD_GAIN_BECOMES_SUBTYPE,
  EFFECT_DOESNT_UNTAP_WHILE_CONTROLLING,
];
