/**
 * The words of the restrictions a static ability can state about its subject (stage P12, D-094):
 * "can't block", "can't be blocked", "attacks each combat if able", "doesn't untap during ...",
 * "can't be countered". Shared by the statements of `grants.ts` (an attached permanent, a group)
 * and `restrictions.ts` (`~` itself), so each wording is read in one place. Which of them a subject
 * may say follows the engine's `restriction` effect (CR 509.1b, 508.1d, 502.3, 101.2): the words
 * are the ones Oracle text uses for that kind of subject, and a near miss ("can't be blocked except
 * by creatures with flying", "can't block unless ...") is none of them, so the statement stops there.
 */
import {
  choice,
  map,
  type Parser,
  pattern,
  quiet as quietly,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrFilter, IrRestrictionKind, IrStaticEffect } from '../../ir/types';
import { permanentPhrase, withoutZone } from '../noun/phrases';

/**
 * Whose restriction it is: `~`, the permanent an Aura or Equipment is attached to, or a group. Since stage P29 also `~` in a
 * statement that says what it gets or has as well (`selfGrant`: "~ gets +3/+3 as long as ..."), and each permanent of a
 * kind (`each`: "Each creature you control can't be blocked by more than one creature"): singular verbs, as `attached`.
 */
export type RestrictionSubject = 'self' | 'selfGrant' | 'attached' | 'plural' | 'each';

/** The end of a word: no letter, digit or apostrophe follows ("can't blockade" is not "can't block"). */
const END = "(?![\\p{L}\\p{N}'’])";

function phrase(re: string, restriction: IrRestrictionKind): Parser<IrStaticEffect> {
  return map(
    pattern(new RegExp(`${re}${END}`, 'iu')),
    (): IrStaticEffect => ({ kind: 'restriction', restriction }),
  );
}

/**
 * One restriction as a subject of this kind says it. A singular subject "attacks" and "doesn't
 * untap", a plural one "attack" and (not read) "don't untap". `~` says "during your untap step"
 * (it is the controller's own permanent); the permanent an Aura is attached to says "during its
 * controller's untap step" (CR 502.3: it is the untap step of the player who controls it). "Can't
 * be countered" is a spell's own ability (CR 113.6g), so only `~` says it.
 */
/**
 * "can't be blocked by Walls", "can't be blocked by creatures with power 2 or less" (stage P31, D-140, CR 509.1b): no creature of the
 * kind named can block the subject. The kind is a plural group with no controller of its own.
 */
