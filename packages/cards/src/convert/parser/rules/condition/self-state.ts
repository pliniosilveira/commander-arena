/**
 * Conditions about the controller and about the permanent itself (stage P29, D-133): "you control your commander"
 * (CR 903.3), "you have 30 or more life" and "you have at least 7 life more than your starting life total" (CR 119.1,
 * 903.7), "it's untapped" (CR 701.26). They are read after "as long as" of a static ability (CR 611.3a) and, like every
 * condition, after the "if" of an intervening "if" (CR 603.4) and of "Activate only if" (CR 602.5b). The engine reads
 * them where no layer 7 effect can change them (CR 613.8), which is why a condition on a power or a keyword is not here.
 */
import { choice, literal, map, type Parser, pattern, satisfy, sequence } from '../../combinators';
import type { IrComparison, IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, spanned } from '../registry';

function condition(
  rule: string,
  start: number,
  end: number,
  test: IrCondition['test'],
): IrCondition {
  return { kind: 'condition', test, span: { start, end }, rule };
}

/**
 * `condition.control-your-commander`: "you control your commander" (CR 903.3: a commander is a card its owner designated;
 * a commander of another player that you control is not "your commander"). A commander that is in the command zone is
 * not controlled. The engine's `controlCommander` with `yours`.
 */
export const CONDITION_CONTROL_YOUR_COMMANDER = defineRule<IrCondition>({
  id: 'condition.control-your-commander',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 903.3 (Commander)', 'CR 903.3d (Commander)', 'CR 611.3a (Continuous Effects)'],
  examples: ['you control your commander'],
  rejects: [
    'you control a commander',
    'you control commander',
    'you control your commanders',
    'you control your commander.',
    'you control your commander or a creature',
    'an opponent controls your commander',
    'you cast your commander',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you control your commander(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: condition('condition.control-your-commander', pos, r.pos, {
        kind: 'controlCommander',
        yours: true,
      }),
      pos: r.pos,
    };
  },
});

/** The number of life points: digits or a number word, one or more. */
const POINTS: Parser<number> = satisfy(quantity, (n) => n >= 1);

/**
 * "at least 7 life", "7 or more life", "7 or less life", "7 or fewer life" and, after "life", "more than your starting
 * life total": the comparison of a life total and whether it is the difference from the starting one.
 */
interface LifeCompare {
  readonly compare: IrComparison;
  readonly aboveStarting: boolean;
}

const LIFE_COMPARE: Parser<LifeCompare> = choice<LifeCompare>(
  map(
    sequence(literal('at least '), POINTS, literal(' life more than your starting life total')),
    ([, value]) => ({ compare: { cmp: 'atLeast' as const, value }, aboveStarting: true }),
  ),
  map(sequence(literal('at least '), POINTS, literal(' life')), ([, value]) => ({
    compare: { cmp: 'atLeast' as const, value },
    aboveStarting: false,
  })),
  map(sequence(POINTS, pattern(/ or (more|less|fewer) life/iu)), ([value, word]) => ({
    compare: {
      cmp: (word[1] ?? '').toLowerCase() === 'more' ? ('atLeast' as const) : ('atMost' as const),
      value,
    },
    aboveStarting: false,
  })),
);

/**
 * `condition.life-total`: "you have 30 or more life", "you have at least 30 life", "you have 5 or less life", "you have
 * at least 7 life more than your starting life total" (CR 119.1: a player's life total, CR 903.7: each player starts
 * the game with 40 life in Commander; the engine reads the starting life total of the game). The number is a whole number
 * of 1 or more. "More life than each opponent" and "life equal to" are other tests.
 */
