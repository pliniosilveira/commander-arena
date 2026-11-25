/**
 * Effect rule of the Planeswalker Party deck (issue 132, Vronos, Masked Inquisitor): targets phase out later in the turn.
 */
import { choice, fail, literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrBasePt, IrNoun, IrTypeList, IrZoneSpec } from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { defineRule, family, spanned } from '../registry';
import { perOpponentNoun } from './angels';
import { CREATURE_TYPE_LIST } from './becomes';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.phase-out-at-end-step';

/**
 * `effect.phase-out-at-end-step`: "Up to two other target planeswalkers you control phase out at the beginning of the next end step." (Vronos, Masked Inquisitor; CR 603.7, 603.7c, 702.26a):
 * a delayed triggered ability, created as the ability resolves, that phases out the permanents the targets named then. The engine's `delayedTrigger` at the end step of each turn whose
 * effect is `phaseOut` of the targets. Not read: another step, "your next end step", an object that is not a target, "phases in", a rider after it.
 */
export const EFFECT_PHASE_OUT_AT_END_STEP = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['up', 'any', 'target'],
  cites: ['CR 603.7 (Delayed Triggered Abilities)', 'CR 702.26a (Phasing)'],
  examples: [
    'up to two other target planeswalkers you control phase out at the beginning of the next end step',
    'target creature phases out at the beginning of the next end step',
    'any number of target creatures you control phase out at the beginning of the next end step',
  ],
  rejects: [
    'up to two other target planeswalkers you control phase out at the beginning of your next end step',
    'up to two other target planeswalkers you control phase out at the beginning of the next upkeep',
    'up to two other target planeswalkers you control phase out',
    'target creature phase out at the beginning of the next end step',
    'each creature you control phases out at the beginning of the next end step',
    'up to two other target planeswalkers you control phase out at the beginning of the next end step and draw a card',
    'up to two other target planeswalkers you control phase in at the beginning of the next end step',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      satisfy(family<IrNoun>('noun'), (n) => n.det === 'target' && n.filter.player === undefined),
      pattern(/ phases? out at the beginning of the next end step(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [objects, said] = r.value;
    // The verb agrees with its subject: "phase out" of several, "phases out" of one.
    const plural = objects.plural || objects.anyNumber === true || objects.upTo === true;
    if ((said[0] ?? '').toLowerCase().includes('phases') === plural) return fail(ctx, pos);
    return {
      ok: true,
      value: [makeClause(ID, 'phaseOutAtEndStep', { objects }, { start: pos, end: r.pos })],
      pos: r.pos,
    };
  },
});

const RETURN_ID = 'effect.return-per-opponent';

/**
 * `effect.return-per-opponent`: "For each opponent, return up to one target nonland permanent that player controls to its owner's hand." (Vronos, Masked Inquisitor; CR 115.1, 601.2c,
 * 603.3d, 400.3): one slot that takes at most one target of each opponent, each returned to its owner's hand. The same slot as the exile and the destroy of an opponent's permanent.
 * "Up to one" only; the permanent is whatever phrase names no controller. Not read: "each player", "target" with no "up to", another count, another destination, a rider.
 */
