/**
 * "Target creature gains flying until end of turn", "~ gets +2/+2 and gains first strike until end
 * of turn", "Creatures you control gain trample until end of turn" (CR 611.2a a continuous effect
 * of a resolving spell or ability, CR 613.1f layer 6 abilities, CR 613.4c layer 7c). The subject
 * is the same object or group throughout, so the clauses of one sentence (an optional pump, then
 * one grant per keyword) share one noun, and one chosen target is one target (CR 115.1). The
 * words are the Oracle ones: a singular subject "gets" and "gains", a plural one "get" and "gain".
 * The keywords are those the engine can grant (`GRANTABLE_KEYWORDS`, CR 613.1f): a keyword with a
 * parameter and flash are not, and a "gains" line that names one stays unread (prowess and exalted are, since D-149: the engine expands a
 * granted instance into its triggered ability).
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  satisfy,
  sequence,
} from '../../combinators';
import type {
  IrAmount,
  IrArg,
  IrClause,
  IrDuration,
  IrKeywordArg,
  IrNoun,
  IrNounList,
  IrPtChange,
  IrRestrictionKind,
  Span,
} from '../../ir/types';
import { FOR_EACH_TAIL } from '../amount/scaled';
import { KEYWORD_WORDS } from '../keyword/list';
import { defineRule, family, spanned } from '../registry';
import { readQuotedAbility } from '../static/quoted';
import { type Clauses, makeClause } from './operands';
import { GAIN_SUBJECTS, PLURAL_STARTS, ptChange } from './pump';

interface GainParts {
  readonly subject: IrNoun | IrNounList;
  readonly pt: IrPtChange | null;
  readonly keywords: readonly string[];
  readonly gains: { readonly start: number; readonly end: number };
  readonly duration: IrDuration;
  /** "... until end of turn and must be blocked this turn if able" (stage P49, D-206): a requirement of the same subject for the turn. */
  readonly requirement?: GainRequirement & { readonly span: Span };
}

/**
 * "and attacks this turn if able", "and must be blocked this turn if able" after the duration of a gain (stage P49, D-206, CR 508.1d, 509.1c): the
 * requirement the same subject gets for the turn, the engine's `restrict`.
 */
const REQUIREMENT = (plural: boolean) =>
  spanned(
    satisfy(
      map(
        pattern(
          plural
            ? / and (attack|must be blocked) this (turn|combat) if able(?![\p{L}\p{N}])/iu
            : / and (attacks|must be blocked) this (turn|combat) if able(?![\p{L}\p{N}])/iu,
        ),
        (m): GainRequirement => ({
          restriction: /blocked/iu.test(m[1] ?? '') ? 'mustBeBlocked' : 'attacksEachCombat',
          scope: /combat/iu.test(m[2] ?? '') ? 'thisCombat' : 'thisTurn',
        }),
      ),
      // CR 508.1d, 506.1 (issue 101, Legion Warboss): "attacks this combat if able" is a requirement of one combat; "must be blocked this combat" is not read.
      (r) => r.scope === 'thisTurn' || r.restriction === 'attacksEachCombat',
    ),
  );

/** The requirement a gain sentence adds after its duration, and how long it lasts: the turn, or one combat (the engine's `thisCombat`). */
interface GainRequirement {
  readonly restriction: IrRestrictionKind;
  readonly scope: 'thisTurn' | 'thisCombat';
}

/** The clauses of one gain sentence: the pump if there is one, then a grant per keyword. */
function clausesOf(rule: string, parts: GainParts): Clauses {
  const { subject, pt, keywords, gains, duration, requirement } = parts;
  const clauses: IrClause[] = [];
  if (pt !== null) {
    const clause = makeClause(rule, 'modifyPt', { objects: subject, pt }, pt.span);
    clauses.push({ ...clause, duration, connector: 'and' });
  }
  keywords.forEach((name, i) => {
    const keyword: IrKeywordArg = { kind: 'keywordName', name, span: gains, rule };
    const clause = makeClause(rule, 'grantKeyword', { objects: subject, keyword }, gains);
    const more = i < keywords.length - 1 || requirement !== undefined;
    clauses.push({ ...clause, duration, ...(more ? { connector: 'and' } : {}) });
  });
  if (requirement !== undefined) {
    const kind: IrArg = {
      kind: 'restrictionKind',
      restriction: requirement.restriction,
      span: requirement.span,
      rule,
    };
    const forTurn: IrDuration = {
      kind: 'duration',
      scope: requirement.scope,
      span: requirement.span,
      rule,
    };
    clauses.push({
      ...makeClause(rule, 'restrict', { objects: subject, restriction: kind }, requirement.span),
      duration: forTurn,
    });
  }
  return clauses;
}