export const CONDITION_LIFE_TOTAL = defineRule<IrCondition>({
  id: 'condition.life-total',
  family: 'condition',
  leading: ['you', 'an'],
  cites: ['CR 119.1 (Life)', 'CR 903.7 (Commander)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    'you have 30 or more life',
    'an opponent has 10 or less life',
    'you have at least 30 life',
    'you have five or less life',
    'you have 5 or fewer life',
    'you have at least 7 life more than your starting life total',
    'you have at least seven life more than your starting life total',
  ],
  rejects: [
    'you have 30 life',
    'you have 30 or more',
    'you have more life than each opponent',
    'you have at least 7 life more than your starting life',
    'you have 0 or more life',
    'you have at most 30 life',
    'each opponent has 30 or more life',
    'you have 30 or more life.',
    'you have seven or more creature cards in your graveyard',
    'you have at least 7 life more than your starting life total or more',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(choice(literal('you have '), literal('an opponent has ')), LIFE_COMPARE),
    )(ctx, pos);
    if (!r.ok) return r;
    const { compare, aboveStarting } = r.value.value[1];
    return {
      ok: true,
      value: condition('condition.life-total', pos, r.pos, {
        kind: 'lifeTotal',
        compare,
        ...(r.value.value[0].toLowerCase().startsWith('an ') ? { player: 'opponent' as const } : {}),
        ...(aboveStarting ? { aboveStarting: true as const } : {}),
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.this-tapped`: "~ is untapped", "it's untapped", "it is untapped", "~ is tapped" (CR 701.26: a permanent is
 * tapped or untapped). The permanent is the one the ability is on: `~`, or "it" in an ability about itself. The engine's
 * `thisMatches` with the tapped status, read each time the effects of the permanent are worked out.
 */
export const CONDITION_THIS_TAPPED = defineRule<IrCondition>({
  id: 'condition.this-tapped',
  family: 'condition',
  leading: ['~', 'it', 'it’s', "it's"],
  cites: ['CR 701.26 (Tap and Untap)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    '~ is untapped',
    "it's untapped",
    'it’s untapped',
    'it is untapped',
    '~ is tapped',
    "it's tapped",
  ],
  rejects: [
    '~ is untapped.',
    'it untapped',
    '~ untapped',
    "it's not untapped",
    '~ is a creature',
    'target creature is untapped',
    'another creature is untapped',
    '~ is untapped or tapped',
    "it's untapped and tapped",
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/(~|it)(?: is|['’]s) (untapped|tapped)(?![\p{L}\p{N}])/iu))(ctx, pos);
    if (!r.ok) return r;
    const who = (r.value.value[1] ?? '').toLowerCase() === '~' ? 'self' : 'it';
    const tapped = (r.value.value[2] ?? '').toLowerCase() === 'tapped';
    return {
      ok: true,
      value: condition('condition.this-tapped', pos, r.pos, {
        kind: 'thisMatches',
        filter: { tapped, raw: r.value.value[0] },
        who,
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.attached-to`: "~ is attached to a creature", "it's attached to a creature" (CR 301.5, 303.4: an Equipment or an Aura is attached to a
 * permanent). The permanent is the one the ability is on, the host a creature: the engine's `objectMatches` of the permanent it is attached to.
 * Read as the condition of a static ability ("As long as this Equipment is attached to a creature, ..."). Not read: another kind of host,
 * "enchanted", "equipped" and a negative ("isn't attached").
 */
export const CONDITION_ATTACHED_TO = defineRule<IrCondition>({
  id: 'condition.attached-to',
  family: 'condition',
  leading: ['~', 'it', 'it’s', "it's"],
  cites: ['CR 301.5 (Equipment)', 'CR 303.4 (Aura)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    '~ is attached to a creature',
    "it's attached to a creature",
    'it is attached to a creature',
    'it’s attached to a creature',
  ],
  rejects: [
    '~ is attached to a creature.',
    '~ is attached to a land',
    '~ is attached to an creature',
    '~ is attached to target creature',
    '~ is attached to creature',
    "~ isn't attached to a creature",
    '~ is attached',
    'target Equipment is attached to a creature',
    '~ is attached to a creature you control',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/(~|it)(?: is|['’]s) attached to a creature(?![\p{L}\p{N}])(?! you control)/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: condition('condition.attached-to', pos, r.pos, {
        kind: 'attachedTo',
        filter: { types: ['creature'], raw: 'a creature' },
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.paired`: "~ is paired with another creature", "it's paired with another creature" (CR 702.95b: a creature becomes paired with another as the result of a
 * soulbond ability; abilities may refer to whether a creature is paired). The permanent is the one the ability is on: `~`, or "it" in an ability about itself. The engine's
 * `paired`. Not read: another kind of partner ("a Human"), "isn't paired", "is paired" alone, "unpaired" and a pair of another permanent.
 */
export const CONDITION_PAIRED = defineRule<IrCondition>({
  id: 'condition.paired',
  family: 'condition',
  leading: ['~', 'it', 'it’s', "it's"],
  cites: ['CR 702.95b (Soulbond)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    '~ is paired with another creature',
    'it is paired with another creature',
    "it's paired with another creature",
    'it’s paired with another creature',
  ],
  rejects: [
    '~ is paired with another creature.',
    '~ is paired',
    '~ is paired with a creature',
    '~ is paired with another Human',
    '~ is paired with another creature you control',
    "~ isn't paired with another creature",
    '~ is unpaired',
    'another creature is paired with another creature',
    'target creature is paired with another creature',
    '~ is paired with another creatures',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/(~|it)(?: is|['’]s) paired with another creature(?![\p{L}\p{N}])(?! you control)/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const who = (r.value.value[1] ?? '').toLowerCase() === '~' ? 'self' : 'it';
    return {
      ok: true,
      value: condition('condition.paired', pos, r.pos, { kind: 'paired', who }),
      pos: r.pos,
    };
  },
});

export const SELF_STATE_CONDITION_RULES = [
  CONDITION_CONTROL_YOUR_COMMANDER,
  CONDITION_LIFE_TOTAL,
  CONDITION_THIS_TAPPED,
  CONDITION_ATTACHED_TO,
  CONDITION_PAIRED,
];
