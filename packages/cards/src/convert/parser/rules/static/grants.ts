/**
 * Static abilities that say what a permanent, or a group of permanents, gets and has (CR 604.1,
 * 611.3, 613): "Enchanted creature gets +2/+2.", "Equipped creature has flying and trample.",
 * "Other creatures you control get +1/+1 and have vigilance." One statement is one subject and what
 * it gets or has; each thing it gets or has is one effect of the IR, and lowering makes one engine
 * ability of each. The words are the Oracle ones: a singular subject "gets" and "has", a plural one
 * "get" and "have", and the sentence ends at its period, so "until end of turn" (a duration, which a
 * static ability never has: CR 611.2a is for a resolving effect) is not read.
 */
import {
  choice,
  fail,
  literal,
  many,
  map,
  type Parser,
  pattern,
  quiet,
  satisfy,
  separatedBy1,
  sequence,
} from '../../combinators';
import type { IrClause, IrCost, IrNoun, IrStatic, IrStaticEffect } from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import {
  PROTECTION_CARD_TYPES,
  PROTECTION_COLORS,
  PROTECTION_OUTSIDE_COMMANDER_IDENTITY,
} from '../keyword/protection';
import { SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, family } from '../registry';
import { QUOTED_ABILITY } from './quoted';
import { AND_RESTRICTION, type RestrictionSubject, restrictionPhrase } from './restriction-words';

type Effects = readonly IrStaticEffect[];

/** "+2/+2", "-1/-1", "+3/-1": a change of power and toughness (CR 613.4c), never "+X/+X". */
const PT: Parser<IrStaticEffect> = map(
  pattern(/([+-]\d+)\/([+-]\d+)(?![\p{L}\p{N}/])/u),
  (m): IrStaticEffect => ({ kind: 'pt', power: Number(m[1]), toughness: Number(m[2]) }),
);

const PERIOD = pattern(/\./);

/** "flying", "first strike and trample", ...: the keywords of a grant, one effect each. */
const KEYWORD_LIST: Parser<Effects> = map(
  KEYWORD_WORDS,
  (words): Effects => words.map((keyword): IrStaticEffect => ({ kind: 'grantKeyword', keyword })),
);

/**
 * `"{T}: Add {G}."`: a granted mana ability in quotes (stage P14, CR 605.1a, 613.1f): costs, a colon
 * and "Add ..." with its period inside the quotes. It is read as an activated ability of the IR
 * (costs and a body of one clause), which the lowering turns into the engine's mana ability, the only
 * kind a static ability can give. The same phrase rules as the ability's own text read each part.
 */