/** What follows the subject: an optional pump, then the keywords with where they were read. */
interface GainTail {
  readonly pt: IrPtChange | null;
  readonly gains: { readonly value: readonly string[]; readonly span: Span };
}

export function gainParser(
  rule: string,
  subjects: readonly string[],
  plural: boolean,
  /** Stage P41 (D-188): a condition on the subject read, for a rule that takes only some of the nouns of `subjects`. */
  accept: (subject: IrNoun) => boolean = () => true,
  /** The words that end the sentence (stage P50, D-207): "until end of turn" by default; Old Fat Spider Can't See Me says "for as long as ~ remains on the battlefield". */
  durationParser: Parser<IrDuration> = family<IrDuration>('duration'),
  /** Stage P53 (D-212): another way to read the subject, a list of nouns ("~ and that creature each"); `subjects` is then not read. */
  subjectParser?: Parser<IrNoun | IrNounList>,
): Parser<Clauses> {
  // The verb is read with its spaces in one pattern, so a subject followed by some other verb fails
  // where `effect.pump` fails and the diagnostic (`closestRule`) names the earlier rule of the two.
  const keywords = (verb: RegExp) =>
    spanned(map(sequence(pattern(verb), KEYWORD_WORDS), ([, words]): readonly string[] => words));
  const pumped = map<[unknown, IrPtChange, GainTail['gains']], GainTail>(
    sequence(
      pattern(plural ? / get / : / gets /),
      ptChange(rule),
      keywords(plural ? / and gain / : / and gains /),
    ),
    ([, pt, g]) => ({ pt, gains: g }),
  );
  // "That creature also gains trample until end of turn" (stage P35, D-176): "also" says only that it is in addition to what the line before
  // gave the same creature, which every sentence after another does (CR 608.2c).
  const plain = map(
    keywords(plural ? / (?:also )?gain / : / (?:also )?gains /),
    (g): GainTail => ({ pt: null, gains: g }),
  );
  // "creatures you control gain trample and get +X/+0 until end of turn" (stage P64, D-217): the keywords first, then the pump.
  const gainedThenPumped = map<[GainTail['gains'], unknown, IrPtChange], GainTail>(
    sequence(
      keywords(plural ? / (?:also )?gain / : / (?:also )?gains /),
      pattern(plural ? / and get / : / and gets /),
      ptChange(rule),
    ),
    ([g, , pt]) => ({ pt, gains: g }),
  );
  return map(
    sequence(
      subjectParser ?? satisfy(family<IrNoun>('noun', { only: subjects }), accept),
      choice<GainTail>(pumped, gainedThenPumped, plain),
      literal(' '),
      durationParser,
      optional(REQUIREMENT(plural), null),
    ),
    ([subject, { pt, gains }, , duration, requirement]): Clauses =>
      clausesOf(rule, {
        subject,
        pt,
        keywords: gains.value,
        gains: gains.span,
        duration,
        ...(requirement === null
          ? {}
          : {
              requirement: {
                restriction: requirement.value.restriction,
                scope: requirement.value.scope,
                span: requirement.span,
              },
            }),
      }),
  );
}

/**
 * `effect.gain-keyword`: one object gains keywords, with or without a pump in front: "target
 * creature gains flying until end of turn", "~ gains first strike until end of turn", "it gains
 * hexproof until end of turn", "target creature gets +3/+1 and gains trample until end of turn".
 */
