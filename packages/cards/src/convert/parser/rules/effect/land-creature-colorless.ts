/**
 * Effect rule of the Revenant Recon deck (Hostile Desert): a land that becomes a creature of no stated color until end of turn.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrBasePt, IrClause, IrDuration, IrNoun, IrTypeList } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { CREATURE_TYPE_LIST } from './becomes';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.becomes-land-creature-trailing-no-color';

/**
 * `effect.becomes-land-creature-trailing-no-color`: "~ becomes a 3/4 Elemental creature until end of turn. It's still a land." (CR 613.1d, 613.1e, 613.4b, 205.1b, 611.2a): the land
 * creature of `effect.becomes-land-creature-trailing` with no color words, so its colors are not changed (a colorless land stays colorless). The base power and toughness and the creature
 * types are set, the land type is kept ("still a land"). Only `~` itself. Not read: another duration, another subject, a color, no creature type, no base power and toughness, a keyword,
 * "that's still a land", the second sentence left out.
 */
export const EFFECT_BECOMES_LAND_CREATURE_TRAILING_NO_COLOR = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['~'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1e (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 205.1b (Type Line)',
  ],
  examples: [
    "~ becomes a 3/4 Elemental creature until end of turn. It's still a land",
    '~ becomes a 3/4 Elemental creature until end of turn. It’s still a land',
  ],
  rejects: [
    '~ becomes a 3/4 Elemental creature until end of turn.',
    "~ becomes a 3/4 Elemental creature until your next turn. It's still a land",
    "target land becomes a 3/4 Elemental creature until end of turn. It's still a land",
    "~ becomes a 3/4 green Elemental creature until end of turn. It's still a land",
    "~ becomes a 3/4 creature until end of turn. It's still a land",
    "~ becomes a 3/4 Elemental creature with flying until end of turn. It's still a land",
    "~ becomes an Elemental creature until end of turn. It's still a land",
    "~ becomes a 3/4 Elemental creature until end of turn. It's still a land and you draw a card",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrNoun>('noun', { only: ['noun.self'] }),
      pattern(/ becomes an? /iu),
      spanned(pattern(/(\d+)\/(\d+) /)),
      spanned(CREATURE_TYPE_LIST),
      literal(' creature '),
      family<IrDuration>('duration'),
      pattern(/\. It['’]s still a land(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return fail(ctx, pos);
    const [subject, , pt, types, , duration] = r.value;
    const basePt: IrBasePt = {
      kind: 'basePt',
      power: Number(pt.value[1]),
      toughness: Number(pt.value[2]),
      span: pt.span,
      rule: ID,
    };
    const typeList: IrTypeList = {
      kind: 'typeList',
      subtypes: types.value,
      cardTypes: ['creature'],
      additive: true,
      span: types.span,
      rule: ID,
    };
    const clause: IrClause = {
      ...makeClause(ID, 'becomes', { objects: subject, types: typeList, basePt }, types.span),
      duration,
    };
    return { ok: true, value: [clause], pos: r.pos };
  },
});

export const LAND_CREATURE_COLORLESS_EFFECT_RULES = [
  EFFECT_BECOMES_LAND_CREATURE_TRAILING_NO_COLOR,
];
