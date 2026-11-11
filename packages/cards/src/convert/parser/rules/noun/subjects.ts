/**
 * Noun rules for the subject of a static ability (CR 604.1, 611.3): the permanent an Aura or
 * Equipment is attached to ("enchanted creature", "equipped creature"), and groups of permanents
 * that are not the source ("other creatures you control", "other Elves you control"). A group
 * without "other" ("creatures you control") is `noun.plain-permanents`. None of these says where
 * to look: the static ability applies to whatever matches at any moment (CR 611.3a).
 */
import { BASIC_LAND_TYPES } from '@commander-arena/engine';
import { choice, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { BOUNDARY, permanentPhrase } from './phrases';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

function bare(det: IrNoun['det'], filter: IrFilter, extra: Partial<Bare> = {}): Bare {
  return { kind: 'noun', det, filter, upTo: false, plural: false, other: false, ...extra };
}

/** What the attached-permanent rule reads: the determiner, the host's types and supertypes. */
interface AttachedWords {
  readonly det: 'enchanted' | 'equipped';
  readonly types: string[];
  readonly supertypes: string[];
  readonly raw: string;
}

/** An optional supertype word before the type ("enchanted legendary creature", CR 205.4). */
const SUPERTYPE = '(?:(legendary|basic|snow) )?';

function supertypeOf(word: string | undefined): string[] {
  return word === undefined ? [] : [word.toLowerCase()];
}

/**
 * `noun.attached-permanent`: "enchanted creature", "enchanted land", "enchanted permanent" and
 * "equipped creature": the permanent the Aura or Equipment is attached to (CR 303.4b, 301.5a). An
 * Equipment is attached only to a creature (CR 301.5), so only "equipped creature" is read; an
 * Aura says what it enchants. The word is the type the host must have (the engine's `attached`
 * subject checks it), so "enchanted creature" on an `Enchant permanent` Aura gives a land
 * nothing; a supertype before it ("enchanted legendary creature") is one more thing the host must
 * have. Other modifiers are not read.
 */
export const NOUN_ATTACHED_PERMANENT = defineRule<IrNoun>({
  id: 'noun.attached-permanent',
  family: 'noun',
  leading: ['enchanted', 'equipped'],
  cites: [
    'CR 303.4b (Enchantments)',
    'CR 301.5a (Artifacts)',
    'CR 604.4 (Handling Static Abilities)',
    'CR 205.4 (Supertypes)',
  ],
  examples: [
    'enchanted creature',
    'enchanted land',
    'enchanted permanent',
    'equipped creature',
    'enchanted legendary creature',
    'enchanted basic land',
    'equipped legendary creature',
  ],
  rejects: [
    'enchanted',
    'equipped',
    'equipped land',
    'equipped permanent',
    'enchanted creatures',
    'enchanted Forest',
    'enchanted creature you control',
    'target enchanted creature',
    'enchanted legendary',
    'enchanted legendary creatures',
    'equipped legendary land',
    'enchanted nonbasic land',
  ],
  parse: node<AttachedWords, IrNoun>(
    'noun.attached-permanent',
    choice<AttachedWords>(
      map(pattern(new RegExp(`enchanted ${SUPERTYPE}(creature|land)${BOUNDARY}`, 'iu')), (m) => ({
        det: 'enchanted' as const,
        types: [(m[2] ?? '').toLowerCase()],
        supertypes: supertypeOf(m[1]),
        raw: m[0],
      })),
      map(pattern(new RegExp(`enchanted ${SUPERTYPE}permanent${BOUNDARY}`, 'iu')), (m) => ({
        det: 'enchanted' as const,
        types: [],
        supertypes: supertypeOf(m[1]),
        raw: m[0],
      })),
      map(pattern(new RegExp(`equipped ${SUPERTYPE}creature${BOUNDARY}`, 'iu')), (m) => ({
        det: 'equipped' as const,
        types: ['creature'],
        supertypes: supertypeOf(m[1]),
        raw: m[0],
      })),
    ),
    ({ det, types, supertypes, raw }) =>
      bare(det, {
        ...(types.length > 0 ? { types } : {}),
        ...(supertypes.length > 0 ? { supertypes } : {}),
        raw,
      }),
  ),
});

/**
 * `noun.other-permanents`: "other creatures you control", "other artifact creatures you control",
 * "other permanents you control": every permanent that matches but the source itself (CR 611.3a).
 * The plural is what makes a group; "other creature" and "all other creatures" are not read.
 */
export const NOUN_OTHER_PERMANENTS = defineRule<IrNoun>({
  id: 'noun.other-permanents',
  family: 'noun',
  leading: ['other'],
  cites: ['CR 110.1 (Permanents)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    'other creatures you control',
    'other artifact creatures you control',
    'other permanents you control',
    'other nonland permanents you control',
    'other creatures your opponents control',
  ],
  rejects: [
    'other',
    'other creature you control',
    'other Elves you control',
    'all other creatures you control',
    'creatures you control',
    'another creature you control',
  ],
  parse: node<IrFilter, IrNoun>(
    'noun.other-permanents',
    map(sequence(literal('other '), permanentPhrase(true)), ([, filter]) => filter),
    (filter) => bare('each', filter, { plural: true, other: true }),
  ),
});

/**
 * `noun.other-subtype-permanents`: "other Elves you control", "other Elf creatures you control", "other Zombie
 * creatures", "other Merfolk you control", "other Wolves": the permanents of a creature type that are not the source
 * (CR 205.3m, 611.3a). After "other" a capitalized word can only be a subtype (types are lowercase in Oracle text),
 * and the table of CR 205.3m says which, in the singular, the plural of its ending or an irregular plural, a type
 * that is its own plural, or a type of two words ("Time Lords"): one rule for every type, none for a type
 * (stage P29, D-134). At the start of a line a capitalized word is not known to be a subtype, so "Elves you control"
 * with no "other" is `noun.plain-permanents`' business. "Elf creatures" are creatures; "Elves" are any permanent with
 * the type. With no controller the group is every player's ("Other Zombie creatures get +1/+1" reads the
 * opponents' too, as the words say).
 */
export const NOUN_OTHER_SUBTYPE_PERMANENTS = defineRule<IrNoun>({
  id: 'noun.other-subtype-permanents',
  family: 'noun',
  leading: ['other'],
  cites: ['CR 205.3m (Subtypes)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    'other Elves you control',
    'other Elf creatures you control',
    'other Zombies you control',
    'other Wolves your opponents control',
    'other Zombie creatures',
    'other Merfolk you control',
    'other Time Lords you control',
    'other nontoken Zombies you control',
    'other non-Zombie Wizards you control',
    'other Mice you control',
  ],
  rejects: [
    'other elves you control',
    'other Elf you control creatures',
    'other Creatures you control',
    'other Tokens you control',
    'other Elvs you control',
    'Elves you control',
    'other creatures you control',
    'other Zombie',
    'other Zombie creature you control',
  ],
  parse: node<IrFilter, IrNoun>(
    'noun.other-subtype-permanents',
    satisfy(
      map(sequence(literal('other '), permanentPhrase(true, 'all')), ([, filter]) => filter),
      (filter) => (filter.subtypes?.length ?? 0) > 0,
    ),
    (filter) => bare('each', filter, { plural: true, other: true }),
  ),
});

/**
 * `noun.subtype-union`: "Skeletons you control and other Zombies you control", "Zombies you control and Skeletons you
 * control": two groups of permanents of a creature type, one set (the permanents of either group, CR 611.3a), where the
 * second may leave the source out ("and other"). The engine's `anyOf` of two filters, each with its own controller and
 * `other` (stage P29, D-133). Each group is a plural subtype phrase of the table of CR 205.3m, so no type is named
 * here; a group that is not about a subtype ("creatures you control and other Zombies you control") is not read.
 */
export const NOUN_SUBTYPE_UNION = defineRule<IrNoun>({
  id: 'noun.subtype-union',
  family: 'noun',
  leading: [],
  cites: ['CR 205.3m (Subtypes)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    'Skeletons you control and other Zombies you control',
    'Zombies you control and Skeletons you control',
    'Elves you control and other Wolves you control',
    'Time Lords you control and other Mice you control',
  ],
  rejects: [
    'Skeletons you control',
    'Skeletons you control and other Zombies',
    'Skeletons you control and other creatures you control',
    'creatures you control and other Zombies you control',
    'Skeletons you control and Zombies',
    'Skeletons you control or other Zombies you control',
    'Skeletons you control and other Zombies you control and other Elves you control',
  ],
  parse: (ctx, pos) => {
    const group = satisfy(
      permanentPhrase(true, 'all'),
      (filter) => (filter.subtypes?.length ?? 0) > 0 && filter.controller !== undefined,
    );
    const r = sequence(group, choice(literal(' and other '), literal(' and ')), group)(ctx, pos);
    if (!r.ok) return r;
    const [first, joint, second] = r.value;
    const raw = ctx.text.slice(pos, r.pos);
    const members: IrFilter[] = [
      first,
      joint === ' and other ' ? { ...second, other: true } : second,
    ];
    return {
      ok: true,
      value: {
        ...bare('each', { zone: 'battlefield', anyOf: members, raw }, { plural: true }),
        span: { start: pos, end: r.pos },
        rule: 'noun.subtype-union',
      },
      pos: r.pos,
    };
  },
});

/**
 * `noun.bare-permanent`: "creature", "creature you control", "land", "permanent", "artifact or
 * creature": a singular permanent phrase with no determiner, what `Enchant` names (CR 702.5a). It
 * is a description of what may be enchanted, not a choice made now, so it is `a`; it never reads
 * a target. Modifiers and a controller suffix are those of every permanent phrase.
 */
export const NOUN_BARE_PERMANENT = defineRule<IrNoun>({
  id: 'noun.bare-permanent',
  family: 'noun',
  leading: [],
  cites: ['CR 110.1 (Permanents)', 'CR 702.5a (Enchant)'],
  examples: [
    'creature',
    'creature you control',
    'land',
    'permanent',
    'artifact or creature',
    'creature or planeswalker you control',
    'artifact, creature, or land',
    'nonland permanent',
    'creature an opponent controls',
  ],
  rejects: [
    'creatures',
    'creature or',
    'creature, land',
    'player',
    'Forest',
    'creature card in a graveyard',
    'target creature',
    'a creature',
    'creature or creature',
  ],
  parse: node<IrFilter, IrNoun>('noun.bare-permanent', permanentPhrase(false), (filter) =>
    bare('a', filter),
  ),
});

/**
 * `noun.bare-land-type`: "Forest", "Island": a basic land type with no determiner, what "Enchant
 * Forest" names (CR 702.5a). A basic land type is a subtype (CR 205.3i), so the permanent need only
 * have it, as a Breeding Pool is an Island (CR 305.6). Capitalized, as subtypes are written; a
 * plural, a list ("Forest or Plains") and a creature type are not read.
 */
export const NOUN_BARE_LAND_TYPE = defineRule<IrNoun>({
  id: 'noun.bare-land-type',
  family: 'noun',
  leading: ['plains', 'island', 'swamp', 'mountain', 'forest'],
  cites: ['CR 205.3i (Subtypes)', 'CR 305.6 (Lands)', 'CR 702.5a (Enchant)'],
  examples: ['Forest', 'Island', 'Plains', 'Swamp', 'Mountain'],
  rejects: [
    'forest',
    'Forests',
    'Forest or Plains',
    'Dragon',
    'land',
    'Forest you control',
    'Wastes',
  ],
  parse: node<string, IrNoun>(
    'noun.bare-land-type',
    map(
      pattern(new RegExp(`(${Object.keys(BASIC_LAND_TYPES).join('|')})${BOUNDARY}`, 'u')),
      (m) => m[1] ?? '',
    ),
    (type) => bare('a', { subtypes: [type], raw: type }),
  ),
});

export const SUBJECT_NOUN_RULES = [
  NOUN_ATTACHED_PERMANENT,
  NOUN_OTHER_PERMANENTS,
  NOUN_OTHER_SUBTYPE_PERMANENTS,
  NOUN_BARE_PERMANENT,
  NOUN_BARE_LAND_TYPE,
];