export const EFFECT_GAIN_KEYWORD = defineRule<Clauses>({
  id: 'effect.gain-keyword',
  family: 'effect',
  leading: ['~', 'target', 'another', 'it', 'enchanted', 'equipped', 'that'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
    'CR 514.2 (Cleanup Step)',
  ],
  examples: [
    'target creature gains flying until end of turn',
    'another target creature gets +2/+0 and gains trample until end of turn',
    '~ gains first strike until end of turn',
    'it gains hexproof until end of turn',
    'target creature you control gains lifelink until end of turn',
    'target creature gains flying and first strike until end of turn',
    'target creature gains flying, first strike, and vigilance until end of turn',
    'target creature gets +2/+2 and gains first strike until end of turn',
    'target creature gets +3/+1 and gains trample until end of turn',
    'target creature gets +X/+0 and gains trample until end of turn',
    'target creature you control gets +X/+X and gains hexproof and indestructible until end of turn',
    '~ gets +1/+1 and gains flying and lifelink until end of turn',
    'target creature gains skulk until end of turn',
    // Issue 89 (D-638, CR 702.21a): a ward with a mana cost.
    'target creature gains ward {2} until end of turn',
    // Stage P35 (D-176, CR 303.4b): the permanent an Aura is attached to.
    'enchanted creature gains trample and indestructible until end of turn',
    'equipped creature gains flying until end of turn',
    'that creature gains trample until end of turn',
    'that creature also gains trample until end of turn',
    'target creature also gains trample until end of turn',
    // Issue 101 (Legion Warboss, CR 508.1d): the requirement of one combat.
    'that token gains haste until end of turn and attacks this combat if able',
  ],
  rejects: [
    'that token gains haste until end of turn and must be blocked this combat if able',
    'target creature gains flying',
    'target creature gains flying until your next turn',
    'target creature gains flying until end of turn and draw a card',
    'target creature gains flying, first strike and vigilance until end of turn',
    'target creature gains flying and flying until end of turn',
    'target creature gains flash until end of turn',
    'target creature gains storm until end of turn',
    'target creature gains cascade until end of turn',
    'target creature gains battle cry until end of turn',
    'target creature gains protection from red until end of turn',
    'target creature gains ward until end of turn',
    'target creature gets +1/+1 and gains until end of turn',
    'target creature gets +Y/+Y and gains flying until end of turn',
    'target creature gets +X/+Y and gains flying until end of turn',
    'target creature gets +1/+1 until end of turn',
    'target creature gain flying until end of turn',
    'target creature also gain flying until end of turn',
    'target creature gets +1/+1 and also gains trample until end of turn',
    'target creatures gain flying until end of turn',
    'creatures you control gain flying until end of turn',
  ],
  parse: gainParser('effect.gain-keyword', GAIN_SUBJECTS, false),
});

/**
 * `effect.gain-keyword-all`: a group gains keywords, with or without a pump: "creatures you
 * control gain trample until end of turn", "permanents you control gain hexproof and
 * indestructible until end of turn", "creatures you control get +1/+1 and gain haste until end of
 * turn", and, since stage P29, every permanent of a kind whoever controls it ("All Zombies gain menace until end of
 * turn"). Which permanents it means is fixed as the effect resolves (CR 611.2c).
 */
export const EFFECT_GAIN_KEYWORD_ALL = defineRule<Clauses>({
  id: 'effect.gain-keyword-all',
  family: 'effect',
  leading: [...PLURAL_STARTS, 'all', 'tokens'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
  ],
  examples: [
    'All Zombies gain menace until end of turn',
    // Issue 101 (Ainok Strike Leader): the tokens of the controller.
    'creature tokens you control gain indestructible until end of turn',
    'tokens you control gain haste until end of turn',
    'All creatures get +1/+1 and gain trample until end of turn',
    'All Time Lords gain flying until end of turn',
    'Dragons you control gain flying until end of turn',
    'creatures you control gain trample until end of turn',
    'creatures you control gain indestructible until end of turn',
    'permanents you control gain hexproof and indestructible until end of turn',
    'creatures you control get +1/+1 and gain haste until end of turn',
    // Stage P64 (D-217): the keywords first, then the pump (Craterclaw Colossus).
    'creatures you control gain trample and get +X/+0 until end of turn',
    'creatures your opponents control gain defender until end of turn',
    // Issue 347: a creature type and a land type.
    'Treefolk and Forests you control gain indestructible until end of turn',
  ],
  rejects: [
    'creatures you control gains flying until end of turn',
    'creatures you control gain flying',
    'creatures you control gain flying until your next turn',
    'other creatures you control gain flying until end of turn',
    'each creature gains flying until end of turn',
    'target creatures gain flying until end of turn',
    'creatures you control get +1/+1 until end of turn',
    'target creature gains flying until end of turn',
  ],
  parse: gainParser(
    'effect.gain-keyword-all',
    [
      'noun.plain-permanents',
      'noun.all-permanents',
      'noun.creature-land-pair',
      'noun.token-permanents',
    ],
    true,
  ),
});

