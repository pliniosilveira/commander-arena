/**
 * Effect rules of the Party Time deck, group "library": the instructions that exile permanents the controller chooses until a permanent leaves, and the looks at another player's
 * library. The lowerings are in `lower/party-time-library.ts`.
 */
import { literal, map, optional, type Parser, pattern, satisfy, sequence } from '../../combinators';
import type { IrFlag, IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { UNTIL_SOURCE_LEAVES } from './angels';
import { type Clauses, single } from './operands';

/** The clauses of a rule that read "you may" themselves are optional (the sentence reader marks the same offer when it strips the words first). */
function asOffer(parser: Parser<Clauses>): Parser<Clauses> {
  return map(parser, (clauses) =>
    clauses.map((c) =>
      c.args.may?.kind === 'flag' && c.args.may.value ? { ...c, optional: true } : c,
    ),
  );
}

const EXILE_ANY_RULE = 'effect.exile-any-number-until-leaves';

/**
 * `effect.exile-any-number-until-leaves`: "you may exile any number of non-Angel creatures you control until ~ leaves the battlefield" (CR 608.2d: the permanents are chosen as the
 * ability resolves, none included; CR 610.3: they return when the permanent with the ability leaves the battlefield). The engine's `moveToZone` into exile of an `anyNumber` choice
 * among the controller's permanents with `until`. Only permanents the controller controls (nobody else's are chosen), and an offer. Not read: a target, "all", "up to", another
 * duration, a permanent an opponent controls, "exile any number of target creatures".
 */
export const EFFECT_EXILE_ANY_NUMBER_UNTIL_LEAVES = defineRule<Clauses>({
  id: EXILE_ANY_RULE,
  family: 'effect',
  leading: ['you', 'exile'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 610.3 (Duration of Continuous Effects)',
    'CR 701.13 (Exile)',
  ],
  examples: [
    'you may exile any number of non-Angel creatures you control until ~ leaves the battlefield',
    'exile any number of creatures you control until ~ leaves the battlefield',
    'you may exile any number of other nonland permanents you control until ~ leaves the battlefield',
  ],
  rejects: [
    'you may exile any number of non-Angel creatures you control',
    'you may exile any number of non-Angel creatures you control until end of turn',
    'you may exile any number of non-Angel creatures an opponent controls until ~ leaves the battlefield',
    'you may exile any number of target creatures you control until ~ leaves the battlefield',
    'you may exile all non-Angel creatures you control until ~ leaves the battlefield',
    'you may exile up to two non-Angel creatures you control until ~ leaves the battlefield',
    'you may exile any number of non-Angel creatures you control until ~ leaves the battlefield and draw a card',
  ],
  parse: asOffer(
    single(
      EXILE_ANY_RULE,
      sequence(
        optional(literal('you may '), null),
        literal('exile '),
        satisfy(
          family<IrNoun>('noun', { only: ['noun.any-number-permanents'] }),
          (n) => n.filter.controller === 'you' && n.anyNumber === true,
        ),
        UNTIL_SOURCE_LEAVES,
        pattern(/(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/u),
      ),
      ([may, , objects]) => {
        const flag: IrFlag = {
          kind: 'flag',
          value: may !== null,
          span: { start: 0, end: 0 },
          rule: EXILE_ANY_RULE,
        };
        return { verb: 'exileAnyNumberUntilLeaves', args: { objects, may: flag } };
      },
    ),
  ),
});

export const PARTY_TIME_LIBRARY_EFFECT_RULES = [EFFECT_EXILE_ANY_NUMBER_UNTIL_LEAVES];
