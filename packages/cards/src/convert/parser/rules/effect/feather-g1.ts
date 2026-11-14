/**
 * Effect rules of the Feather deck's first group (issue 27): protection a spell gives for the turn (D-451, D-452) and "Until end of turn, double target creature's power
 * and it gains first strike." (D-457). The effects themselves are the engine's `grantKeyword` of a protection (`rules/protection-choice.ts` asks the color) and `modifyPt`
 * with the `affected` amount (D-145); only the words are new.
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  sequence,
} from '../../combinators';
import type { IrClause, IrDuration, IrFlag, IrKeywordArg, IrNoun, Span } from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { PROTECTION_COLORS } from '../keyword/protection';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';
import { GAIN_SUBJECTS } from './pump';

const GAIN_PROTECTION = 'effect.gain-protection';

/** What a protection granted for the turn is from: named colors, or the color the controller chooses as the effect resolves. */
const PROTECTION_QUALITY: Parser<NonNullable<IrKeywordArg['protection']>> = choice(
  map(
    pattern(/protection from the color of your choice(?![\p{L}\p{N}])/iu),
    (): NonNullable<IrKeywordArg['protection']> => ({ choice: 'color' }),
  ),
  map(PROTECTION_COLORS, (colors): NonNullable<IrKeywordArg['protection']> => ({ colors })),
);

/**
 * `effect.gain-protection`: "target creature you control gains protection from the color of your choice until end of turn", "target creature gains protection from red
 * until end of turn" (CR 702.16 Protection, 611.2a: a continuous effect of a resolving spell or ability, 613.1f: a layer 6 ability; CR 608.2d: the color of the controller's
 * choice is chosen as the effect resolves, not as the spell is cast). One object, one protection: "gains protection from red and from blue" is a protection of two colors
 * (CR 702.16g reads it as two). Not read: a group ("creatures you control gain ..."), a quality that is not a color ("from artifacts", "from the player of your choice",
 * "from everything"), another duration, and protection together with other keywords ("gains flying and protection from red").
 */
export const EFFECT_GAIN_PROTECTION = defineRule<Clauses>({
  id: GAIN_PROTECTION,
  family: 'effect',
  leading: ['~', 'target', 'another', 'it', 'enchanted', 'equipped', 'that'],
  cites: [
    'CR 702.16 (Protection)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 611.2a (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 514.2 (Cleanup Step)',
  ],
  examples: [
    'target creature you control gains protection from the color of your choice until end of turn',
    'target creature gains protection from red until end of turn',
    'target creature gains protection from red and from blue until end of turn',
    '~ gains protection from the color of your choice until end of turn',
    'it gains protection from the color of your choice until end of turn',
    'that creature also gains protection from green until end of turn',
  ],
  rejects: [
    'target creature you control gains protection from the color of your choice',
    'target creature you control gains protection from the color of your choice until your next turn',
    'target creature you control gains protection from the colors of your choice until end of turn',
    'target creature you control gains protection from a color of your choice until end of turn',
    'target creature you control gains protection from the color of your choice until end of turn and draw a card',
    'target creature gains protection from artifacts until end of turn',
    'target creature gains protection from the player of your choice until end of turn',
    'target creature gains protection from everything until end of turn',
    'target creature gains protection from until end of turn',
    'target creature gains flying and protection from red until end of turn',
    'target creature gain protection from red until end of turn',
    'target creatures gain protection from red until end of turn',
    'creatures you control gain protection from the color of your choice until end of turn',
    'target creature has protection from red until end of turn',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrNoun>('noun', { only: GAIN_SUBJECTS }),
      pattern(/ (?:also )?gains /),
      spanned(PROTECTION_QUALITY),
      literal(' '),
      family<IrDuration>('duration'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, , quality, , duration] = r.value;
    const keyword: IrKeywordArg = {
      kind: 'keywordName',
      name: 'protection',
      protection: quality.value,
      span: quality.span,
      rule: GAIN_PROTECTION,
    };
    const clause = makeClause(
      GAIN_PROTECTION,
      'grantKeyword',
      { objects: subject, keyword },
      quality.span,
    );
    return { ok: true, value: [{ ...clause, duration }], pos: r.pos };
  },
});

