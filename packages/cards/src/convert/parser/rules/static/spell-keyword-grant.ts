/**
 * Static rule of the Hatsune Miku deck (issue 145): "Creature spells you cast have demonstrate." (Silverquill Lecturer, CR 702.144a, 702.51a, 613.1f, 604.2).
 */
import { choice, fail, literal, map, optional, pattern, quiet, sequence } from '../../combinators';
import type { IrCost, IrFilter, IrNoun, IrStatic } from '../../ir/types';
import { CREATURE_TYPES } from '../noun/creature-types';
import { SUBTYPE_WORD } from '../noun/phrases';
import { defineRule, family } from '../registry';
import { SPELL, spellSubject } from './cost';

/** The parts of a spell's filter this rule keeps: what the spell is (types, subtypes, colors) and the words it was read from. */
const ALLOWED: ReadonlySet<string> = new Set([
  'raw',
  'types',
  'notTypes',
  'subtypes',
  'notSubtypes',
  'colors',
  'supertypes',
  'anyOf',
]);

/**
 * `static.spells-you-cast-have-keyword`: "Creature spells you cast have demonstrate." A static ability of a permanent that gives a keyword to the spells its controller casts that the
 * subject names, as they are cast (CR 702.144a: Demonstrate triggers when its spell is cast; CR 702.51a: Convoke applies while its spell is on the stack). The engine's
 * `grantKeywordToSpells`, for the keywords it reads from a spell as it is cast: Demonstrate, Convoke and Improvise (CR 702.126a). The subject is the same one the cost reductions of spells read ("Artifact spells",
 * "Creature spells", "Red creature spells", "Instant and sorcery spells"). Not read: spells of other players or of every player ("Creature spells have ...", "... your opponents cast"),
 * other qualities of the spell ("with flying", "with power 4 or greater"), other keywords, two keywords, a keyword with a cost, a duration, no period.
 */
export const STATIC_SPELLS_YOU_CAST_HAVE_KEYWORD = defineRule<IrStatic>({
  id: 'static.spells-you-cast-have-keyword',
  family: 'static',
  leading: [],
  cites: [
    'CR 702.144a (Demonstrate)',
    'CR 702.51a (Convoke)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 604.2 (Handling Static Abilities)',
  ],
  examples: [
    'Creature spells you cast have demonstrate.',
    'Creature spells you cast have convoke.',
    'Spells you cast have convoke.',
    'Nonartifact spells you cast have improvise.',
    'Noncreature spells you cast have demonstrate.',
    'Red creature spells you cast have convoke.',
    'Legendary creature spells you cast have convoke.',
    'Instant and sorcery spells you cast have demonstrate.',
  ],
  rejects: [
    'Creature spells you cast have demonstrate',
    'Creature spells have demonstrate.',
    'Creature spells your opponents cast have demonstrate.',
    'Creature spells you control have demonstrate.',
    'Creature spells you cast has demonstrate.',
    'Creature spells you cast have flying.',
    'Creature spells you cast have demonstrate and convoke.',
    'Creature spells you cast have demonstrate {1}.',
    'Creature spells you cast have demonstrate until end of turn.',
    'Creature cards in your hand have demonstrate.',
    'Creature spells you cast with flying have demonstrate.',
    'Creature spells you cast with power 4 or greater have demonstrate.',
    'Creature spells you cast of the chosen type have demonstrate.',
    'Creature spells you cast from your graveyard have demonstrate.',
    'Creature spell you cast has demonstrate.',
    'Historic spells you cast have convoke.',
    'Nonlegendary creature spells you cast have convoke.',
  ],
  parse: (ctx, pos) => {
    // The words up to the keyword decide whether this is the statement at all ("Creature spells you cast cost {1} less" never was): their failure is no trace in the diagnostics.
    const r = sequence(
      quiet(
        sequence(
          spellSubject(undefined, { supertypes: true }),
          literal(' you cast have '),
          choice(
            map(literal('demonstrate'), () => 'demonstrate' as const),
            map(literal('convoke'), () => 'convoke' as const),
            map(literal('improvise'), () => 'improvise' as const),
          ),
        ),
      ),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [[filter, , keyword]] = r.value;
    // The spells are named by what they are: types, colors and subtypes. A quality the engine's filter of a granted spell does not read is never dropped.
    if (!Object.keys(filter).every((k) => ALLOWED.has(k))) return fail(ctx, pos);
    const rule = 'static.spells-you-cast-have-keyword';
    const subject: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { ...filter, controller: 'you' },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: pos + filter.raw.length },
      rule,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'spellKeyword', keyword }],
        span: { start: pos, end: r.pos },
        rule,
      },
      pos: r.pos,
    };
  },
});