/**
 * `effect.gain-keyword-those`: "those creatures gain vigilance until end of turn" (issue 160, D-627, CR 611.2a, 611.2c, 613.1f): the group an instruction before it named ("Put a
 * +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn."), gaining keywords. The group is the one the text named, as the lowering reads it.
 */
export const EFFECT_GAIN_KEYWORD_THOSE = defineRule<Clauses>({
  id: 'effect.gain-keyword-those',
  family: 'effect',
  leading: ['those'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'those creatures gain vigilance until end of turn',
    'those creatures gain flying and trample until end of turn',
  ],
  rejects: [
    'those creatures gains vigilance until end of turn',
    'those creatures gain vigilance',
    'those creatures gain vigilance until your next turn',
    'those cards gain vigilance until end of turn',
    'those creatures get +1/+1 until end of turn',
  ],
  parse: gainParser('effect.gain-keyword-those', ['noun.those-creatures'], true),
});

/**
 * `effect.gain-keyword-each`: "each creature you control with power 4 or greater gets +1/+1 and gains trample until
 * end of turn", "each creature gains flying until end of turn" (stage P29, CR 611.2a, 611.2c, 613.1f, 613.4c): every
 * permanent that matches as the effect resolves, in the singular of "each". The same continuous effects as
 * `effect.pump-each` (which reads the pump alone) with keywords.
 */
export const EFFECT_GAIN_KEYWORD_EACH = defineRule<Clauses>({
  id: 'effect.gain-keyword-each',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
  ],
  examples: [
    'each creature you control with power 4 or greater gets +1/+1 and gains trample until end of turn',
    'each creature gains flying until end of turn',
    'each creature you control gains haste until end of turn',
    'each Zombie you control gets +2/+2 and gains menace until end of turn',
  ],
  rejects: [
    'each creature gain flying until end of turn',
    'each creature gains flying',
    'each creature gets +1/+1 until end of turn',
    'each creature gains flash until end of turn',
    'each creature you control gains flying until your next turn',
    'creatures you control gain flying until end of turn',
    'all creatures gain flying until end of turn',
  ],
  parse: gainParser('effect.gain-keyword-each', ['noun.each-permanent'], false),
});

/** What follows the subject of a sentence that starts with its duration: a pump, keywords, or both in either order. */
interface LeadTail {
  readonly pt: IrPtChange | null;
  readonly gains: { readonly value: readonly string[]; readonly span: Span } | null;
  /** "... gets +1/+0 for each card you've drawn this turn" (Feather deck group 1, D-450): the count the pump is for, when the pump ends the sentence. */
  readonly count?: IrAmount;
}

/** A pump and, when the text has one, the count it is for ("+1/+0 for each card you've drawn this turn"); an X as the step of a count is not read (PUMP_TAIL's rule). */
function counted(pt: Parser<IrPtChange>): Parser<[IrPtChange, IrAmount | null]> {
  return satisfy(
    sequence(pt, optional(FOR_EACH_TAIL, null)),
    ([change, count]) =>
      count === null || (typeof change.power === 'number' && typeof change.toughness === 'number'),
  );
}