const LEAD_DOUBLE = 'effect.lead-double-pt';

/** What a doubling is of: "power and toughness", "power", "toughness". */
const STATS = choice(
  map(literal('power and toughness'), () => ({ power: true, toughness: true })),
  map(literal('power'), () => ({ power: true, toughness: false })),
  map(literal('toughness'), () => ({ power: false, toughness: true })),
);

function flag(value: boolean, span: Span): IrFlag {
  return { kind: 'flag', value, span, rule: LEAD_DOUBLE };
}

/**
 * `effect.lead-double-pt`: "Until end of turn, double target creature's power and it gains first strike." (CR 701.10 Double: the creature gets +X/+0 where X is its power
 * as the effect resolves, 611.2a, 611.2c, 613.1f): the duration first, then the doubling of one chosen creature's power, toughness or both, in the possessive, and, when the text
 * says it, the keywords the same creature gains ("it" is the creature the doubling names: one target, CR 115.1). The same continuous effects as `effect.double-pt` and
 * `effect.gain-keyword`, said in another order of words. Only a target: "double ~'s power" and a group stay with the rules that read them.
 */
export const EFFECT_LEAD_DOUBLE_PT = defineRule<Clauses>({
  id: LEAD_DOUBLE,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 701.10 (Double)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    "Until end of turn, double target creature's power and it gains first strike",
    "Until end of turn, double target creature's power",
    "Until end of turn, double target creature you control's power and it gains flying and trample",
    "Until end of turn, double target creature's power and toughness",
    'Until end of turn, double target creature’s power and it gains first strike',
  ],
  rejects: [
    "Until end of turn, double target creature's power and it gains first strike until end of turn",
    "Until end of turn double target creature's power and it gains first strike",
    "Until your next turn, double target creature's power and it gains first strike",
    "Until end of turn, double target creature's power and it gains",
    "Until end of turn, double target creature's power and it gains flash",
    "Until end of turn, double target creature's power and gains first strike",
    "Until end of turn, double target creature's power and that creature gains first strike",
    "Until end of turn, double target creatures' power and they gain first strike",
    "Until end of turn, double ~'s power and it gains first strike",
    "Until end of turn, double target creature's mana value and it gains first strike",
    'Until end of turn, double target creature power and it gains first strike',
    "Until end of turn, double target creature's power and it gains first strike and draw a card",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrDuration>('duration'),
      literal(', double '),
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      pattern(/['’]s /),
      spanned(STATS),
      optional(
        spanned(map(sequence(literal(' and it gains '), KEYWORD_WORDS), ([, k]) => k)),
        null,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [duration, , subject, , stats, gains] = r.value;
    if (subject.plural || subject.upTo || subject.count !== undefined) return fail(ctx, pos);
    const double = makeClause(
      LEAD_DOUBLE,
      'doublePt',
      {
        objects: subject,
        power: flag(stats.value.power, stats.span),
        toughness: flag(stats.value.toughness, stats.span),
      },
      stats.span,
    );
    const clauses: IrClause[] = [
      { ...double, duration, ...(gains === null ? {} : { connector: 'and' as const }) },
    ];
    if (gains !== null) {
      gains.value.forEach((name, i, all) => {
        const keyword: IrKeywordArg = {
          kind: 'keywordName',
          name,
          span: gains.span,
          rule: LEAD_DOUBLE,
        };
        const grant = makeClause(
          LEAD_DOUBLE,
          'grantKeyword',
          { objects: subject, keyword },
          gains.span,
        );
        clauses.push({
          ...grant,
          duration,
          ...(i < all.length - 1 ? { connector: 'and' as const } : {}),
        });
      });
    }
    return { ok: true, value: clauses, pos: r.pos };
  },
});

/** Quiet: a line these rules do not read ("gains storm until end of turn", "Until end of turn, target creature gets +1/+1") stops where it always did. */
export const FEATHER_G1_EFFECT_RULES = [
  quietly(EFFECT_GAIN_PROTECTION),
  quietly(EFFECT_LEAD_DOUBLE_PT),
];
