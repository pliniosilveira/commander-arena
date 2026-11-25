/**
 * Effect rules of the dice (D-271, CR 706): the instruction "roll a four-sided die". One die, rolled by the controller; the result is read by the
 * sentences after it ("If the result is 1, ..."), which the lowering joins to the roll.
 */
import { fail, pattern } from '../../combinators';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/** The sizes the number word of "a six-sided die" can name; any other size is written "a d7" or with digits. */
const SIDE_WORDS: Readonly<Record<string, number>> = {
  two: 2,
  four: 4,
  six: 6,
  eight: 8,
  ten: 10,
  twelve: 12,
  twenty: 20,
};

/** The most sides the engine rolls: a die is one draw of its seeded generator, which takes a bound up to 2^32. */
const MOST_SIDES = 4294967296;

/**
 * `effect.roll-die`: "roll a four-sided die", "roll a six-sided die", "roll an eight-sided die", "roll a d20" (CR 706.1, 706.1a: a die of N sides has N
 * equally likely outcomes numbered 1 to N). One die, rolled by the controller of the ability. "Roll two dice", "roll a die" (no size), "each player rolls",
 * a roll with a modifier or a reroll, "roll a d20 twice" and a die of fewer than two sides are other instructions and are not read.
 */
export const EFFECT_ROLL_DIE = defineRule<Clauses>({
  id: 'effect.roll-die',
  family: 'effect',
  leading: ['roll'],
  cites: [
    'CR 706.1 (Rolling a Die)',
    'CR 706.1a (Rolling a Die)',
    'CR 706.2 (Rolling a Die)',
    'CR 706.3b (Rolling a Die)',
  ],
  examples: [
    'roll a four-sided die',
    'Roll a six-sided die',
    'roll an eight-sided die',
    'roll a twenty-sided die',
    'roll a d20',
    'roll a d6',
    'roll a d100',
    'roll a 12-sided die',
  ],
  rejects: [
    'roll a die',
    'roll two dice',
    'roll two four-sided dice',
    'roll a four-sided die twice',
    'roll a d20 twice',
    'roll a d1',
    'roll a d0',
    'roll a one-sided die',
    'roll a 1-sided die',
    'roll an four-sided die',
    'roll a eight-sided die',
    'roll a four sided die',
    'roll a four-sided die and add 2',
    'roll a d',
    'roll a d20x',
    'roll a four-sided',
    'roll a d99999999999',
    'rolls a four-sided die',
    'you roll a four-sided die',
    'reroll a four-sided die',
    'roll the die',
    'roll another die',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `roll (?:a d(\\d+)|a (\\d+|two|four|six|ten|twelve|twenty)-sided die|an (eight)-sided die)${BOUNDARY}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { value: match, span } = r.value;
    const written = (match[1] ?? match[2] ?? match[3] ?? '').toLowerCase();
    const sides = /^\d+$/u.test(written) ? Number(written) : SIDE_WORDS[written];
    if (sides === undefined || sides < 2 || sides > MOST_SIDES) {
      return fail(ctx, pos);
    }
    return {
      ok: true,
      value: [
        makeClause(
          'effect.roll-die',
          'roll',
          { sides: { kind: 'number', value: sides, span } },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.clash`: "clash with an opponent" (CR 701.30, 701.30b: choose an opponent; you and that opponent each reveal the top card of their library and may put it on the bottom, and
 * whoever revealed the card with the higher mana value wins). The controller clashes; "each player clashes", "clash with target opponent" and "clashes" are other instructions and are
 * not read. Who won is read by the sentence after it ("If you win, ...", `condition.you-win-clash`).
 */
export const EFFECT_CLASH = defineRule<Clauses>({
  id: 'effect.clash',
  family: 'effect',
  leading: ['clash'],
  cites: ['CR 701.30 (Clash)', 'CR 701.30b (Clash)'],
  examples: ['clash with an opponent', 'Clash with an opponent'],
  rejects: [
    'clash with target opponent',
    'clash with each opponent',
    'clash with a player',
    'clash',
    'clashes with an opponent',
    'each player clashes',
    'clash with an opponent and draw a card',
    'clash with an opponents',
    'clash with an opponent twice',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(new RegExp(`clash with an opponent${BOUNDARY}`, 'iu')))(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause('effect.clash', 'clash', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.flip-coin`: "flip a coin" (CR 705.2: for an effect that does not only care about heads or tails, the player who flips calls heads or tails and wins the flip when the
 * call matches the result; "whenever you win a coin flip" reads it). The controller flips one coin. Not read: another number of coins ("flip two coins"), another player ("target
 * opponent flips a coin", "each player flips a coin"), "flip a coin until", a stated result or caller, and the rest of a sentence.
 */
export const EFFECT_FLIP_COIN = defineRule<Clauses>({
  id: 'effect.flip-coin',
  family: 'effect',
  leading: ['flip'],
  cites: ['CR 705.1 (Flipping a Coin)', 'CR 705.2 (Flipping a Coin)'],
  examples: ['flip a coin', 'Flip a coin'],
  rejects: [
    'flip two coins',
    'flip a coin until you lose a flip',
    'flip a coin and draw a card',
    'flip coins',
    'flips a coin',
    'each player flips a coin',
    'flip',
    'flip a',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(new RegExp(`flip a coin${BOUNDARY}(?! and\\b| until\\b)`, 'iu')))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause('effect.flip-coin', 'flipCoin', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.each-player-rolls-bar-highest`: "each player rolls a d20. If one or more opponents had the highest result, ~ can't attack those players or planeswalkers they control this
 * combat." (CR 706.1, 706.2, 508.1a, 511.3: Chaos Dragon). Two sentences that `segment.ts` keeps together; the creature is the card itself. The engine's `eachPlayerRollsBarHighest`.
 * Not read: another creature, another duration than this combat, "each opponent rolls", a roll without a size, "a die".
 */
export const EFFECT_EACH_PLAYER_ROLLS_BAR_HIGHEST = defineRule<Clauses>({
  id: 'effect.each-player-rolls-bar-highest',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 706.1 (Rolling a Die)',
    'CR 706.2 (Rolling a Die)',
    'CR 508.1a (Declare Attackers Step)',
    'CR 511.3 (End of Combat Step)',
  ],
  examples: [
    "each player rolls a d20. If one or more opponents had the highest result, ~ can't attack those players or planeswalkers they control this combat",
    'Each player rolls a d6. If one or more opponents had the highest result, ~ can’t attack those players or planeswalkers they control this combat',
  ],
  rejects: [
    'each player rolls a d20',
    "each player rolls a d20. If one or more opponents had the highest result, ~ can't attack those players or planeswalkers they control this turn",
    "each player rolls a d20. If one or more opponents had the highest result, target creature can't attack those players or planeswalkers they control this combat",
    "each opponent rolls a d20. If one or more opponents had the highest result, ~ can't attack those players or planeswalkers they control this combat",
    "each player rolls a die. If one or more opponents had the highest result, ~ can't attack those players or planeswalkers they control this combat",
    "each player rolls a d1. If one or more opponents had the highest result, ~ can't attack those players or planeswalkers they control this combat",
    "each player rolls a d20. If one or more opponents had the highest result, ~ can't attack those players this combat",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `each player rolls a d(\\d+)\\. if one or more opponents had the highest result, ~ can['’]t attack those players or planeswalkers they control this combat${BOUNDARY}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { value: match, span } = r.value;
    const sides = Number(match[1]);
    if (!(sides >= 2 && sides <= MOST_SIDES)) return fail(ctx, pos);
    return {
      ok: true,
      value: [
        makeClause(
          'effect.each-player-rolls-bar-highest',
          'eachPlayerRollsBarHighest',
          { sides: { kind: 'number', value: sides, span } },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

export const ARDEN_EFFECT_RULES = [
  EFFECT_ROLL_DIE,
  EFFECT_CLASH,
  EFFECT_FLIP_COIN,
  EFFECT_EACH_PLAYER_ROLLS_BAR_HIGHEST,
].map(quietly);
