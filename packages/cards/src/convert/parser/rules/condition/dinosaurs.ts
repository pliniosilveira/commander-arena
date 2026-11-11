/**
 * Conditions of stage P32 (D-145, D-147): what the engine's Dinosaurs slice reads. "You don't control another Dinosaur" (the
 * negative of a count of permanents, CR 603.4) and "the creature you control has trample" (what an object an earlier instruction of
 * the text named has: the condition of "excess damage is dealt to that creature's controller instead").
 */
import { fail, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrCondition, IrNoun } from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule } from '../registry';

/**
 * `condition.dont-control-a`: "you don't control a Dinosaur", "you don't control another Dinosaur", "you don't control a creature with
 * power 4 or greater" (CR 603.4, 109.1: "another" is every permanent but the source). One permanent that matches, none of them held:
 * the `not` of "one or more", which is what the engine counts. The kind names no controller of its own.
 */
export const CONDITION_DONT_CONTROL_A = defineRule<IrCondition>({
  id: 'condition.dont-control-a',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 603.4 (Handling Triggered Abilities)', 'CR 109.1 (Objects)'],
  examples: [
    "you don't control another Dinosaur",
    'you don’t control another Dinosaur',
    "you don't control a creature with power 4 or greater",
    "you don't control a Dragon",
    "you don't control another creature",
  ],
  rejects: [
    "you don't control",
    "you don't control a",
    "you don't control two creatures",
    "you don't control a creature you control",
    "you don't control a creature an opponent controls",
    'you control another Dinosaur',
    "you don't control another",
    "an opponent doesn't control a creature",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/you don['’]t control /iu),
      pattern(/(?:an? |another )/iu),
      satisfy(
        map(permanentPhrase(false, 'notBasicLand'), withoutZone),
        (filter) => filter.controller === undefined,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, lead, filter] = r.value;
    const span = { start: pos, end: r.pos };
    const id = 'condition.dont-control-a';
    const noun: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter,
      upTo: false,
      plural: false,
      other: lead[0].toLowerCase() === 'another ',
      span,
      rule: id,
    };
    const inner: IrCondition = {
      kind: 'condition',
      test: { kind: 'control', noun },
      span,
      rule: id,
    };
    return {
      ok: true,
      value: { kind: 'condition', test: { kind: 'not', term: inner }, span, rule: id },
      pos: r.pos,
    };
  },
});

/**
 * `condition.object-has-keyword`: "the creature you control has trample", "it has trample", "that creature has trample" (CR 702.19b, 608.2c:
 * an object an earlier instruction named, as it is or as it last was, has a keyword). One keyword the engine can grant. The object is a
 * pronoun for the binding pass: "the creature you control" is the most recent object noun of the text that says "you control".
 * Read as the `objectMatches` condition against a filter with the keyword.
 */
export const CONDITION_OBJECT_HAS_KEYWORD = defineRule<IrCondition>({
  id: 'condition.object-has-keyword',
  family: 'condition',
  leading: ['the', 'it', 'that'],
  cites: ['CR 702.19b (Trample)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'the creature you control has trample',
    'it has deathtouch',
    'that creature has flying',
    'The creature you control has first strike',
  ],
  rejects: [
    'the creature you control has',
    'the creature you control has trample and flying',
    'the creature you control has flash',
    'the creature has trample',
    'the creatures you control have trample',
    'it has ward {2}',
    'you control a creature with trample',
    'it has a counter',
  ],
  parse: (ctx, pos) => {
    const who = pattern(
      /(?:the (creature|permanent) you control|it|that (creature|permanent)) has /iu,
    )(ctx, pos);
    if (!who.ok) return who;
    const word = KEYWORD_WORDS(ctx, who.pos);
    if (!word.ok) return word;
    const [keyword, ...more] = word.value;
    if (keyword === undefined || more.length > 0) return fail(ctx, pos);
    const lead = who.value[0].slice(0, -' has '.length);
    const end = pattern(/(?=[,.]|$)/u)(ctx, word.pos);
    if (!end.ok) return end;
    const id = 'condition.object-has-keyword';
    const noun: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: lead.toLowerCase() },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + lead.length },
      rule: id,
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'objectMatches', who: noun, filter: { keywords: [keyword], raw: keyword } },
        span: { start: pos, end: word.pos },
        rule: id,
      },
      pos: word.pos,
    };
  },
});

export const DINOSAUR_CONDITION_RULES = [CONDITION_DONT_CONTROL_A, CONDITION_OBJECT_HAS_KEYWORD];

/**
 * The tests a restriction can be lifted by ("unless ..."): a count of permanents of a kind, a commander, a life total or a total of
 * power or toughness. The same tests read for the controller as the ability is looked at.
 */
export const UNLESS_CONDITIONS = [
  'condition.control-a',
  'condition.dont-control-a',
  'condition.control-at-least',
  'condition.control-none',
  'condition.control-commander',
  'condition.control-your-commander',
  'condition.life-total',
  'condition.total-stat',
] as const;
