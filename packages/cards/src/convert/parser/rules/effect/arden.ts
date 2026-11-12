/**
 * Effect rules of the dice (D-941, CR 706): the instruction "roll a four-sided die". One die, rolled by the controller; the result is read by the
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

export const ARDEN_EFFECT_RULES = [EFFECT_ROLL_DIE].map(quietly);