function leadParser(rule: string, subjects: readonly string[], plural: boolean): Parser<Clauses> {
  const keywords = (verb: RegExp) =>
    spanned(map(sequence(pattern(verb), KEYWORD_WORDS), ([, words]): readonly string[] => words));
  const gets = plural ? / get / : / gets /;
  const andGets = plural ? / and get / : / and gets /;
  const gains = plural ? / gain / : / gains /;
  const andGains = plural ? / and gain / : / and gains /;
  const tail = choice<LeadTail>(
    // "get +1/+1 and gain trample"
    map(
      sequence(pattern(gets), ptChange(rule), keywords(andGains)),
      ([, pt, g]): LeadTail => ({ pt, gains: g }),
    ),
    // "gain trample and get +X/+X", "gains trample and gets +1/+0 for each card you've drawn this turn"
    map(
      sequence(keywords(gains), pattern(andGets), counted(ptChange(rule))),
      ([g, , [pt, count]]): LeadTail => ({ pt, gains: g, ...(count === null ? {} : { count }) }),
    ),
    map(keywords(gains), (g): LeadTail => ({ pt: null, gains: g })),
    map(
      sequence(pattern(gets), counted(ptChange(rule))),
      ([, [pt, count]]): LeadTail => ({
        pt,
        gains: null,
        ...(count === null ? {} : { count }),
      }),
    ),
  );
  return map(
    sequence(
      family<IrDuration>('duration'),
      literal(', '),
      family<IrNoun>('noun', { only: subjects }),
      tail,
    ),
    ([duration, , subject, { pt, gains: grants, count }]): Clauses => {
      const out: IrClause[] = [];
      // The clauses are in the order of the words: the keywords first when the text says "gain ... and get ...".
      const grantsFirst = grants !== null && pt !== null && grants.span.start < pt.span.start;
      const pump = (more: boolean): void => {
        if (pt === null) return;
        const clause = makeClause(
          rule,
          'modifyPt',
          count === undefined ? { objects: subject, pt } : { objects: subject, pt, count },
          pt.span,
        );
        out.push({ ...clause, duration, ...(more ? { connector: 'and' as const } : {}) });
      };
      const grant = (more: boolean): void => {
        if (grants === null) return;
        grants.value.forEach((name, i) => {
          const keyword: IrKeywordArg = { kind: 'keywordName', name, span: grants.span, rule };
          const clause = makeClause(
            rule,
            'grantKeyword',
            { objects: subject, keyword },
            grants.span,
          );
          const last = i === grants.value.length - 1;
          out.push({
            ...clause,
            duration,
            ...(!last || more ? { connector: 'and' as const } : {}),
          });
        });
      };
      if (grantsFirst) {
        grant(true);
        pump(false);
      } else {
        pump(grants !== null);
        grant(false);
      }
      return out;
    },
  );
}

/** A temporary ability grant, optionally preceded by a pump: "target creature gains \"When ~ dies, ...\"". */
const LEAD_GRANTED_ABILITY: Parser<Clauses> = (ctx, pos) => {
  const rule = 'effect.lead-granted-ability';
  const duration = family<IrDuration>('duration')(ctx, pos);
  if (!duration.ok) return duration;
  if (duration.value.scope !== 'untilEndOfTurn') return fail(ctx, pos);
  const comma = literal(', ')(ctx, duration.pos);
  if (!comma.ok) return comma;
  const subject = family<IrNoun>('noun', { only: ['noun.target-permanent'] })(ctx, comma.pos);
  if (!subject.ok) return subject;
  if (subject.value.filter.types?.includes('creature') !== true) return fail(ctx, comma.pos);

  let cursor = subject.pos;
  let pt: IrPtChange | null = null;
  const pumpVerb = literal(' gets ')(ctx, cursor);
  if (pumpVerb.ok) {
    const change = ptChange(rule)(ctx, pumpVerb.pos);
    if (!change.ok) return change;
    const andGain = literal(' and gains ')(ctx, change.pos);
    if (!andGain.ok) return andGain;
    pt = change.value;
    cursor = andGain.pos;
  } else {
    const gain = literal(' gains ')(ctx, cursor);
    if (!gain.ok) return gain;
    cursor = gain.pos;
  }
  const quoted = readQuotedAbility(ctx, cursor, { mana: false });
  if (!quoted.ok) return quoted;
  if (quoted.value.ability.kind !== 'triggered') return fail(ctx, cursor);

  const out: IrClause[] = [];
  if (pt !== null) {
    out.push({
      ...makeClause(rule, 'modifyPt', { objects: subject.value, pt }, pt.span),
      duration: duration.value,
      connector: 'and',
    });
  }
  out.push({
    ...makeClause(
      rule,
      'grantAbility',
      { objects: subject.value, ability: quoted.value },
      quoted.value.span,
    ),
    duration: duration.value,
  });
  return { ok: true, value: out, pos: quoted.pos };
};

