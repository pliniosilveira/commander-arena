/**
 * "~ gets +1/+1 until end of turn", "target creature gets -2/-2 until end of turn", "creatures you
 * control get +1/+1 until end of turn" (CR 611.2a continuous effects of a resolving spell or
 * ability, CR 613.4c layer 7c). A change of power and toughness with no stated duration would last
 * for ever (CR 611.2a), which is a different effect, so the duration is part of the phrase and its
 * absence is not read.
 */
import {
  choice,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  quiet,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrAmount, IrArg, IrDuration, IrNoun, IrPtChange, IrPtTerm } from '../../ir/types';
import { FOR_EACH_TAIL } from '../amount/scaled';
import { TYPE_LEADING_WORDS } from '../noun/creature-types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, single } from './operands';

/** One half of "+1/+1": a signed number, or X with its sign (stage P20: "+X/+0", "-X/-X"). */
function ptTerm(sign: string | undefined, word: string | undefined): IrPtTerm {
  if (word === 'X') return { kind: 'x', sign: sign === '-' ? -1 : 1 };
  // `+ 0` turns "-0" into 0.
  return (sign === '-' ? -Number(word) : Number(word)) + 0;
}

/**
 * "+1/+1", "-2/-2", "+3/-1", "+X/+0", "-X/-X" as a power and toughness change, stamped with the rule
 * that read it. X is the number announced for the spell or activated ability (CR 107.3a); the lowering
 * checks that the text may have one.
 */
export function ptChange(rule: string): Parser<IrPtChange> {
  return map(
    spanned(pattern(/([+-])(\d+|X)\/([+-])(\d+|X)(?![\p{L}\p{N}/])/u)),
    ({ value, span }): IrPtChange => ({
      kind: 'ptChange',
      power: ptTerm(value[1], value[2]),
      toughness: ptTerm(value[3], value[4]),
      span,
      rule,
    }),
  );
}

const PT_CHANGE = ptChange('effect.pump');

/** What a single pump or gain can be said of: the source, a target, or "it" (CR 109.1). */
export const SINGLE_SUBJECTS: readonly string[] = [
  'noun.self',
  'noun.target-commander',
  'noun.target-permanent',
  'noun.it',
];

/**
 * The subjects of a pump or a gain that one permanent is named by: those of `SINGLE_SUBJECTS` and, since stage P35 (D-176, CR 303.4b, 301.5a),
 * the permanent an Aura or an Equipment is attached to ("When ~ enters, enchanted creature gains trample until end of turn"), which the
 * lowering reads as the engine's `attached` on a face of that kind, and "that creature".
 */
export const GAIN_SUBJECTS: readonly string[] = [
  ...SINGLE_SUBJECTS,
  'noun.attached-permanent',
  // "That creature also gains trample until end of turn" (stage P35): the object an earlier sentence or line named.
  'noun.that-object',
  // Stage P49 (D-206): "That token gains haste until end of turn".
  'noun.that-token',
];

/**
 * The change, its duration and, since stage P28 (D-131), the count it is for: "-1/-1 until end of turn for each Swamp
 * you control" (CR 611.2c: counted once, as the effect resolves, and it stays).
 */
const PUMP_TAIL = satisfy(
  sequence(PT_CHANGE, literal(' '), family<IrDuration>('duration'), optional(FOR_EACH_TAIL, null)),
  // An X as the step of a count would multiply two numbers nobody has chosen together.
  ([pt, , , count]) =>
    count === null || (typeof pt.power === 'number' && typeof pt.toughness === 'number'),
);

/** The arguments of a pump: the objects, the change and the count when the text has one. */
function pumpArgs(objects: IrNoun, pt: IrPtChange, count: IrAmount | null): Record<string, IrArg> {
  return count === null ? { objects, pt } : { objects, pt, count };
}

/** `effect.pump`: one object ("~", "target creature") gets a change of power and toughness. */
export const EFFECT_PUMP = defineRule<Clauses>({
  id: 'effect.pump',
  family: 'effect',
  leading: ['~', 'target', 'another', 'it', 'enchanted', 'equipped', 'that'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
    'CR 514.2 (Cleanup Step)',
  ],
  examples: [
    '~ gets +1/+1 until end of turn',
    'another target creature gets +2/+0 until end of turn',
    '~ gets +1/+0 until end of turn',
    '~ gets +1/-1 until end of turn',
    '~ gets +X/+0 until end of turn',
    'target creature gets +X/+X until end of turn',
    'target creature gets -X/-X until end of turn',
    'target creature gets +3/+3 until end of turn',
    'target creature you control gets +2/+2 until end of turn',
    'target creature gets -2/-2 until end of turn',
    'it gets +1/+0 until end of turn',
    'enchanted creature gets +2/+2 until end of turn',
    '~ gets +1/+1 until end of turn for each creature you control',
    'target creature gets -2/-2 until end of turn for each Swamp you control',
  ],
  rejects: [
    '~ gets +X/+X until end of turn for each creature you control',
    '~ gets +1/+1 until end of turn for each creature',
    '~ gets +1/+1',
    '~ gets +1/+1 until your next turn',
    '~ gets +Y/+Y until end of turn',
    '~ gets +X/Y until end of turn',
    '~ gets +x/+x until end of turn',
    '~ gets X/X until end of turn',
    '~ gets +1/+1 and gains flying until end of turn',
    'its gets +1/+1 until end of turn',
    'target creatures get +1/+1 until end of turn',
    'target creature gets 1/1 until end of turn',
    '~ gets +1/+1 until end of turn and draw a card',
    'creatures you control get +1/+1 until end of turn',
  ],
  parse: single(
    'effect.pump',
    sequence(family<IrNoun>('noun', { only: GAIN_SUBJECTS }), literal(' gets '), PUMP_TAIL),
    ([objects, , [pt, , duration, count]]) => ({
      verb: 'modifyPt',
      args: pumpArgs(objects, pt, count),
      duration,
    }),
  ),
});

