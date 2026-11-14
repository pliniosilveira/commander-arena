/**
 * Effect rules of stage P47 (D-200 and D-200): the planeswalker effects. "Empower Jace N" (CR 701.71a), the keyword action of the Jace token, and "You
 * get an emblem with ..." (CR 114.1, 114.2), the ultimate of many planeswalkers. The engine runs `empowerJace` (`rules/empower.ts`) and `createEmblem`
 * (`rules/emblem.ts`).
 */
import { literal, map, optional, type Parser, pattern, sequence } from '../../combinators';
import type {
  IrArg,
  IrBasePt,
  IrClause,
  IrDuration,
  IrNoun,
  IrQuotedAbility,
} from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { defineRule, family, spanned } from '../registry';
import { readQuotedAbility } from '../static/quoted';
import { CREATURE_TYPE_LIST } from './becomes';
import { type Clauses, makeClause, single } from './operands';

const NUMBER = family<IrArg>('amount', { only: ['amount.number'] });

/**
 * `effect.empower-jace`: "Empower Jace 6", "empower Jace 2" (CR 701.71a): create a blue Jace planeswalker token with the two abilities if you
 * control none, choose a Jace planeswalker token you control and put N loyalty counters on it. N is a number, as the cards write it (no X).
 */
export const EFFECT_EMPOWER_JACE = defineRule<Clauses>({
  id: 'effect.empower-jace',
  family: 'effect',
  leading: ['empower'],
  cites: ['CR 701.71a (Empower)'],
  examples: ['Empower Jace 6', 'empower Jace 2', 'empower jace 1', 'Empower Jace two'],
  rejects: [
    'Empower Jace',
    'Empower Jace X',
    'Empower Gideon 2',
    'Empower 2',
    'Empower Jace 2 times',
    'Empowers Jace 2',
    'Empower Jace and Gideon 2',
  ],
  parse: single(
    'effect.empower-jace',
    map(sequence(literal('empower jace '), NUMBER), ([, count]) => count),
    (count) => ({ verb: 'empowerJace', args: { count } }),
  ),
});

/** The quoted text of an emblem: an ability of its own, static or triggered, "this emblem" being the emblem (CR 114.3). */
const EMBLEM_ABILITY: Parser<IrQuotedAbility> = (ctx, pos) =>
  readQuotedAbility(ctx, pos, { mana: false, statics: true, self: 'this emblem' });

/**
 * `effect.get-emblem`: `You get an emblem with "Creatures you control get +2/+2 and have flying."` (CR 114.1, 114.2: the player gets an object in the
 * command zone, CR 114.3: with the abilities in the quotes and nothing else). One quoted ability, static or triggered: the ones the engine's emblems have
 * (CR 114.4). The text in the quotes is read as an ability of its own, and "this emblem" in it is the emblem. A second sentence after the quote is another
 * clause.
 */
export const EFFECT_GET_EMBLEM = defineRule<Clauses>({
  id: 'effect.get-emblem',
  family: 'effect',
  leading: ['you'],
  cites: ['CR 114.1 (Emblems)', 'CR 114.2 (Emblems)', 'CR 114.3 (Emblems)', 'CR 114.4 (Emblems)'],
  examples: [
    'you get an emblem with "Creatures you control get +1/+1."',
    'You get an emblem with "Whenever you cast a spell, this emblem deals 5 damage to any target."',
    'you get an emblem with "Lands you control have indestructible."',
  ],
  rejects: [
    'you get an emblem',
    'you get an emblem with',
    'you get an emblem with Creatures you control get +1/+1.',
    'you get an emblem with "Creatures you control get +1/+1."."',
    'target player gets an emblem with "Creatures you control get +1/+1."',
    'you get two emblems with "Creatures you control get +1/+1."',
    'you get an emblem with "Draw a card."',
    'you get an emblem with ""',
  ],
  parse: single(
    'effect.get-emblem',
    map(sequence(literal('you get an emblem with '), EMBLEM_ABILITY), ([, quoted]) => quoted),
    (quoted) => ({ verb: 'getEmblem', args: { emblem: quoted } }),
  ),
});

/**
 * `effect.lead-becomes-creature`: "Until end of turn, ~ becomes a 6/6 Human Soldier creature that's still a planeswalker.", "Until end of turn, ~
 * becomes a 5/5 Human Soldier Ally creature with indestructible that's still a planeswalker." (CR 613.1d, 205.1b, 613.4b, 611.2a): a planeswalker
 * that is also a creature until the end of the turn, with the base power and toughness the text says and, when it says so, keywords. The words "that's
 * still a planeswalker" say that its types are added to, not replaced (CR 205.1b): the engine's additive `setTypes`.
 */