export const EFFECT_LEAD_GRANTED_ABILITY = defineRule<Clauses>({
  id: 'effect.lead-granted-ability',
  family: 'effect',
  leading: ['until'],
  cites: ['CR 611.2a (Continuous Effects)', 'CR 613.1f (Interaction of Continuous Effects)'],
  examples: [
    'Until end of turn, target creature gains "When ~ dies, return it to the battlefield tapped under its owner\'s control."',
    'Until end of turn, target creature gets +2/+0 and gains "When ~ dies, return it to the battlefield tapped under its owner\'s control."',
  ],
  rejects: [
    'Until end of turn, target creature gains flying',
    'Until end of turn, creatures you control gain "When ~ dies, draw a card."',
  ],
  parse: LEAD_GRANTED_ABILITY,
});

/**
 * `effect.lead-gain`: "Until end of turn, target creature gets +2/+2 and gains first strike.", "Until end of turn, ~
 * gains trample.": the duration first, then one object that gets a pump, keywords, or both in either order (stage P28:
 * "gains trample and gets +X/+X"). The same continuous effects as `effect.gain-keyword` and `effect.pump`, said in the
 * other order of words (CR 611.2a, 613.1f, 613.4c).
 */
export const EFFECT_LEAD_GAIN = defineRule<Clauses>({
  id: 'effect.lead-gain',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
    'CR 514.2 (Cleanup Step)',
  ],
  examples: [
    'Until end of turn, target creature gains flying',
    'Until end of turn, ~ gains first strike and vigilance',
    'Until end of turn, target creature gets +2/+2 and gains first strike',
    'Until end of turn, target creature gains trample and gets +X/+X',
    'Until end of turn, ~ gets +1/+1',
    // Feather deck group 1 (D-450): the pump counts something, and ends the sentence.
    "Until end of turn, target creature gains trample and gets +1/+0 for each card you've drawn this turn",
    "Until end of turn, target creature gets +1/+0 for each card you've drawn this turn",
  ],
  rejects: [
    "Until end of turn, target creature gets +X/+0 for each card you've drawn this turn",
    'Until end of turn, target creature gets +1/+0 and gains trample for each creature you control',
    'Until end of turn, target creature gains trample and gets +1/+0 for each',
    'Until end of turn, target creature gains flying until end of turn',
    'Until your next turn, target creature gains flying',
    'Until end of turn target creature gains flying',
    'Until end of turn, target creature gain flying',
    'Until end of turn, target creatures gain flying',
    'Until end of turn, creatures you control gain flying',
    'Until end of turn, target creature gains flash',
    'Until end of turn, target creature gets +Y/+Y',
    'Until end of turn, target creature gains',
    'Until end of turn, target creature gains flying and gets +1/+1 and gains haste',
  ],
  parse: leadParser('effect.lead-gain', GAIN_SUBJECTS, false),
});

/**
 * `effect.lead-gain-all`: "Until end of turn, creatures you control gain trample and get +X/+X.": the duration first,
 * then a group that gets a pump, keywords, or both in either order (stage P28, CR 611.2c: which permanents it means is
 * fixed as the effect resolves).
 */
export const EFFECT_LEAD_GAIN_ALL = defineRule<Clauses>({
  id: 'effect.lead-gain-all',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
  ],
  examples: [
    'Until end of turn, creatures you control gain trample',
    'Until end of turn, creatures you control gain trample and get +X/+X',
    'Until end of turn, creatures you control get +1/+1 and gain haste',
    'Until end of turn, creatures you control get +2/+2',
    'Until end of turn, creatures your opponents control gain defender',
  ],
  rejects: [
    'Until end of turn, creatures you control gains trample',
    'Until end of turn, creatures you control gain trample until end of turn',
    'Until end of turn, creatures you control',
    'Until end of turn, other creatures you control gain trample',
    'Until end of turn, target creature gains trample',
    'creatures you control gain trample and get +X/+X',
  ],
  parse: leadParser('effect.lead-gain-all', ['noun.plain-permanents'], true),
});

export const GAIN_RULES = [
  EFFECT_GAIN_KEYWORD,
  EFFECT_GAIN_KEYWORD_ALL,
  EFFECT_GAIN_KEYWORD_EACH,
  EFFECT_GAIN_KEYWORD_THOSE,
  EFFECT_LEAD_GRANTED_ABILITY,
  EFFECT_LEAD_GAIN,
  EFFECT_LEAD_GAIN_ALL,
];
