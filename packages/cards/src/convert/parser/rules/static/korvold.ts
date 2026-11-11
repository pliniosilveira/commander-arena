/**
 * Static ability rules of stage P37 (D-180): the Korvold deck's slice of triggers and small statics. "Lands you control enter untapped."
 * (CR 614.1c, 614.12: a replacement effect of a permanent on the battlefield for the permanents that enter) and "Your opponents can't cast spells
 * during your turn." (CR 101.2, 604.1), alone and as the statement of "As long as ~ is attached to a creature, ..." (`conditional.ts`).
 */
import { fail, literal, pattern, quiet, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule, family } from '../registry';
import { staticOf } from './angels-words';
import { spellSubject } from './cost';
import type { StaticUnit } from './grants';

const PERIOD = literal('.');

/** The controller of the permanent, said as "you": the opponents are the ones the effect is about. */
function youNoun(rule: string, pos: number, end: number): IrNoun {
  return {
    kind: 'noun',
    det: 'you',
    filter: { raw: 'your opponents' },
    upTo: false,
    plural: false,
    other: false,
    span: { start: pos, end },
    rule,
  };
}

const OPPONENTS_CANT_CAST_WORDS =
  /your opponents can['’]t cast spells during your turn(?![\p{L}\p{N}])/iu;

/**
 * The unit of "Your opponents can't cast spells during your turn", before its period: what `static.conditional-prefix` and
 * `static.conditional-suffix` read as a statement of their own.
 */
export const OPPONENTS_CANT_CAST_UNIT = (
  ctx: Parameters<ReturnType<typeof pattern>>[0],
  pos: number,
) => {
  const r = pattern(OPPONENTS_CANT_CAST_WORDS)(ctx, pos);
  if (!r.ok) return r;
  const value: StaticUnit = {
    noun: youNoun('static.opponents-cant-cast', pos, r.pos),
    effects: [{ kind: 'opponentsCantCast' }],
  };
  return { ok: true as const, value, pos: r.pos };
};

/**
 * `static.opponents-cant-cast`: "Your opponents can't cast spells during your turn." (CR 101.2, 604.1: while the permanent has the ability, no
 * opponent of its controller can cast a spell in a turn of the controller, by any means; abilities and lands are not spells). The subject is the
 * controller of the permanent. Not read: "each opponent", "target opponent", another time ("during their turn"), "spells with ...", "or activate
 * abilities", and a statement of another subject.
 */
export const STATIC_OPPONENTS_CANT_CAST = defineRule<IrStatic>({
  id: 'static.opponents-cant-cast',
  family: 'static',
  leading: ['your'],
  cites: [
    'CR 101.2 (Golden Rules)',
    'CR 604.1 (Handling Static Abilities)',
    'CR 601.2 (Casting Spells)',
  ],
  examples: [
    "Your opponents can't cast spells during your turn.",
    'Your opponents can’t cast spells during your turn.',
  ],
  rejects: [
    "Your opponents can't cast spells during your turn",
    "Each opponent can't cast spells during your turn.",
    "Your opponents can't cast spells.",
    "Your opponents can't cast spells during their turn.",
    "Your opponents can't cast creature spells during your turn.",
    "Your opponents can't cast spells or activate abilities during your turn.",
    "You can't cast spells during your turn.",
    "Your opponents can't cast spells during your turn and draw a card.",
  ],
  parse: (ctx, pos) => {
    const r = OPPONENTS_CANT_CAST_UNIT(ctx, pos);
    if (!r.ok) return r;
    const end = PERIOD(ctx, r.pos);
    if (!end.ok) return end;
    return {
      ok: true,
      value: staticOf('static.opponents-cant-cast', r.value.noun, r.value.effects, pos, end.pos),
      pos: end.pos,
    };
  },
});

/**
 * `static.group-enters-untapped`: "Lands you control enter untapped." (CR 614.1c, 614.12, 616.1: a replacement effect of the permanent for the
 * permanents that enter under its controller's control; they enter untapped whatever else would have them enter tapped). The permanents are a
 * plural group (`noun.plain-permanents`) of the controller's own: "Lands you control", "Creatures you control". Not read: a group with no
 * controller or an opponent's ("Lands enter untapped", "Lands your opponents control enter untapped"), "other", "tapped", a condition ("unless").
 */
export const STATIC_GROUP_ENTERS_UNTAPPED = defineRule<IrStatic>({
  id: 'static.group-enters-untapped',
  family: 'static',
  leading: [],
  cites: [
    'CR 614.1c (Replacement Effects)',
    'CR 614.12 (Replacement Effects)',
    'CR 616.1 (Interaction of Replacement and/or Prevention Effects)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    'Lands you control enter untapped.',
    'Creatures you control enter untapped.',
    'Artifacts you control enter untapped.',
    'Basic lands you control enter untapped.',
  ],
  rejects: [
    'Lands you control enter untapped',
    'Lands enter untapped.',
    'Lands your opponents control enter untapped.',
    'Other lands you control enter untapped.',
    'Lands you control enter tapped.',
    'Lands you control enter untapped unless you control a Forest.',
    'Lands you control enter untapped and gain 1 life.',
    'Land you control enters untapped.',
    'Lands you control enter the battlefield untapped.',
    'You enter untapped.',
  ],
  parse: (ctx, pos) => {
    const subject = quiet(family<IrNoun>('noun', { only: ['noun.plain-permanents'] }))(ctx, pos);
    if (!subject.ok) return subject;
    // The permanents are the controller's own: "you control" is part of the phrase.
    if (subject.value.filter.controller !== 'you' || subject.value.other) return fail(ctx, pos);
    const words = literal(' enter untapped.')(ctx, subject.pos);
    if (!words.ok) return words;
    return {
      ok: true,
      value: staticOf(
        'static.group-enters-untapped',
        subject.value,
        [{ kind: 'groupEntersUntapped' }],
        pos,
        words.pos,
      ),
      pos: words.pos,
    };
  },
});

/**
 * `static.spells-cant-be-countered`: "Creature spells you control can't be countered." (stage P40, D-186, CR 101.2, 604.1, 701.6a: while the
 * permanent has the ability, a spell of its controller that the subject describes is not countered; it stays on the stack and resolves). The
 * subject is the kind of spell and "you control": a card type or a subtype ("Creature spells", "Dragon spells"), a list of them, "noncreature",
 * or none ("Spells you control"). The spell's own "can't be countered" is `static.self`. Not read: another controller ("Spells your opponents
 * control", "Spells can't be countered"), "you cast", a quality of the spell ("with mana value 4 or greater", "that target ..."), "unless", and "or"
 * in a list of types.
 */
export const STATIC_SPELLS_CANT_BE_COUNTERED = defineRule<IrStatic>({
  id: 'static.spells-cant-be-countered',
  family: 'static',
  leading: [],
  cites: ['CR 101.2 (Golden Rules)', 'CR 701.6a (Counter)', 'CR 604.1 (Handling Static Abilities)'],
  examples: [
    "Creature spells you control can't be countered.",
    'Creature spells you control can’t be countered.',
    "Spells you control can't be countered.",
    "Noncreature spells you control can't be countered.",
    "Dragon spells you control can't be countered.",
    "Instant and sorcery spells you control can't be countered.",
  ],
  rejects: [
    "Creature spells you control can't be countered",
    "Creature spells can't be countered.",
    "Creature spells your opponents control can't be countered.",
    "Creature spells you cast can't be countered.",
    "Creature spell you control can't be countered.",
    "Creature spells you control can't be countered unless they target a player.",
    "Creature spells you control can't be countered and have flash.",
    "Creature spells you control with mana value 4 or greater can't be countered.",
    "Instant or sorcery spells you control can't be countered.",
    "Creature spells you control can't be copied.",
    "~ can't be countered.",
  ],
  parse: (ctx, pos) => {
    // The subject and "you control can't be countered" are read as one, quietly: a line that merely starts like a subject (a cost reduction,
    // "Creature spells you cast cost {1} less") was never this statement, and its diagnostic must not move.
    const r = sequence(
      quiet(sequence(spellSubject(), pattern(/ you control can['’]t be countered/iu))),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [[filter]] = r.value;
    const subject: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { ...filter, controller: 'you' },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: pos + filter.raw.length },
      rule: 'static.spells-cant-be-countered',
    };
    return {
      ok: true,
      value: staticOf(
        'static.spells-cant-be-countered',
        subject,
        [{ kind: 'spellsCantBeCountered' }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

/**
 * `static.pt-times-attacked`: "Each creature you control gets +1/+0 for each time it has attacked this turn." (CR 508.1, 611.3a, 613.4c; stage P41,
 * D-188): a bonus for each creature of the group on its own, for each time that creature was declared as an attacker this turn, which follows the
 * turn log and is not locked in. The step is +1 or +0 for each of power and toughness (not both 0); "each creature", with the count of its own
 * attacks. Not read: another step, "they have attacked", a duration, another subject or another count.
 */
export const STATIC_PT_TIMES_ATTACKED = defineRule<IrStatic>({
  id: 'static.pt-times-attacked',
  family: 'static',
  leading: ['each'],
  cites: [
    'CR 508.1 (Declare Attackers Step)',
    'CR 611.3a (Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    'Each creature you control gets +1/+0 for each time it has attacked this turn.',
    'Each creature you control gets +1/+1 for each time it has attacked this turn.',
    'Each Zombie you control gets +0/+1 for each time it has attacked this turn.',
  ],
  rejects: [
    'Each creature you control gets +1/+0 for each time it has attacked this turn',
    'Each creature you control gets +2/+0 for each time it has attacked this turn.',
    'Each creature you control gets +0/+0 for each time it has attacked this turn.',
    'Each creature you control gets -1/+0 for each time it has attacked this turn.',
    'Each creature you control gets +1/+0 for each time it has attacked.',
    'Each creature you control gets +1/+0 for each time they have attacked this turn.',
    'Each creature you control gets +1/+0 for each time it has blocked this turn.',
    'Each creature you control get +1/+0 for each time it has attacked this turn.',
    'Each creature you control gets +1/+0 for each time it has attacked this turn until end of turn.',
    'Creatures you control get +1/+0 for each time they have attacked this turn.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      quiet(family<IrNoun>('noun', { only: ['noun.each-permanent'] })),
      pattern(/ gets \+([01])\/\+([01])(?![\p{L}\p{N}/])/u),
      pattern(/ for each time it has attacked this turn(?![\p{L}\p{N}])/iu),
      PERIOD,
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, step] = r.value;
    const power = Number(step[1]);
    const toughness = Number(step[2]);
    if (power === 0 && toughness === 0) return fail(ctx, pos);
    return {
      ok: true,
      value: staticOf(
        'static.pt-times-attacked',
        subject,
        [{ kind: 'ptTimesAttacked', power: power === 1, toughness: toughness === 1 }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

export const KORVOLD_STATIC_RULES = [
  STATIC_PT_TIMES_ATTACKED,
  STATIC_OPPONENTS_CANT_CAST,
  STATIC_GROUP_ENTERS_UNTAPPED,
  STATIC_SPELLS_CANT_BE_COUNTERED,
];
