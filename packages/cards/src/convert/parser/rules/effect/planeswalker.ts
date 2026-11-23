/**
 * Effect rules of stage P47 (D-200 and D-200): the planeswalker effects. "Empower Jace N" (CR 701.71a), the keyword action of the Jace token, and "You
 * get an emblem with ..." (CR 114.1, 114.2), the ultimate of many planeswalkers. The engine runs `empowerJace` (`rules/empower.ts`) and `createEmblem`
 * (`rules/emblem.ts`).
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  sequence,
} from '../../combinators';
import type {
  IrAmount,
  IrArg,
  IrBasePt,
  IrClause,
  IrDuration,
  IrNoun,
  IrQuotedAbility,
} from '../../ir/types';
import { counted } from '../amount/count';
import { KEYWORD_WORDS } from '../keyword/list';
import { defineRule, family, spanned } from '../registry';
import { readQuotedAbility } from '../static/quoted';
import { CREATURE_TYPE_LIST } from './becomes';
import { type Clauses, makeClause, single } from './operands';

const NUMBER = family<IrArg>('amount', { only: ['amount.number'] });

const EFFECT_DOUBLE_LIFE_TOTAL = defineRule<Clauses>({
  id: 'effect.double-life-total',
  family: 'effect',
  leading: ['double'],
  cites: ['CR 119.1 (Life)', 'CR 119.5 (Life)', 'CR 107.1a (Fractions)'],
  examples: ['Double your life total'],
  rejects: [
    'Double your life',
    'Double their life total',
    'Double your life total until end of turn',
  ],
  parse: single(
    'effect.double-life-total',
    map(spanned(pattern(/double your life total(?![\p{L}\p{N}])/iu)), ({ span }) => {
      const you: IrNoun = {
        kind: 'noun',
        det: 'you',
        filter: { raw: 'you' },
        upTo: false,
        plural: false,
        other: false,
        span,
        rule: 'effect.double-life-total',
      };
      const total: IrAmount = { kind: 'lifeTotalOf', of: you, span };
      const amount: IrAmount = { kind: 'multiple', factor: 2, of: total, span };
      return { player: you, amount };
    }),
    ({ player, amount }) => ({ verb: 'setLifeTotal', args: { player, amount } }),
  ),
});

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
export const EMBLEM_ABILITY: Parser<IrQuotedAbility> = (ctx, pos) =>
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

const ID = 'effect.count-library-life-total';

/**
 * `effect.count-library-life-total`: "Count the number of cards in your library. Your life total becomes that number." (issue 145, Invincible Hymn; CR 119.5, 401.1): the two
 * sentences are one instruction (`segment.ts` joins them), which sets your life total to the number of cards in your library at that moment. Not read: another zone, another
 * player, "that number" without the first sentence, a number that is not the count of the library.
 */
