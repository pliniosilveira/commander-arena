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
import type { IrRestrictionKind, IrStaticEffect } from '../../ir/types';
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

export function restrictionPhrase(subject: RestrictionSubject): Parser<IrStaticEffect> {
  const common = [
    // D-407 (CR 508.1a): "can't attack", said of the permanent an Aura or Equipment is attached to ("can't attack or block" is `restrictionEffects`).
    ...(subject === 'attached' ? [phrase("can['’]t attack", 'cantAttack')] : []),
    // Before the plain "can't be blocked", whose words are a prefix of these (stage P29, D-133, CR 509.1b).
    phrase("can['’]t be blocked by more than one creature", 'cantBeBlockedByMoreThanOne'),
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
 * own static ability of the engine). Said only of the permanent an Aura or Equipment is attached to.
 */
export function restrictionEffects(subject: RestrictionSubject): Parser<readonly IrStaticEffect[]> {
  const single = map(restrictionPhrase(subject), (effect): readonly IrStaticEffect[] => [effect]);
  if (subject !== 'attached') return single;
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
export const AND_RESTRICTION = /\sand (?=can['’]t |attacks? |doesn['’]t )/i;