/**
 * The words a plural noun phrase can start with ("creatures", "nonland", "artifact creatures"). Since stage P29 also
 * the first word of any creature type of the table, singular or plural ("Dragons you control", "Zombie creatures"),
 * and the new modifiers ("nontoken", "colorless", "non-Zombie").
 */
export const PLURAL_STARTS = [
  ...TYPE_LEADING_WORDS,
  ...TYPE_LEADING_WORDS.map((word) => `non-${word}`),
  'nontoken',
  'colorless',
  ...['creatures', 'artifacts', 'enchantments', 'lands', 'planeswalkers', 'battles', 'permanents'],
  ...['artifact', 'enchantment', 'land', 'planeswalker', 'battle', 'creature'],
  ...['legendary', 'basic', 'snow', 'tapped', 'untapped'],
  ...['white', 'blue', 'black', 'red', 'green'],
  ...['nonland', 'noncreature', 'nonartifact', 'nonenchantment', 'nonplaneswalker'],
];

/**
 * `effect.pump-all`: "creatures you control get +1/+1 until end of turn": every permanent that
 * matches as the effect resolves gets the change; which ones is fixed then (CR 611.2c).
 */
export const EFFECT_PUMP_ALL = defineRule<Clauses>({
  id: 'effect.pump-all',
  family: 'effect',
  leading: PLURAL_STARTS,
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
  ],
  examples: [
    'creatures you control get +1/+1 until end of turn',
    'creatures you control get +2/+0 until end of turn',
    'creatures your opponents control get -1/-1 until end of turn',
    'nonland permanents you control get +1/+1 until end of turn',
    'creatures you control get +1/+1 until end of turn for each artifact you control',
    // Stage P65 (D-218): the attackers of your opponents.
    'creatures attacking your opponents and/or planeswalkers they control get +2/+0 until end of turn',
  ],
  rejects: [
    'creatures you control gets +1/+1 until end of turn',
    'creatures you control get +1/+1',
    'other creatures you control get +1/+1 until end of turn',
    'creatures you control get +1/+1 and gain trample until end of turn',
    'target creatures get +1/+1 until end of turn',
  ],
  parse: single(
    'effect.pump-all',
    sequence(
      family<IrNoun>('noun', { only: ['noun.plain-permanents', 'noun.attacking-opponents'] }),
      literal(' get '),
      PUMP_TAIL,
    ),
    ([objects, , [pt, , duration, count]]) => ({
      verb: 'modifyPt',
      args: pumpArgs(objects, pt, count),
      duration,
    }),
  ),
});

/**
 * `effect.pump-each`: every permanent of a kind, whoever controls it, gets the change as the effect
 * resolves (CR 611.2a, 611.2c; stage P20): "All creatures get -X/-X until end of turn.", "Each creature
 * gets +1/+1 until end of turn." The verb agrees with the subject: "all creatures get", "each creature
 * gets". The permanents are those on the battlefield when the effect resolves; later arrivals are not
 * affected (CR 611.2c).
 */
export const EFFECT_PUMP_EACH = defineRule<Clauses>({
  id: 'effect.pump-each',
  family: 'effect',
  leading: ['all', 'each'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
    'CR 107.3a (Numbers and Symbols)',
  ],
  examples: [
    'All creatures get -X/-X until end of turn',
    'All creatures get +1/+1 until end of turn',
    'All creatures your opponents control get -1/-1 until end of turn',
    'Each creature gets +2/+0 until end of turn',
    'each creature you control gets +1/+1 until end of turn',
    'All creatures get -1/-1 until end of turn for each Swamp you control',
    'Each creature gets +1/+1 until end of turn for each artifact you control',
  ],
  rejects: [
    'All creatures get -X/-X',
    'All creatures gets -X/-X until end of turn',
    'Each creature get -X/-X until end of turn',
    'All creatures get -X/-X until your next turn',
    'All creatures get -X/-X until end of turn and draw a card',
    'All creatures get +1/+1 and gain flying until end of turn',
    'creatures you control get +1/+1 until end of turn',
  ],
  // The subject and its verb are read quietly: "Each creature deals 1 damage" was never this sentence, so
  // its failure must not move the line's `stoppedAt` ("each" and "all" begin many other sentences).
  parse: single(
    'effect.pump-each',
    sequence(
      quiet(
        choice(
          sequence(family<IrNoun>('noun', { only: ['noun.all-permanents'] }), literal(' get ')),
          sequence(family<IrNoun>('noun', { only: ['noun.each-permanent'] }), literal(' gets ')),
        ),
      ),
      PUMP_TAIL,
    ),
    ([[objects], [pt, , duration, count]]) => ({
      verb: 'modifyPt',
      args: pumpArgs(objects, pt, count),
      duration,
    }),
  ),
});

export const PUMP_RULES = [EFFECT_PUMP, EFFECT_PUMP_ALL, EFFECT_PUMP_EACH];
