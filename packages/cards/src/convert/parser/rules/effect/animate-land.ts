/**
 * Effect rule of the Animated Army deck (issue 110, Llanowar Loamspeaker): a permanent that becomes a creature of a stated size, with a keyword, until end of turn, and is still what
 * it was.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrBasePt, IrClause, IrDuration, IrNoun, IrTypeList } from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { defineRule, family, spanned } from '../registry';
import { CREATURE_TYPE_LIST } from './becomes';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.becomes-creature-with-keywords`: "target land you control becomes a 3/3 Elemental creature with haste until end of turn. It's still a land" (CR 613.1d, 613.1f,
 * 613.4b, 205.1b, 611.2a): the target has the creature card type and the creature types as well as its own types ("It's still a land"), the base power and toughness, and the
 * keywords, for the duration. The sentence "It's still a land" is read with it and must name the card type the target is (a land), as the target says. Not read: another
 * duration, no "It's still a ...", "It's still a" a type other than the target's, a color, no creature type, "gains" in place of "with".
 */
export const EFFECT_BECOMES_CREATURE_WITH_KEYWORDS = defineRule<Clauses>({
  id: 'effect.becomes-creature-with-keywords',
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 205.1b (Type Line)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    "target land you control becomes a 3/3 Elemental creature with haste until end of turn. It's still a land",
    "target land you control becomes a 4/4 Elemental creature with haste and trample until end of turn. It's still a land",
    "target artifact you control becomes a 2/2 Construct creature with flying until end of turn. It's still an artifact",
  ],
  rejects: [
    "target land you control becomes a 3/3 Elemental creature with haste until end of turn. It's still a land.",
    'target land you control becomes a 3/3 Elemental creature with haste until end of turn',
    "target land you control becomes a 3/3 Elemental creature with haste until end of turn. It's still an artifact",
    "target land you control becomes a 3/3 Elemental creature with haste until your next turn. It's still a land",
    "target land you control becomes a 3/3 Elemental creature until end of turn. It's still a land",
    "target land you control becomes a 3/3 green Elemental creature with haste until end of turn. It's still a land",
    "target land you control becomes a 3/3 creature with haste until end of turn. It's still a land",
    "target land you control becomes a 3/3 Elemental creature and gains haste until end of turn. It's still a land",
    "target land you control becomes a 3/3 Elemental creature with banana until end of turn. It's still a land",
    "target land you control becomes a 3/3 Elemental creature with haste and haste until end of turn. It's still a land",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.becomes-creature-with-keywords';
    const r = sequence(
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      literal(' becomes a '),
      spanned(pattern(/(\d+)\/(\d+) /)),
      spanned(CREATURE_TYPE_LIST),
      literal(' creature with '),
      spanned(KEYWORD_WORDS),
      literal(' '),
      family<IrDuration>('duration'),
      pattern(/\. It['’]s still an? (artifact|enchantment|land)(?![\p{L}\p{N}'’])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, , pt, types, , keywords, , duration, still] = r.value;
    // CR 205.1b: "It's still a land" names a card type the target is; a target of other types would not be what the sentence says.
    const kept = still[1] ?? '';
    if (subject.filter.types?.length !== 1 || subject.filter.types[0] !== kept)
      return fail(ctx, pos);
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
      cardTypes: ['creature'],
      additive: true,
      span: types.span,
      rule: id,
    };
    const becomes: IrClause = {
      ...makeClause(id, 'becomes', { objects: subject, types: typeList, basePt }, types.span),
      duration,
      connector: 'and' as const,
    };
    const clauses: IrClause[] = [becomes];
    keywords.value.forEach((name, i, all) => {
      const grant = makeClause(
        id,
        'grantKeyword',
        { objects: subject, keyword: { kind: 'keywordName', name, span: keywords.span, rule: id } },
        keywords.span,
      );
      clauses.push({
        ...grant,
        duration,
        ...(i < all.length - 1 ? { connector: 'and' as const } : {}),
      });
    });
    return { ok: true, value: clauses, pos: r.pos };
  },
});

export const ANIMATE_LAND_EFFECT_RULES = [EFFECT_BECOMES_CREATURE_WITH_KEYWORDS];