const QUOTED_MANA: Parser<Effects> = (ctx, pos) => {
  const r = sequence(
    pattern(/["“]/u),
    separatedBy1(family<IrCost>('cost'), literal(', ')),
    literal(': '),
    family<readonly IrClause[]>('effect', { only: ['effect.add-mana'] }),
    literal('.'),
    pattern(/["”]/u),
  )(ctx, pos);
  if (!r.ok) return r;
  // The normalizer writes both "this land" and the card's own name as `~`, so inside the quotes `~` is the granted permanent or the card that
  // grants ("Sacrifice ~"). Stage P36 (D-178): it is read as the permanent that has the ability, and the lowering refuses a group when the
  // card names itself inside a quotation, where `~` could be the card (`LowerContext.namedInQuotes`).
  const [, costs, , clauses] = r.value;
  const span = { start: pos + 1, end: r.pos - 1 };
  const sentence = { kind: 'sentence' as const, clauses, span, rule: 'body.sentence' };
  const ability = {
    kind: 'activated' as const,
    costs,
    body: { kind: 'body' as const, sentences: [sentence], span, rule: 'body' },
    restrictions: [],
    span,
    rule: 'ability.activated',
  };
  const quoted = { kind: 'quoted' as const, ability, span, rule: 'static.quoted-ability' };
  return { ok: true, value: [{ kind: 'grantAbility', ability: quoted }], pos: r.pos };
};

/** `"Sacrifice ~: Draw a card."`: any other granted ability in quotes, kept as its text (not read). */
const QUOTED: Parser<Effects> = map(
  pattern(/(?:"[^"]+"|“[^”]+”)/u),
  (m): Effects => [{ kind: 'grantQuoted', text: m[0].slice(1, -1) }],
);

/** "base power and toughness 5/3" (stage P31, D-140, CR 613.4b): what the subject's power and toughness are set to. */
const BASE_PT: Parser<Effects> = map(
  pattern(/base power and toughness (\d+)\/(\d+)(?![\p{L}\p{N}/])/iu),
  (m): Effects => [{ kind: 'basePt', power: Number(m[1]), toughness: Number(m[2]) }],
);

/**
 * "protection from red and from blue", "protection from each color that's not in your commander's color identity" (stage P70, D-259, CR 702.16, 903.4):
 * one protection a static ability gives, with the colors it names or the colors outside the commander's color identity.
 */
const PROTECTION: Parser<Effects> = choice(
  map(
    PROTECTION_OUTSIDE_COMMANDER_IDENTITY,
    (): Effects => [{ kind: 'grantProtection', commanderIdentity: true }],
  ),
  map(
    (ctx, pos) => PROTECTION_COLORS(ctx, pos),
    (colors): Effects => [{ kind: 'grantProtection', colors }],
  ),
  // D-402 (Danitha group 1b, CR 702.16a): "protection from creatures".
  map(
    (ctx, pos) => PROTECTION_CARD_TYPES(ctx, pos),
    (cardTypes): Effects => [{ kind: 'grantProtection', cardTypes }],
  ),
);

/** What a subject has: keywords it can be granted, one ability in quotes, a protection (stage P70) or (stage P31) a base power and toughness. */
const HAS_WHAT: Parser<Effects> = choice(
  QUOTED_MANA,
  QUOTED_ABILITY,
  QUOTED,
  BASE_PT,
  PROTECTION,
  KEYWORD_LIST,
);

/**
 * "are Juggernauts in addition to their other creature types" (stage P31, D-140, CR 205.1b, 613.1d): one creature type of the table, in
 * the plural, that a group has as well as its own. Stage P33 (D-150): "is an Angel in addition to its other types", the singular of the
 * same, said of a permanent an Aura or an Equipment is attached to.
 */
function areTypes(plural: boolean): Parser<Effects> {
  const typeEffect = (word: { subtype: string }): Effects => [
    { kind: 'addTypes', subtypes: [word.subtype] },
  ];
  if (plural) {
    return map(
      sequence(
        literal('are '),
        satisfy(SUBTYPE_WORD_NUMBERED, (w) => w.plural !== false),
        pattern(/ in addition to their other (?:creature )?types(?![\p{L}\p{N}])/iu),
      ),
      ([, word]) => typeEffect(word),
    );
  }
  return map(
    sequence(
      literal('is '),
      pattern(/an? /iu),
      satisfy(SUBTYPE_WORD_NUMBERED, (w) => w.plural !== true),
      pattern(/ in addition to its other (?:creature )?types(?![\p{L}\p{N}])/iu),
    ),
    ([, , word]) => typeEffect(word),
  );
}

/**
 * "gets +1/+1", "gets +1/+1 and has flying", "has flying and trample", "can't be blocked", "can't
 * be blocked and has shroud", with the verb forms of an attached permanent (singular) or a group
 * (plural), or `~` (only restrictions). Each thing the subject gets, has or can't do is one effect. A restriction and a grant
 * join with " and " in either order; the engine runs each as its own static ability.
 */
function predicate(mode: RestrictionSubject): Parser<Effects> {
  const plural = mode === 'plural';
  const gets = plural ? 'get ' : 'gets ';
  const has = plural ? 'have ' : 'has ';
  const restriction = map(restrictionPhrase(mode), (effect): Effects => [effect]);
  // ", has flying and first strike, and is an Angel ...": the things a subject gets and has are joined by "and" or by commas.
  const andHas = map(
    sequence(pattern(new RegExp(`(?: and |, and |, )${has}`, 'i')), HAS_WHAT),
    ([, what]) => what,
  );
  const andRestriction = map(sequence(pattern(AND_RESTRICTION), restriction), ([, what]) => what);
  // "... and are Juggernauts in addition to their other creature types" (stage P31), "..., and is an Angel in addition to its other
  // types" (stage P33): said of a group (plural) or of the permanent an Aura or Equipment is attached to.
  const andAre =
    mode === 'self' || mode === 'selfGrant'
      ? (_ctx: Parameters<Parser<Effects>>[0], pos: number) => fail(_ctx, pos)
      : quiet(
          map(sequence(pattern(/(?: and |, and |, )/iu), areTypes(plural)), ([, what]) => what),
        );
  const more = map(
    many(choice(andHas, andRestriction, andAre)),
    (groups): Effects => groups.flat(),
  );
  const getsPt = map(
    sequence(pattern(new RegExp(gets, 'i')), PT, more),
    ([, pt, rest]): Effects => [pt, ...rest],
  );
  const hasWhat = map(
    sequence(pattern(new RegExp(has, 'i')), HAS_WHAT, more),
    ([, what, rest]): Effects => [...what, ...rest],
  );
  const restricted = map(
    sequence(restriction, more),
    ([first, rest]): Effects => [...first, ...rest],
  );
  // `~` itself says only what it can't or must do; what it gets or has is not a static ability of
  // this grammar's (a keyword line says it).
  const areTypesRead = map(
    sequence(areTypes(plural), more),
    ([first, rest]): Effects => [...first, ...rest],
  );
  // Stage P33: for a permanent an Aura or Equipment is attached to the same words are tried quietly, so a line about what it "is" that
  // `static.attached-becomes` reads keeps the diagnostics it had.
  const areTypesFirst = plural ? areTypesRead : quiet(areTypesRead);
  const body =
    mode === 'self'
      ? restricted
      : mode === 'selfGrant'
        ? choice(getsPt, hasWhat, restricted)
        : choice(getsPt, hasWhat, areTypesFirst, restricted);
  return map(sequence(pattern(/ /), body), ([, effects]) => effects);
}

/** A subject and what it gets or has: one statement without its period (stage P29: a condition may follow it). */
export interface StaticUnit {
  readonly noun: IrNoun;
  readonly effects: Effects;
}

/**
 * The words of one statement before its period: a subject noun rule from `only` and the predicate of `mode`. A statement
 * that says the same thing twice ("can't be blocked and can't be blocked") is not Oracle text.
 */
export function unit(only: readonly string[], mode: RestrictionSubject): Parser<StaticUnit> {
  const subject = quiet(family<IrNoun>('noun', { only }));
  const body = sequence(subject, predicate(mode));
  return (ctx, pos) => {
    const r = body(ctx, pos);
    if (!r.ok) return r;
    const [noun, effects] = r.value;
    const keys = effects.map((e) => JSON.stringify(e));
    if (keys.some((k, i) => keys.indexOf(k) !== i)) return fail(ctx, r.pos);
    return { ok: true, value: { noun, effects }, pos: r.pos };
  };
}

/** Whether the statement ends with a quoted ability, whose own period is inside the quote (Oracle text adds no second). */
export function endsInQuote(effects: Effects): boolean {
  const last = effects[effects.length - 1]?.kind;
  return last === 'grantQuoted' || last === 'grantAbility';
}

/**
 * One statement: a subject noun rule from `only`, the predicate, and the period. A statement
 * that ends in a quoted ability ends with the quote, whose own period is inside it (Oracle text
 * never adds a second one).
 */
export function statement(
  id: string,
  only: readonly string[],
  mode: RestrictionSubject,
): Parser<IrStatic> {
  const read = unit(only, mode);
  return (ctx, pos) => {
    const r = read(ctx, pos);
    if (!r.ok) return r;
    const { noun, effects } = r.value;
    const end = endsInQuote(effects) ? { ok: true as const, pos: r.pos } : PERIOD(ctx, r.pos);
    if (!end.ok) return end;
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: noun,
        effects,
        span: { start: pos, end: end.pos },
        rule: id,
      },
      pos: end.pos,
    };
  };
}

/**
 * `static.attached`: what an Aura or Equipment gives the permanent it is attached to (CR 604.4,
 * 303.4b, 301.5a): "Enchanted creature gets +2/+2.", "Equipped creature has hexproof and haste.",
 * "Enchanted creature gets +1/+1 and has vigilance.", "Equipped creature has "{T}: Add {G}."" (a
 * granted mana ability, stage P14; any other quoted ability is read as text and dropped whole by the
 * lowering) and "Equipped creature can't be blocked.". Not read: "can't attack or
 * block", "loses flying", "gets +X/+X", "for each", "as long as", ward and landwalk. Protection from colors, or from each color outside the commander's color identity
 * (stage P70, D-259), is read after "has".
 */
export const STATIC_ATTACHED = defineRule<IrStatic>({
  id: 'static.attached',
  family: 'static',
  leading: ['enchanted', 'equipped'],
  cites: [
    'CR 604.4 (Handling Static Abilities)',
    'CR 613.4c (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
  ],
  examples: [
    'Enchanted creature gets +2/+2.',
    'Equipped creature gets +1/-1.',
    'Enchanted creature gets -2/-2.',
    'Enchanted creature gets +0/+2 and has flying.',
    'Equipped creature gets +1/+1 and has first strike and trample.',
    'Equipped creature has hexproof.',
    'Equipped creature has flying, first strike, and vigilance.',
    'Enchanted land has hexproof.',
    'Enchanted permanent gets +1/+1.',
    'Equipped creature has "{T}: Add {G}."',
    "Equipped creature can't be blocked.",
    // Stage P33 (D-150): a creature type the permanent is in addition to its own.
    'Enchanted creature is an Angel in addition to its other types.',
    // Stage P70 (D-259, CR 702.16, 903.4): protection a static ability gives.
    'Enchanted creature has protection from red.',
    'Equipped creature gets +1/+1 and has protection from black and from green.',
    "Equipped creature gets +3/+3 and has protection from each color that's not in your commander's color identity.",
    'Enchanted creature gets +4/+4, has flying and first strike, and is an Angel in addition to its other types.',
    'Enchanted creature gets +2/+2, has flying, and is a Zombie in addition to its other types.',
  ],
  rejects: [
    'Enchanted creature gets +2/+2',
    'Enchanted creature get +2/+2.',
    'Enchanted creature gets +2/+2 until end of turn.',
    'Enchanted creature gets +X/+X.',
    'Enchanted creature gets +1/+1 for each creature you control.',
    'Enchanted creature has flash.',
    'Enchanted creature has ward {2}.',
    // Stage P70 (D-259): protection from a quality that is not a color, a list that is not Oracle's, and the identity wording changed.
    'Enchanted creature has protection from everything.',
    'Enchanted creature has protection from each color.',
    'Enchanted creature has protection from red and blue.',
    'Enchanted creature has protection from red and from red.',
    'Enchanted creature has protection from red',
    "Equipped creature has protection from each color that's not in their commander's color identity.",
    "Equipped creature has protection from each color that's in your commander's color identity.",
    'Enchanted creature has flying and flying.',
    'Enchanted creature is an Angel.',
    'Enchanted creature is Angel in addition to its other types.',
    'Enchanted creature is an Angels in addition to its other types.',
    'Enchanted creature is an Angel in addition to its other types and gets +1/+1.',
    'Enchanted creature has flying, first strike and vigilance.',
    'Enchanted creature loses flying.',
    "Enchanted creature can't attack or block.",
    'Enchanted creature gets +1/+1 and loses flying.',
    'Equipped land has hexproof.',
    'Equipped creature has "{T}: Add {G}.".',
    'Equipped creature has "{T}: Add {G}." and flying.',
    'Creatures you control get +1/+1.',
  ],
  parse: statement('static.attached', ['noun.attached-permanent'], 'attached'),
});

/**
 * `static.permanents`: what a group of permanents gets and has while the source is on the
 * battlefield (CR 611.3a): "Creatures you control get +1/+1.", "Other creatures you control have
 * vigilance.", "Creatures your opponents control get -1/-1.", "Other Elves you control get +1/+1."
 * The group is `noun.plain-permanents`, `noun.other-permanents`, `noun.other-subtype-permanents` or,
 * for every permanent of a kind whoever controls it (stage P15), `noun.all-permanents`: "All creatures
 * have haste.", "All Slivers have flying.".
 */
export const STATIC_PERMANENTS = defineRule<IrStatic>({
  id: 'static.permanents',
  family: 'static',
  leading: [],
  cites: [
    'CR 611.3a (Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
  ],
  examples: [
    'Creatures you control get +1/+1.',
    'Other creatures you control get +1/+1.',
    'Creatures you control have vigilance.',
    'Other creatures you control get +1/+1 and have flying.',
    'Other Elves you control get +1/+1.',
    'Creatures your opponents control get -1/-1.',
    'Legendary creatures you control get +1/+1.',
    'Elves you control get +1/+1.',
    'Plant creatures you control have haste.',
    'All creatures have haste.',
    'All Slivers have flying.',
    'Lands you control have "{T}: Add {G}."',
    'Other creatures you control have base power and toughness 5/3 and are Juggernauts in addition to their other creature types.',
    "Juggernauts you control can't be blocked by Walls.",
    'Creatures you control are Zombies in addition to their other creature types.',
    'Creature tokens you control have haste.',
    'Zombie tokens you control have hexproof and menace.',
    'Zombie tokens you control get +1/+1.',
  ],
  rejects: [
    'Zombie tokens you control have flash.',
    'Zombie token you control has haste.',
    'Treasure tokens you control have haste.',
    'Creatures you control gets +1/+1.',
    'Creatures you control get +1/+1',
    'Creatures you control get +1/+1 until end of turn.',
    'Creatures you control have flash.',
    'All creature have haste.',
    'Creatures you control have flying and flying.',
    'Creature tokens you control have flash.',
    'Other creature you control gets +1/+1.',
    'Elf you control gets +1/+1.',
    'Enchanted creature gets +1/+1.',
    'Creatures you control get +1/+1 and have trample until end of turn.',
    'Creatures you control are Zombie in addition to their other creature types.',
    'Creatures you control are Zombies.',
  ],
  parse: statement(
    'static.permanents',
    [
      'noun.plain-permanents',
      'noun.other-permanents',
      'noun.other-subtype-permanents',
      'noun.subtype-union',
      'noun.all-permanents',
      // Stage P64 (D-217): "Creature tokens you control have haste."
      'noun.token-permanents',
      // D-369: "Zombie tokens you control have hexproof and menace."
      'noun.subtype-token-permanents',
    ],
    'plural',
  ),
});

/**
 * `static.each`: what each permanent of a kind has or can't do, in the singular of "each" (stage P29, D-133, CR 611.3a, 509.1b):
 * "Each creature you control with power 4 or greater can't be blocked by more than one creature.", "Each creature you
 * control gets +1/+1." The set is whatever matches at any moment, as for a group in the plural (`static.permanents`).
 */
export const STATIC_EACH = defineRule<IrStatic>({
  id: 'static.each',
  family: 'static',
  leading: ['each'],
  cites: [
    'CR 611.3a (Continuous Effects)',
    'CR 509.1b (Declare Blockers Step)',
    'CR 613.4c (Interaction of Continuous Effects)',
  ],
  examples: [
    "Each creature you control with power 4 or greater can't be blocked by more than one creature.",
    "Each creature you control can't be blocked by more than one creature.",
    'Each creature you control gets +1/+1.',
    'Each Zombie you control has deathtouch.',
    'Each creature you control gets +1/+1 and has trample.',
  ],
  rejects: [
    "Each creature you control with power 4 or greater can't be blocked by more than one creature",
    "Each creature you control can't be blocked by more than two creatures.",
    'Each creature you control get +1/+1.',
    "Each creature you control can't be blocked by more than one creature until end of turn.",
    'Each creature gets +1/+1 until end of turn.',
    "Each creatures you control can't be blocked by more than one creature.",
  ],
  parse: statement('static.each', ['noun.each-permanent'], 'each'),
});

export const GRANT_STATIC_RULES = [STATIC_ATTACHED, STATIC_PERMANENTS, STATIC_EACH];
