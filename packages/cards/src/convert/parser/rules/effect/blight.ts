/**
 * Effect rule of the Lorwyn Eclipsed keyword action "blight" (CR 701.68a): "blight 1" as an instruction ("At the beginning of your end step, draw a card and blight 1."). The
 * controller puts that many -1/-1 counters on a creature they control; the engine runs `blight` (`rules/blight-effect.ts`). The cost forms (an additional cost to cast a spell,
 * the cost of Ward, the cost of an activated ability) are `cost.blight`.
 */
import { literal, type Parser, satisfy, sequence } from '../../combinators';
import type { IrArg } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.blight';

/** The number of counters: a whole number of at least one, as digits or a word (Oracle text writes digits). */
const COUNTERS: Parser<IrArg> = satisfy(
  family<IrArg>('amount', { only: ['amount.number'] }),
  (a) => a.kind === 'number' && a.value >= 1,
);

/**
 * `effect.blight`: "blight 1", "blight 2" (CR 701.68a: to blight N is to put N -1/-1 counters on a creature you control; CR 701.68b: a player with no such creature can't). Not
 * read: "blight X", "blight 0", "blight" alone, "blight 1 creature", "blights 1", "blight it" and "target player blights 1" (the player who blights is the controller).
 */
export const EFFECT_BLIGHT = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['blight'],
  cites: ['CR 701.68a (Blight)', 'CR 701.68b (Blight)'],
  examples: ['blight 1', 'Blight 2', 'blight 3'],
  rejects: [
    'blight X',
    'blight 0',
    'blight',
    'blight a',
    'blight 1 creature',
    'blight 1 time',
    'blights 1',
    'blighted 1',
    'blight it',
    'target player blights 1',
    'you may blight 1',
  ],
  parse: single(ID, sequence(literal('blight '), COUNTERS), ([, count]) => ({
    verb: 'blight',
    args: { count },
  })),
});

export const BLIGHT_EFFECT_RULES = [EFFECT_BLIGHT].map(quietly);