/**
 * `static.each-spell-you-cast-has-replicate`: "Each Sliver spell you cast has replicate. The replicate cost is equal to its mana cost." A static ability of a permanent that gives Replicate
 * to the spells its controller casts that the subject names (CR 702.56a), the cost being the mana cost of the spell (CR 118.9). The two sentences are one statement: the second says what
 * the first gives, in the words the card prints. The engine's `grantKeywordToSpells` with `replicateAtManaCost`. The subject is the same one the grant of Demonstrate reads, in the singular
 * ("Each Sliver spell", "Each creature spell"). Not read: spells of other players ("Each Sliver spell you don't control"), another cost, the first sentence alone, a quality of the spell.
 */
export const STATIC_EACH_SPELL_YOU_CAST_HAS_REPLICATE = defineRule<IrStatic>({
  id: 'static.each-spell-you-cast-has-replicate',
  family: 'static',
  leading: ['each'],
  cites: [
    'CR 702.56a (Replicate)',
    'CR 118.9 (Alternative Costs)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 604.2 (Handling Static Abilities)',
  ],
  examples: [
    'Each Sliver spell you cast has replicate. The replicate cost is equal to its mana cost.',
    'Each creature spell you cast has replicate. The replicate cost is equal to its mana cost.',
    'Each red creature spell you cast has replicate. The replicate cost is equal to its mana cost.',
  ],
  rejects: [
    'Each Sliver spell you cast has replicate.',
    'Each Sliver spell you cast has replicate. The replicate cost is equal to its mana cost',
    'Each Sliver spell you cast has replicate. The replicate cost is equal to {1}.',
    "Each Sliver spell you cast has replicate. The replicate cost is equal to that card's mana cost.",
    'Each Sliver spell has replicate. The replicate cost is equal to its mana cost.',
    'Each Sliver spell your opponents cast has replicate. The replicate cost is equal to its mana cost.',
    'Each Sliver spell you cast has demonstrate. The replicate cost is equal to its mana cost.',
    'Each Sliver spell you cast has replicate and flying. The replicate cost is equal to its mana cost.',
    'Each Sliver card in your hand has replicate. The replicate cost is equal to its mana cost.',
    'Each Sliver spell you cast with flying has replicate. The replicate cost is equal to its mana cost.',
    'Each Sliver spell you cast has replicate. The replicate cost is equal to its converted mana cost.',
    'Each Sliver spell you cast gains replicate until end of turn. The replicate cost is equal to its mana cost.',
  ],
  parse: (ctx, pos) => {
    // The words up to the keyword decide whether this is the statement at all ("Each opponent loses ..." never was): their failure is no trace in the diagnostics.
    const r = sequence(
      quiet(sequence(literal('each '), spellSubject(SPELL), literal(' you cast has replicate.'))),
      pattern(/ the replicate cost is equal to its mana cost\./iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [[, filter]] = r.value;
    if (!Object.keys(filter).every((k) => ALLOWED.has(k))) return fail(ctx, pos);
    const rule = 'static.each-spell-you-cast-has-replicate';
    const subject: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { ...filter, controller: 'you' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 5 + filter.raw.length },
      rule,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'spellKeyword', keyword: 'replicateAtManaCost' }],
        span: { start: pos, end: r.pos },
        rule,
      },
      pos: r.pos,
    };
  },
});

/** The card types a permanent spell can have (CR 110.4: a land is played, never cast): the spell is one of these. */
const PERMANENT_SPELL_TYPES = ['artifact', 'creature', 'enchantment', 'planeswalker', 'battle'];

/**
 * `static.permanent-spells-from-hand-gain-evoke`: "Elemental permanent spells you cast from your hand gain evoke {4} as you cast them." (Ashling, the Limitless; CR 702.74a, 118.9, 601.2b,
 * 613.1f): a static ability of a permanent that gives the permanent spells its controller casts from their hand, of the creature type the subject names (or of any, with no type), an evoke cost
 * as they are cast. The engine's `grantAlternativeCostToSpells`, which keeps the grant on the spell. The cost is a plain mana cost. Not read: spells of other players or of every player,
 * another zone, another alternative cost or keyword, a cost that is not mana or has an {X} or a hybrid symbol, a quality of the spell other than one creature type, no "as you cast them".
 */