export const EFFECT_RETURN_PER_OPPONENT = defineRule<Clauses>({
  id: RETURN_ID,
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 603.3d (Handling Triggered Abilities)',
    'CR 400.3 (General)',
  ],
  examples: [
    "for each opponent, return up to one target nonland permanent that player controls to its owner's hand",
    'for each opponent, return up to one target creature that player controls to its owner’s hand',
  ],
  rejects: [
    "for each opponent, return target creature that player controls to its owner's hand",
    "for each opponent, return up to two target creatures that player controls to their owners' hands",
    "for each opponent, return up to one target creature to its owner's hand",
    "for each player, return up to one target creature that player controls to its owner's hand",
    'for each opponent, return up to one target creature that player controls to your hand',
    "for each opponent, return up to one target creature that player controls to its owner's hand and draw a card",
    "for each opponent, exile up to one target creature that player controls to its owner's hand",
  ],
  parse: (ctx, pos) => {
    const head = literal('for each opponent, return up to one target ')(ctx, pos);
    if (!head.ok) return head;
    const noun = perOpponentNoun(ctx, pos, 'return', head.pos, RETURN_ID);
    if (!noun.ok) return noun;
    const tail = pattern(/ to its owner['’]s hand(?![\p{L}\p{N}])/iu)(ctx, noun.pos);
    if (!tail.ok) return fail(ctx, pos);
    const span = { start: pos, end: tail.pos };
    const to: IrZoneSpec = {
      kind: 'zoneSpec',
      zone: 'hand',
      whose: 'owner',
      span: { start: noun.pos, end: tail.pos },
      rule: RETURN_ID,
    };
    return {
      ok: true,
      value: [makeClause(RETURN_ID, 'return', { objects: noun.value, to }, span)],
      pos: tail.pos,
    };
  },
});

const BECOMES_ID = 'effect.target-becomes-creature-for-good-unblockable';

/**
 * `effect.target-becomes-creature-for-good-unblockable`: "Target artifact you control becomes a 9/9 Construct artifact creature and gains vigilance, indestructible, and \"This creature can't
 * be blocked.\"" (Vronos, Masked Inquisitor; CR 613.1d, 613.1f, 613.4b, 611.2a, 509.1b): with no duration the change lasts for the rest of the game. The target is also a creature, a Construct
 * with the base power and toughness the text says, with the keywords and unable to be blocked. The engine's `setTypes` with `basePt`, the keywords and a `restrict` of `cantBeBlocked`, all
 * `permanent`. The quote is read only as "can't be blocked": the engine applies it as a rules-modifying effect that "loses all abilities" would not remove. Not read: a duration, another quoted
 * ability, another subject than a target, no creature type, no keyword.
 */
export const EFFECT_TARGET_BECOMES_CREATURE_FOR_GOOD_UNBLOCKABLE = defineRule<Clauses>({
  id: BECOMES_ID,
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 509.1b (Declare Blockers Step)',
  ],
  examples: [
    'target artifact you control becomes a 9/9 Construct artifact creature and gains vigilance, indestructible, and "~ can\'t be blocked."',
    'target artifact becomes a 3/3 Construct artifact creature and gains vigilance and "~ can\'t be blocked."',
  ],
  rejects: [
    'target artifact you control becomes a 9/9 Construct artifact creature and gains vigilance, indestructible, and "~ can\'t be blocked." until end of turn',
    'target artifact you control becomes a 9/9 Construct artifact creature and gains vigilance, indestructible',
    'target artifact you control becomes a 9/9 artifact creature and gains vigilance and "~ can\'t be blocked."',
    'target artifact you control becomes a 9/9 Construct creature and gains vigilance and "~ can\'t be blocked."',
    'target artifact you control becomes a Construct artifact creature and gains vigilance and "~ can\'t be blocked."',
    'target artifact you control becomes a 9/9 Construct artifact creature and gains vigilance, indestructible, and "~ has flying."',
    'target land you control becomes a 9/9 Construct artifact creature and gains vigilance and "~ can\'t be blocked."',
    'each artifact you control becomes a 9/9 Construct artifact creature and gains vigilance and "~ can\'t be blocked."',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      satisfy(
        family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
        (n) =>
          n.det === 'target' &&
          !n.plural &&
          !n.upTo &&
          n.filter.player === undefined &&
          n.filter.types?.length === 1 &&
          n.filter.types[0] === 'artifact',
      ),
      literal(' becomes a '),
      spanned(pattern(/(\d+)\/(\d+) /u)),
      spanned(CREATURE_TYPE_LIST),
      literal(' artifact creature and gains '),
      spanned(KEYWORD_WORDS),
      choice(literal(', and '), literal(' and ')),
      pattern(/["“]~ can['’]t be blocked\.["”]/u),
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, , pt, types, , keywords] = r.value;
    if (types.value.length !== 1) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const basePt: IrBasePt = {
      kind: 'basePt',
      power: Number(pt.value[1]),
      toughness: Number(pt.value[2]),
      span: pt.span,
      rule: BECOMES_ID,
    };
    const typeList: IrTypeList = {
      kind: 'typeList',
      subtypes: types.value,
      cardTypes: ['creature'],
      additive: true,
      span: types.span,
      rule: BECOMES_ID,
    };
    const words = keywords.value.map((name) => ({
      kind: 'keywordName' as const,
      name,
      span: keywords.span,
      rule: BECOMES_ID,
    }));
    const args: Record<string, IrNoun | IrBasePt | IrTypeList | (typeof words)[number]> = {
      objects: subject,
      types: typeList,
      basePt,
    };
    words.forEach((w, i) => {
      args[`keyword${i}`] = w;
    });
    return {
      ok: true,
      value: [makeClause(BECOMES_ID, 'becomesForGoodUnblockable', args, span)],
      pos: r.pos,
    };
  },
});

export const VRONOS_EFFECT_RULES = [
  EFFECT_PHASE_OUT_AT_END_STEP,
  EFFECT_RETURN_PER_OPPONENT,
  EFFECT_TARGET_BECOMES_CREATURE_FOR_GOOD_UNBLOCKABLE,
];
