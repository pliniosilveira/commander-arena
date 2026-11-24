/**
 * Effect rules of the Mind Flayarrrs deck (Creeping Tar Pit, Dimir Keyrune): a permanent that becomes a colored creature until end of turn and "can't be blocked this turn".
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type {
  IrBasePt,
  IrClause,
  IrColorSpec,
  IrDuration,
  IrNoun,
  IrTypeList,
  Span,
} from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { CREATURE_TYPE_LIST } from './becomes';
import { type Clauses, makeClause } from './operands';

const LEAD_ID = 'effect.lead-becomes-land-creature-unblockable';
const TRAILING_ID = 'effect.becomes-artifact-creature-unblockable';

const COLORS =
  /(white|blue|black|red|green)(?: and (white|blue|black|red|green))?(?![\p{L}\p{N}]) /iu;

type Spanned<T> = { value: T; span: Span };

/** The "becomes" clause of a colored creature with base power and toughness, and the restriction "can't be blocked this turn" of the same permanent (CR 509.1b, 611.2a). */
function becomesUnblockable(
  id: string,
  subject: IrNoun,
  duration: IrDuration,
  pt: Spanned<RegExpMatchArray>,
  colorWords: Spanned<RegExpMatchArray>,
  types: Spanned<string[]>,
  cardTypes: string[],
  restrictSpan: Span,
): IrClause[] | undefined {
  const colors = [colorWords.value[1], colorWords.value[2]]
    .filter((c): c is string => c !== undefined)
    .map((c) => c.toLowerCase());
  if (new Set(colors).size !== colors.length) return undefined;
  const basePt: IrBasePt = {
    kind: 'basePt',
    power: Number(pt.value[1]),
    toughness: Number(pt.value[2]),
    span: pt.span,
    rule: id,
  };
  const typeList: IrTypeList = {
    kind: 'typeList',
    subtypes: types.value,
    cardTypes,
    additive: true,
    span: types.span,
    rule: id,
  };
  const colorSpec: IrColorSpec = { kind: 'colorSpec', colors, span: colorWords.span, rule: id };
  const becomes: IrClause = {
    ...makeClause(
      id,
      'becomes',
      { objects: subject, types: typeList, colors: colorSpec, basePt },
      types.span,
    ),
    duration,
    connector: 'and' as const,
  };
  const restrict: IrClause = {
    ...makeClause(
      id,
      'restrict',
      {
        objects: subject,
        restriction: {
          kind: 'restrictionKind',
          restriction: 'cantBeBlocked',
          span: restrictSpan,
          rule: id,
        },
      },
      restrictSpan,
    ),
    duration: { kind: 'duration', scope: 'thisTurn', span: restrictSpan, rule: id },
  };
  return [becomes, restrict];
}

/**
 * `effect.lead-becomes-land-creature-unblockable`: "Until end of turn, ~ becomes a 3/2 blue and black Elemental creature. It's still a land. It can't be blocked this turn." (CR 611.2a,
 * 613.1d, 613.1f, 613.4b, 205.1b, 509.1b): the land that is also a creature until the end of the turn of `effect.lead-becomes-land-creature-keywords`, with no keyword, followed by a
 * restriction of the same permanent for the turn (the engine's `restrict`: no creature can block it). Only `~` itself.
 * Not read: another duration, another subject, no colors, no creature type, "that's still a land", a sentence left out or another one added.
 */