export const STATIC_PERMANENT_SPELLS_FROM_HAND_GAIN_EVOKE = defineRule<IrStatic>({
  id: 'static.permanent-spells-from-hand-gain-evoke',
  family: 'static',
  leading: [],
  cites: [
    'CR 702.74a (Evoke)',
    'CR 118.9 (Alternative Costs)',
    'CR 601.2b (Casting Spells)',
    'CR 613.1f (Interaction of Continuous Effects)',
  ],
  examples: [
    'Elemental permanent spells you cast from your hand gain evoke {4} as you cast them.',
    'Elemental permanent spells you cast from your hand gain evoke {2}{R} as you cast them.',
    'Permanent spells you cast from your hand gain evoke {1} as you cast them.',
    'Goblin permanent spells you cast from your hand gain evoke {R} as you cast them.',
  ],
  rejects: [
    'Elemental permanent spells you cast from your hand gain evoke {4} as you cast them',
    'Elemental permanent spells you cast from your graveyard gain evoke {4} as you cast them.',
    'Elemental permanent spells you cast gain evoke {4} as you cast them.',
    'Elemental permanent spells your opponents cast from their hands gain evoke {4} as they cast them.',
    'Elemental permanent spells you cast from your hand gain flashback {4} as you cast them.',
    'Elemental permanent spells you cast from your hand gain evoke {X} as you cast them.',
    'Elemental permanent spells you cast from your hand gain evoke {W/U} as you cast them.',
    'Elemental permanent spells you cast from your hand gain evoke—Exile a card from your hand as you cast them.',
    'Elemental permanent spells you cast from your hand gain evoke {4} until end of turn.',
    'Elemental creature spells you cast from your hand gain evoke {4} as you cast them.',
    'Elemental permanent spells you cast from your hand gain evoke as you cast them.',
    'Elemental permanent spells you cast from your hand gain evoke {4} and flying as you cast them.',
    'Elemental permanent spells you cast from your hand with flying gain evoke {4} as you cast them.',
    'Red permanent spells you cast from your hand gain evoke {4} as you cast them.',
    'Elemental permanent spells you cast from your hand have evoke {4}.',
    'Each Elemental permanent spell you cast from your hand gains evoke {4} as you cast it.',
  ],
  parse: (ctx, pos) => {
    // The words up to the cost decide whether this is the statement at all: their failure is no trace in the diagnostics.
    const lead = sequence(
      quiet(
        sequence(
          optional(
            map(
              pattern(new RegExp(`(${SUBTYPE_WORD}) (?=permanent spells )`, 'u')),
              (m) => m[1] ?? '',
            ),
            undefined,
          ),
          literal('permanent spells you cast from your hand gain evoke '),
        ),
      ),
      family<IrCost>('cost', { only: ['cost.mana'] }),
      pattern(/ as you cast them\./iu),
    )(ctx, pos);
    if (!lead.ok) return lead;
    const [[creatureType], cost] = lead.value;
    // A mana cost with numbers and colored symbols only (an {X} or a hybrid symbol is another cost), and a word that is a creature type.
    if (cost.kind !== 'mana' || cost.symbols.some((symbol) => !/^(\d+|[WUBRGC])$/u.test(symbol))) {
      return fail(ctx, pos);
    }
    if (creatureType !== undefined && !CREATURE_TYPES.has(creatureType)) return fail(ctx, pos);
    const rule = 'static.permanent-spells-from-hand-gain-evoke';
    const length =
      (creatureType === undefined ? 0 : creatureType.length + 1) + 'permanent spells'.length;
    const raw = ctx.text.slice(pos, pos + length);
    const filter: IrFilter = {
      ...(creatureType === undefined ? {} : { subtypes: [creatureType] }),
      anyOf: PERMANENT_SPELL_TYPES.map((t): IrFilter => ({ types: [t], raw: t })),
      controller: 'you',
      raw,
    };
    const subject: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: pos + raw.length },
      rule,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'spellEvoke', cost }],
        span: { start: pos, end: lead.pos },
        rule,
      },
      pos: lead.pos,
    };
  },
});

export const SPELL_KEYWORD_GRANT_STATIC_RULES = [
  STATIC_SPELLS_YOU_CAST_HAVE_KEYWORD,
  STATIC_EACH_SPELL_YOU_CAST_HAS_REPLICATE,
  STATIC_PERMANENT_SPELLS_FROM_HAND_GAIN_EVOKE,
];