const BLOCKED_BY: Parser<IrStaticEffect> = map(
  // Quiet: "can't be blocked by more than two creatures" stops where it always did.
  quietly(
    sequence(
      pattern(/can['’]t be blocked by /iu),
      satisfy(
        map(permanentPhrase(true, 'all'), withoutZone),
        (filter) => filter.controller === undefined,
      ),
    ),
  ),
  ([, blockers]): IrStaticEffect => ({ kind: 'cantBeBlockedBy', blockers }),
);

/**
 * "can't be blocked except by Slivers" (Shifting Sliver, CR 509.1b): no creature but those of the kind named can block the subject, which is the engine's `cantBeBlockedBy` of the
 * creatures that are not of that creature type (`notSubtypes`). Only a plural creature type, with no other quality and no controller: the complement of any other group (colors,
 * keywords, a controller) is not read.
 */
/** The "Spirits" of "except by Spirits": a plural creature type, as the creatures that can't block (the complement of the kind, `notSubtypes`). */
export const EXCEPT_BY_KIND: Parser<IrFilter> = map(
  quietly(
    satisfy(map(permanentPhrase(true, 'all'), withoutZone), (filter) => {
      const { raw: _raw, types, subtypes, ...rest } = filter;
      return (
        subtypes?.length === 1 &&
        (types === undefined || (types.length === 1 && types[0] === 'creature')) &&
        Object.values(rest).every((value) => value === undefined)
      );
    }),
  ),
  (kind): IrFilter => ({ notSubtypes: kind.subtypes ?? [], raw: kind.raw }),
);

const BLOCKED_EXCEPT_BY: Parser<IrStaticEffect> = map(
  quietly(sequence(pattern(/can['’]t be blocked except by /iu), EXCEPT_BY_KIND)),
  ([, blockers]): IrStaticEffect => ({ kind: 'cantBeBlockedBy', blockers }),
);

/**
 * "can't be blocked by creatures the monarch controls" (Azure Fleet Admiral, CR 509.1b, 725.1): no creature the monarch controls (as it is when the blockers are declared) can block
 * the subject, the engine's `cantBeBlockedBy` of the creatures with `controller: 'monarch'`. Only those words.
 */
const BLOCKED_BY_MONARCH: Parser<IrStaticEffect> = map(
  pattern(new RegExp(`can['’]t be blocked by creatures the monarch controls${END}`, 'iu')),
  (match): IrStaticEffect => ({
    kind: 'cantBeBlockedBy',
    blockers: {
      types: ['creature'],
      controller: 'monarch',
      raw: match[0].replace(/^can['’]t be blocked by /iu, ''),
    },
  }),
);

/**
 * "can't be blocked by creatures with greater power" (Locke, Treasure Hunter, CR 509.1b, 208.1): no creature whose power is greater than the power of the permanent with the
 * ability, as it is when blockers are declared, can block the subject (the engine's `cantBeBlockedBy` with `powerGreaterThanSource`). Only those words.
 */
const BLOCKED_BY_GREATER_POWER: Parser<IrStaticEffect> = map(
  pattern(new RegExp(`can['’]t be blocked by creatures with greater power${END}`, 'iu')),
  (match): IrStaticEffect => ({
    kind: 'cantBeBlockedBy',
    blockers: {
      types: ['creature'],
      powerGreaterThanSource: true,
      raw: match[0].replace(/^can['’]t be blocked by /iu, ''),
    },
  }),
);

/**
 * "can attack as though it didn't have defender" and "assigns combat damage equal to its toughness rather than its power" (CR 609.4, 702.3b, 510.1a): the two rule changes of a creature the engine
 * reads where attackers are declared and where combat damage is assigned. The pronoun agrees with the subject, singular ("it", "its", "assigns") or plural ("they", "their", "assign").
 */
function combatRuleWords(plural: boolean): Parser<IrStaticEffect>[] {
  const it = plural ? 'they' : 'it';
  const its = plural ? 'their' : 'its';
  return [
    phrase(`can attack as though ${it} didn['’]t have defender`, 'canAttackAsThoughNoDefender'),
    phrase(
      `${plural ? 'assign' : 'assigns'} combat damage equal to ${its} toughness rather than ${its} power`,
      'assignsDamageByToughness',
    ),
  ];
}

export function restrictionPhrase(subject: RestrictionSubject): Parser<IrStaticEffect> {
  const common = [
    // CR 609.4, 702.3b, 510.1a (Felothar, Assault Formation): what a group, "each creature" or `~` can do or assigns, in the words of its number. Not read of the permanent an Aura or Equipment is attached to.
    ...(subject === 'attached' ? [] : combatRuleWords(subject === 'plural')),
    // D-647 (CR 508.1a): "Inklings can't attack you or planeswalkers you control.", said of a group.
    ...(subject === 'plural' || subject === 'each'
      ? [
          map(
            pattern(new RegExp(`can['’]t attack you or planeswalkers you control${END}`, 'iu')),
            (): IrStaticEffect => ({ kind: 'cantAttackYou' }),
          ),
        ]
      : []),
    // CR 508.1a, 506.3 (Vow of Duty): "can't attack you or planeswalkers you control", said of the permanent an Aura or Equipment is attached to; before the plain "can't attack".
    ...(subject === 'attached'
      ? [
          map(
            pattern(new RegExp(`can['’]t attack you or planeswalkers you control${END}`, 'iu')),
            (): IrStaticEffect => ({ kind: 'cantAttackYou' }),
          ),
        ]
      : []),
    // D-407 (CR 508.1a): "can't attack", said of the permanent an Aura or Equipment is attached to ("can't attack or block" is `restrictionEffects`).
    // Lorwyn Eclipsed (Kulrath Knight, CR 508.1a): the same of a group, "Creatures your opponents control with counters on them can't attack or block."
    ...(subject === 'attached' || subject === 'plural'
      ? [phrase("can['’]t attack", 'cantAttack')]
      : []),
    // Issue 201 (Shiny Impetus, CR 701.15): "is goaded", said of the permanent an Aura is attached to.
    ...(subject === 'attached' ? [phrase('is goaded', 'goaded')] : []),
    // Before the plain "can't be blocked", whose words are a prefix of these (stage P29, D-133, CR 509.1b).
    phrase("can['’]t be blocked by more than one creature", 'cantBeBlockedByMoreThanOne'),
    BLOCKED_EXCEPT_BY,
    BLOCKED_BY_MONARCH,
    BLOCKED_BY_GREATER_POWER,
    BLOCKED_BY,
    phrase("can['’]t block", 'cantBlock'),
    phrase("can['’]t be blocked", 'cantBeBlocked'),
    phrase(
      subject === 'plural' ? 'attack each combat if able' : 'attacks each combat if able',
      'attacksEachCombat',
    ),
  ];
  if (subject === 'self' || subject === 'selfGrant') {
    return choice(
      ...common,
      // CR 609.4, 702.3b (Weathered Sentinels): the players the creature may attack as though it didn't have defender are those who attacked its controller during their last turn.
      phrase(
        "can attack players who attacked you during their last turn as though it didn['’]t have defender",
        'canAttackAsThoughNoDefenderVsLastTurnAttackers',
      ),
      // D-648 (Prismari deck group 2, CR 509.1b): "~ can block only creatures with flying", said of `~` itself.
      phrase('can block only creatures with flying', 'canBlockOnlyFlying'),
      // Ahoy Mateys deck, group 6 (Port Razer, CR 508.1a, 508.6): said of `~` itself.
      phrase(
        "can['’]t attack a player it has already attacked this turn",
        'cantAttackPlayersAlreadyAttacked',
      ),
      phrase("doesn['’]t untap during your untap step", 'doesntUntap'),
      phrase("can['’]t be countered", 'cantBeCountered'),
    );
  }
  if (subject === 'attached') {
    return choice(
      ...common,
      phrase("doesn['’]t untap during its controller['’]s untap step", 'doesntUntap'),
    );
  }
  // "Each creature you control can't be blocked ...": singular verbs, no untap step of its own.
  if (subject === 'each') return choice(...common);
  return choice(...common);
}

/**
 * The restrictions one phrase states: the one of `restrictionPhrase`, or both of "can't attack or block" (D-407, CR 508.1a, 509.1a: two restrictions, each its
 * own static ability of the engine). Said of the permanent an Aura or Equipment is attached to and of a group.
 */
export function restrictionEffects(subject: RestrictionSubject): Parser<readonly IrStaticEffect[]> {
  const single = map(restrictionPhrase(subject), (effect): readonly IrStaticEffect[] => [effect]);
  if (subject !== 'attached' && subject !== 'plural') return single;
  const both = map(
    pattern(new RegExp(`can['’]t attack or block${END}`, 'iu')),
    (): readonly IrStaticEffect[] => [
      { kind: 'restriction', restriction: 'cantAttack' },
      { kind: 'restriction', restriction: 'cantBlock' },
    ],
  );
  return choice(both, single);
}

/** What can follow " and " to start another restriction: a lookahead, so a failure stays at " and". */
export const AND_RESTRICTION =
  /\sand (?=can['’]t |attacks? |doesn['’]t |is goaded)|,\sand (?=can['’]t )/i;
