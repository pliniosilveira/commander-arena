/**
 * The vocabulary of a trigger condition: who or what triggers it. "~" is this permanent; "a
 * creature you control" and "another creature" are any object that matches, as it was when the
 * event happened (CR 603.10a for leaving events). A subject says what an object is, not where to
 * look, so its filter carries no zone.
 */
import { choice, literal, map, optional, type Parser, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun, Span } from '../../ir/types';
import { CONTROL_SUFFIX, permanentPhrase, withoutZone } from '../noun/phrases';
import { family, spanned } from '../registry';

/** A noun built by a trigger rule, carrying that rule's id. */
export function makeNoun(
  rule: string,
  span: Span,
  det: IrNoun['det'],
  filter: IrFilter,
  other = false,
): IrNoun {
  return { kind: 'noun', det, filter, upTo: false, plural: false, other, span, rule };
}

/** "a creature", "another creature you control", "an artifact": an object of a kind. */
export function objectSubject(rule: string): Parser<IrNoun> {
  return map(
    spanned(
      sequence(
        choice(
          literal('another '),
          map(pattern(/an? /i), (m) => m[0]),
        ),
        map(permanentPhrase(false, 'all'), withoutZone),
      ),
    ),
    ({ value: [lead, filter], span }) =>
      makeNoun(rule, span, 'a', filter, lead.toLowerCase().startsWith('another')),
  );
}

/**
 * "a commander you control", "another commander you control", "a commander", "your commander" (stage P33, D-150, CR 903.3): the object is
 * a card a player designated as a commander, wherever the event happens to it. "Your commander" is a commander its owner designated and
 * that owner is the controller of the ability, whoever controls it now (the engine's `commander: 'yours'`); the others are any commander,
 * of the controller named. A commander is no type: "commander creature" and the like are other nouns.
 */
export function commanderSubject(rule: string): Parser<IrNoun> {
  const yours = map(spanned(pattern(/your commander(?![\p{L}\p{N}])/iu)), ({ span }) =>
    makeNoun(rule, span, 'a', { commander: 'yours', raw: 'your commander' }),
  );
  const any = map(
    spanned(
      sequence(
        choice(
          literal('another '),
          map(pattern(/an? /i), (m) => m[0]),
        ),
        pattern(/commander(?![\p{L}\p{N}])/iu),
        optional(CONTROL_SUFFIX, undefined),
      ),
    ),
    ({ value: [lead, word, controller], span }) =>
      makeNoun(
        rule,
        span,
        'a',
        { commander: true, ...(controller === undefined ? {} : { controller }), raw: word[0] },
        lead.toLowerCase().startsWith('another'),
      ),
  );
  return choice(yours, any);
}

/** "~" or an article phrase: the subject of "enters", "dies", "attacks" and "becomes tapped". */
export function triggerSubject(rule: string): Parser<IrNoun> {
  return choice(
    map(spanned(literal('~')), ({ span }) => makeNoun(rule, span, 'self', { raw: '~' })),
    commanderSubject(rule),
    objectSubject(rule),
  );
}

/**
 * "equipped creature", "enchanted creature": the permanent this Aura or Equipment is attached to
 * (stage P18, D-111, CR 301.5a, 303.4b). The noun is read by `noun.attached-permanent`; which
 * events and which hosts the engine can follow is the lowering's business.
 */
export function attachedSubject(): Parser<IrNoun> {
  return family<IrNoun>('noun', { only: ['noun.attached-permanent'] });
}

/** `triggerSubject`, or the permanent attached to this one: what "dies", "attacks" and so on can be said of. */
export function permanentOrAttachedSubject(rule: string): Parser<IrNoun> {
  return choice(attachedSubject(), triggerSubject(rule));
}

/**
 * Whose turn a step trigger is about: "your ", "each opponent's ", "each player's ", "each " and, for
 * a step that has one of its own, "the " (the end step of every turn, said of nobody in particular,
 * CR 513.1a). The determiner is the one the actor noun carries (stage P18: `eachOpponent` is a turn of
 * another player, D-111).
 */
export function stepOwner(bare: boolean): Parser<'you' | 'eachPlayer' | 'eachOpponent'> {
  return choice(
    map(literal('your '), () => 'you' as const),
    map(pattern(/each opponent['’]s /i), () => 'eachOpponent' as const),
    map(pattern(/each player['’]s /i), () => 'eachPlayer' as const),
    map(literal('each '), () => 'eachPlayer' as const),
    ...(bare ? [map(literal('the '), () => 'eachPlayer' as const)] : []),
  );
}

/** "you": the player whose action or turn the trigger is about. */
export function youNoun(rule: string): Parser<IrNoun> {
  return map(spanned(pattern(/you(?![\p{L}\p{N}])/iu)), ({ span }) =>
    makeNoun(rule, span, 'you', { raw: 'you' }),
  );
}

/** A plain "a land you control": the landfall subject, which `trigger.enters` leaves alone. */
export function isPlainLandYouControl(noun: IrNoun): boolean {
  const f = noun.filter;
  return (
    noun.det === 'a' &&
    !noun.other &&
    f.controller === 'you' &&
    f.types?.length === 1 &&
    f.types[0] === 'land' &&
    f.notTypes === undefined &&
    f.supertypes === undefined &&
    f.colors === undefined &&
    f.tapped === undefined
  );
}