export const EFFECT_COUNT_LIBRARY_LIFE_TOTAL = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['count'],
  cites: ['CR 119.5 (Life)', 'CR 401.1 (Library)'],
  examples: [
    'Count the number of cards in your library. Your life total becomes that number',
    'count the number of cards in your library. your life total becomes that number',
  ],
  rejects: [
    'Count the number of cards in your hand. Your life total becomes that number',
    'Count the number of cards in your library',
    'Count the number of cards in your library. Target player\u2019s life total becomes that number',
    'Count the number of cards in your library. Your life total becomes 5',
    'Count the number of lands in your library. Your life total becomes that number',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        literal('count the number of '),
        counted(ID, true),
        pattern(/\. your life total becomes that number(?![\p{L}\p{N}])/iu),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const of = r.value.value[1];
    // Only "cards in your library": the zone and the owner are the filter's, and no card type narrows the count.
    if (
      of.filter.zone !== 'library' ||
      of.filter.controller !== 'you' ||
      (of.filter.types?.length ?? 0) > 0 ||
      (of.filter.subtypes?.length ?? 0) > 0
    ) {
      return fail(ctx, pos);
    }
    const span = r.value.span;
    const you: IrNoun = {
      kind: 'noun',
      det: 'you',
      filter: { raw: 'your' },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: ID,
    };
    const amount: IrAmount = { kind: 'countOf', of, span };
    return {
      ok: true,
      value: [makeClause(ID, 'setLifeTotal', { player: you, amount }, span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.exchange-life-pt`: "exchange target opponent's life total with ~'s toughness" (CR 701.12g, 119.5): a player's life total and the power or toughness of the permanent the
 * ability is on swap. Only a player noun and only "~" for the permanent (the lowering reads only that one); the flag `power` says which of the two it is, `toughness` otherwise.
 */
export const EFFECT_EXCHANGE_LIFE_PT = defineRule<Clauses>({
  id: 'effect.exchange-life-pt',
  family: 'effect',
  leading: ['exchange'],
  cites: ['CR 701.12g (Exchange)', 'CR 119.5 (Life)'],
  examples: [
    "exchange target opponent's life total with ~'s toughness",
    "exchange target player's life total with ~'s power",
    'exchange target opponent’s life total with ~’s toughness',
    "exchange your life total with ~'s toughness",
  ],
  rejects: [
    "exchange target opponent's life total with ~'s",
    "exchange target opponent's life total with ~'s loyalty",
    "exchange target opponent's life total with target creature's toughness",
    "exchange target opponent's life with ~'s toughness",
    "exchange target creature's life total with ~'s toughness",
    "exchange your life with ~'s toughness",
    "exchange target opponent's life total with ~'s toughness until end of turn",
    "exchange target opponent's life total with ~'s toughness and draw a card",
  ],
  parse: single(
    'effect.exchange-life-pt',
    map(
      sequence(
        literal('exchange '),
        choice(
          map(
            sequence(
              family<IrNoun>('noun', { only: ['noun.player'] }),
              pattern(/['’]s life total with /iu),
            ),
            ([noun]) => noun,
          ),
          // CR 701.12c: "exchange your life total with ~'s toughness" (Tree of Redemption): the controller.
          (ctx, pos) => {
            const r = spanned(pattern(/your life total with /iu))(ctx, pos);
            if (!r.ok) return r;
            const you: IrNoun = {
              kind: 'noun',
              det: 'you',
              filter: { raw: 'you' },
              upTo: false,
              plural: false,
              other: false,
              span: r.value.span,
              rule: 'effect.exchange-life-pt',
            };
            return { ok: true, value: you, pos: r.pos };
          },
        ),
        spanned(pattern(/~['’]s (?:power|toughness)(?![\p{L}\p{N}])/iu)),
      ),
      ([, player, stat]) => {
        const rule = 'effect.exchange-life-pt';
        const object: IrNoun = {
          kind: 'noun',
          det: 'self',
          filter: { raw: '~' },
          upTo: false,
          plural: false,
          other: false,
          span: { start: stat.span.start, end: stat.span.start + 1 },
          rule,
        };
        const power: IrArg = {
          kind: 'flag',
          value: /power$/iu.test(stat.value[0] ?? ''),
          span: stat.span,
          rule,
        };
        return { player, object, power };
      },
    ),
    ({ player, object, power }) => ({
      verb: 'exchangeLifeWithPt',
      args: { player, object, power },
    }),
  ),
});

export const PLANESWALKER_EFFECT_RULES = [
  EFFECT_EXCHANGE_LIFE_PT,
  EFFECT_DOUBLE_LIFE_TOTAL,
  EFFECT_LIFE_TOTAL_BECOMES,
  EFFECT_COUNT_LIBRARY_LIFE_TOTAL,
  EFFECT_EMPOWER_JACE,
  EFFECT_GET_EMBLEM,
  EFFECT_LEAD_BECOMES_CREATURE,
];