export const EFFECT_LEAD_BECOMES_LAND_CREATURE_UNBLOCKABLE = defineRule<Clauses>({
  id: LEAD_ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 205.1b (Type Line)',
    'CR 509.1b (Declare Blockers Step)',
  ],
  examples: [
    "Until end of turn, ~ becomes a 3/2 blue and black Elemental creature. It's still a land. It can't be blocked this turn",
    'Until end of turn, ~ becomes a 3/2 blue and black Elemental creature. It’s still a land. It can’t be blocked this turn',
    "Until end of turn, ~ becomes a 2/2 red Elemental creature. It's still a land. It can't be blocked this turn",
  ],
  rejects: [
    "Until end of turn, ~ becomes a 3/2 blue and black Elemental creature. It's still a land.",
    "Until end of turn, ~ becomes a 3/2 blue and black Elemental creature. It's still a land. It can't block this turn",
    "Until end of turn, ~ becomes a 3/2 blue and black Elemental creature. It's still a land. It can't be blocked",
    "Until end of turn, ~ becomes a 3/2 blue and black Elemental creature. It's still a planeswalker. It can't be blocked this turn",
    "Until your next turn, ~ becomes a 3/2 blue and black Elemental creature. It's still a land. It can't be blocked this turn",
    "Until end of turn, target land becomes a 3/2 blue and black Elemental creature. It's still a land. It can't be blocked this turn",
    "Until end of turn, ~ becomes a blue and black Elemental creature. It's still a land. It can't be blocked this turn",
    "Until end of turn, ~ becomes a 3/2 Elemental creature. It's still a land. It can't be blocked this turn",
    "Until end of turn, ~ becomes a 3/2 blue and black creature. It's still a land. It can't be blocked this turn",
    "Until end of turn, ~ becomes a 3/2 blue and black Elemental creature. It's still a land. It can't be blocked this turn and you draw a card",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrDuration>('duration'),
      literal(', '),
      family<IrNoun>('noun', { only: ['noun.self'] }),
      literal(' becomes a '),
      spanned(pattern(/(\d+)\/(\d+) /)),
      spanned(pattern(COLORS)),
      spanned(CREATURE_TYPE_LIST),
      literal(' creature'),
      pattern(/\. It['’]s still a land\. /iu),
      spanned(pattern(/It can['’]t be blocked this turn(?![\p{L}\p{N}])/iu)),
    )(ctx, pos);
    if (!r.ok) return r;
    const [duration, , subject, , pt, colorWords, types, , , unblockable] = r.value;
    const clauses = becomesUnblockable(
      LEAD_ID,
      subject,
      duration,
      pt,
      colorWords,
      types,
      ['creature'],
      unblockable.span,
    );
    return clauses === undefined ? fail(ctx, pos) : { ok: true, value: clauses, pos: r.pos };
  },
});

/**
 * `effect.becomes-artifact-creature-unblockable`: "~ becomes a 2/2 blue and black Horror artifact creature until end of turn and can't be blocked this turn." (CR 611.2a, 613.1d, 613.1f,
 * 613.4b, 205.1b, 509.1b): the artifact that is also a creature until the end of the turn, with the base power and toughness, the colors and the creature types the text says, and the
 * restriction of the same permanent for the turn (the engine's `restrict`). Only `~` itself, only the duration the text says.
 * Not read: another subject, no colors, no creature type, no "artifact", another restriction, a longer list of actions.
 */
export const EFFECT_BECOMES_ARTIFACT_CREATURE_UNBLOCKABLE = defineRule<Clauses>({
  id: TRAILING_ID,
  family: 'effect',
  leading: ['~'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 205.1b (Type Line)',
    'CR 509.1b (Declare Blockers Step)',
  ],
  examples: [
    "~ becomes a 2/2 blue and black Horror artifact creature until end of turn and can't be blocked this turn",
    '~ becomes a 2/2 blue and black Horror artifact creature until end of turn and can’t be blocked this turn',
    "~ becomes a 3/3 red Golem artifact creature until end of turn and can't be blocked this turn",
  ],
  rejects: [
    '~ becomes a 2/2 blue and black Horror artifact creature until end of turn',
    "~ becomes a 2/2 blue and black Horror artifact creature until your next turn and can't be blocked this turn",
    "target artifact becomes a 2/2 blue and black Horror artifact creature until end of turn and can't be blocked this turn",
    "~ becomes a blue and black Horror artifact creature until end of turn and can't be blocked this turn",
    "~ becomes a 2/2 Horror artifact creature until end of turn and can't be blocked this turn",
    "~ becomes a 2/2 blue and black artifact creature until end of turn and can't be blocked this turn",
    "~ becomes a 2/2 blue and black Horror creature until end of turn and can't be blocked this turn",
    "~ becomes a 2/2 blue and black Horror artifact creature until end of turn and can't block this turn",
    "~ becomes a 2/2 blue and black Horror artifact creature until end of turn and can't be blocked this turn and you draw a card",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrNoun>('noun', { only: ['noun.self'] }),
      literal(' becomes a '),
      spanned(pattern(/(\d+)\/(\d+) /)),
      spanned(pattern(COLORS)),
      spanned(CREATURE_TYPE_LIST),
      literal(' artifact creature '),
      family<IrDuration>('duration'),
      spanned(pattern(/ and can['’]t be blocked this turn(?![\p{L}\p{N}])/iu)),
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, , pt, colorWords, types, , duration, unblockable] = r.value;
    const clauses = becomesUnblockable(
      TRAILING_ID,
      subject,
      duration,
      pt,
      colorWords,
      types,
      ['artifact', 'creature'],
      unblockable.span,
    );
    return clauses === undefined ? fail(ctx, pos) : { ok: true, value: clauses, pos: r.pos };
  },
});

export const LAND_CREATURE_UNBLOCKABLE_EFFECT_RULES = [
  EFFECT_LEAD_BECOMES_LAND_CREATURE_UNBLOCKABLE,
  EFFECT_BECOMES_ARTIFACT_CREATURE_UNBLOCKABLE,
];