export const EFFECT_LEAD_BECOMES_CREATURE = defineRule<Clauses>({
  id: 'effect.lead-becomes-creature',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 205.1b (Type Line)',
  ],
  examples: [
    "Until end of turn, ~ becomes a 6/6 Human Soldier creature that's still a planeswalker",
    "Until end of turn, ~ becomes a 5/5 Human Soldier Ally creature with indestructible that's still a planeswalker",
    "Until end of turn, ~ becomes a 4/4 Elemental creature that's still a planeswalker",
  ],
  rejects: [
    "Until end of turn, ~ becomes a 6/6 Human Soldier creature that's still a land",
    'Until end of turn, ~ becomes a 6/6 Human Soldier creature',
    "Until end of turn, ~ becomes a Human Soldier creature that's still a planeswalker",
    "Until end of turn, ~ becomes a 6/6 creature that's still a planeswalker",
    "Until end of turn, target creature becomes a 6/6 Human Soldier creature that's still a planeswalker",
    "Until your next turn, ~ becomes a 6/6 Human Soldier creature that's still a planeswalker",
    "Until end of turn ~ becomes a 6/6 Human Soldier creature that's still a planeswalker",
    "Until end of turn, ~ becomes a 6/6 Human Soldier artifact creature that's still a planeswalker",
    "Until end of turn, ~ becomes a +6/+6 Human Soldier creature that's still a planeswalker",
  ],
  parse: (ctx, pos) => {
    const rule = 'effect.lead-becomes-creature';
    const r = sequence(
      family<IrDuration>('duration'),
      literal(', '),
      family<IrNoun>('noun', { only: ['noun.self'] }),
      literal(' becomes a '),
      spanned(pattern(/(\d+)\/(\d+) /)),
      spanned(CREATURE_TYPE_LIST),
      literal(' creature'),
      optional(spanned(sequence(literal(' with '), KEYWORD_WORDS)), null),
      literal(" that's still a planeswalker"),
    )(ctx, pos);
    if (!r.ok) return r;
    const [duration, , subject, , pt, types, , keywords] = r.value;
    const basePt: IrBasePt = {
      kind: 'basePt',
      power: Number(pt.value[1]),
      toughness: Number(pt.value[2]),
      span: pt.span,
      rule,
    };
    const typeList = {
      kind: 'typeList' as const,
      subtypes: types.value,
      cardTypes: ['creature'],
      additive: true as const,
      span: types.span,
      rule,
    };
    const clauses: IrClause[] = [
      {
        ...makeClause(rule, 'becomes', { objects: subject, types: typeList, basePt }, types.span),
        duration,
        ...(keywords === null ? {} : { connector: 'and' as const }),
      },
    ];
    if (keywords !== null) {
      const words = keywords.value[1];
      words.forEach((name, i) => {
        const keyword = { kind: 'keywordName' as const, name, span: keywords.span, rule };
        const clause = makeClause(
          rule,
          'grantKeyword',
          { objects: subject, keyword },
          keywords.span,
        );
        clauses.push({
          ...clause,
          duration,
          ...(i < words.length - 1 ? { connector: 'and' as const } : {}),
        });
      });
    }
    return { ok: true, value: clauses, pos: r.pos };
  },
});

/**
 * `effect.life-total-becomes`: "Target player's life total becomes 1." (CR 119.5, stage P47, D-201): the player gains or loses the life that sets the
 * total to the number. The player is a target player or opponent (the nouns of a player), the number a whole number; a total that becomes a count,
 * "half" or X is not read.
 */
export const EFFECT_LIFE_TOTAL_BECOMES = defineRule<Clauses>({
  id: 'effect.life-total-becomes',
  family: 'effect',
  leading: ['target', 'each', 'you'],
  cites: ['CR 119.5 (Life)', 'CR 119.9 (Life)'],
  examples: [
    "target player's life total becomes 1",
    "target opponent's life total becomes 1",
    "target player's life total becomes 10",
    'target player\u2019s life total becomes 1',
  ],
  rejects: [
    "target player's life total becomes X",
    "target player's life total becomes",
    "target player's life total becomes half",
    "target player's life total becomes 1 until end of turn",
    "target creature's life total becomes 1",
    "target players' life totals become 1",
    "target player's life becomes 1",
    "target player's life total becomes a number",
  ],
  parse: single(
    'effect.life-total-becomes',
    map(
      sequence(
        family<IrNoun>('noun', { only: ['noun.player'] }),
        pattern(/['\u2019]s life total becomes /iu),
        NUMBER,
      ),
      ([player, , amount]) => ({ player, amount }),
    ),
    ({ player, amount }) => ({ verb: 'setLifeTotal', args: { player, amount } }),
  ),
});

export const PLANESWALKER_EFFECT_RULES = [
  EFFECT_LIFE_TOTAL_BECOMES,
  EFFECT_EMPOWER_JACE,
  EFFECT_GET_EMBLEM,
  EFFECT_LEAD_BECOMES_CREATURE,
];
