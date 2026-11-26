/**
 * Effect rules of the Draconic Dissent deck (issue 167) about goad and what is said with it.
 */
import { choice, literal, map, pattern, sequence } from '../../combinators';
import type { IrArg, IrCounterSpec, IrDuration } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { COUNTER_NAME } from './counters';
import { type Clauses, single } from './operands';
import { targetCreatures } from './restrict';

const ID_UNBLOCKABLE = 'effect.restrict-unblockable-until-next-turn';

/**
 * `effect.restrict-unblockable-until-next-turn`: "until your next turn, target creature an opponent controls can't be blocked" (Sly Instigator; CR 509.1b, 611.2a, 611.2c, 500.1): the engine's
 * `restrict` of `cantBeBlocked` until the next turn of the controller of the effect begins, on the creature the target names as the effect resolves. Not read: another duration, "this
 * turn", the duration after the sentence, another restriction, several creatures, a group, "except by".
 */
export const EFFECT_RESTRICT_UNBLOCKABLE_NEXT_TURN = defineRule<Clauses>({
  id: ID_UNBLOCKABLE,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 509.1b (Declare Blockers Step)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 500.1 (Beginning Phase)',
  ],
  examples: [
    "until your next turn, target creature can't be blocked",
    "Until your next turn, target creature an opponent controls can't be blocked",
    'until your next turn, target creature can’t be blocked',
  ],
  rejects: [
    "until end of turn, target creature can't be blocked",
    "target creature can't be blocked until your next turn",
    "until your next turn, target creature can't block",
    "until your next turn, target creatures can't be blocked",
    "until your next turn, target creature can't be blocked this turn",
    "until your next turn, target creature can't be blocked except by creatures with flying",
    "until your next turn target creature can't be blocked",
    "until your next turn, creatures you control can't be blocked",
    "until your next turn, ~ can't be blocked",
    "until your next turn, target creature can't be blocked and draw a card",
  ],
  parse: single(
    ID_UNBLOCKABLE,
    sequence(
      spanned(pattern(/until your next turn(?![\p{L}\p{N}])/iu)),
      literal(', '),
      targetCreatures,
      pattern(/ can['’]t be blocked(?![\p{L}\p{N}])/iu),
    ),
    ([until, , objects]) => {
      const kind: IrArg = {
        kind: 'restrictionKind',
        restriction: 'cantBeBlocked',
        span: until.span,
        rule: ID_UNBLOCKABLE,
      };
      const duration: IrDuration = {
        kind: 'duration',
        scope: 'untilYourNextTurn',
        span: until.span,
        rule: ID_UNBLOCKABLE,
      };
      return { verb: 'restrict', args: { objects, restriction: kind }, duration };
    },
  ),
});

const ID_COUNTERED = 'effect.goad-countered';

/**
 * `effect.goad-countered`: "goad each creature that had a double strike counter put on it this way", "goad each creature that had counters put on it this way" (Spectacular Showdown,
 * Agitator Ant; CR 701.15a, 608.2c, 122.6): each creature the counters of the instruction before it really went on is goaded by the controller of the effect. The engine's `goad` of
 * `putCountersOn`, with the kind of counter when the text names one. Not read: another group ("each creature you control that had ..."), "target", a count of counters other than "a" or
 * a plural, "put on them", "this turn", a duration.
 */
export const EFFECT_GOAD_COUNTERED = defineRule<Clauses>({
  id: ID_COUNTERED,
  family: 'effect',
  leading: ['goad'],
  cites: ['CR 701.15a (Goad)', 'CR 608.2c (Resolving Spells and Abilities)', 'CR 122.6 (Counters)'],
  examples: [
    'goad each creature that had a double strike counter put on it this way',
    'goad each creature that had counters put on it this way',
    'Goad each creature that had a +1/+1 counter put on it this way',
    'goad each creature that had a counter put on it this way',
  ],
  rejects: [
    'goad each creature that had a double strike counter put on it',
    'goad each creature you control that had a double strike counter put on it this way',
    'goad each creature that had two counters put on it this way',
    'goad each creature that had counters put on them this way',
    'goad target creature that had a double strike counter put on it this way',
    'goad each creature that had a double strike counter put on it this way until end of turn',
    'goad each permanent that had counters put on it this way',
    'goad each creature that had a double strike counter removed from it this way',
  ],
  parse: single(
    ID_COUNTERED,
    sequence(
      literal('goad each creature that had '),
      choice(
        // "a double strike counter put on it this way": the kind is named.
        map(
          sequence(
            pattern(/an? /iu),
            spanned(pattern(new RegExp(`(?:${COUNTER_NAME.source})(?= counter put)`, 'iu'))),
            pattern(/ counter put on it this way(?![\p{L}\p{N}])/iu),
          ),
          ([, kind]) => kind,
        ),
        // "a counter put on it this way": counters of any kind.
        map(pattern(/an? counter put on it this way(?![\p{L}\p{N}])/iu), () => undefined),
        // "counters put on it this way".
        map(pattern(/counters put on it this way(?![\p{L}\p{N}])/iu), () => undefined),
      ),
    ),
    ([, kind]) => {
      const args: Record<string, IrArg> = {};
      if (kind !== undefined) {
        const counter: IrCounterSpec = {
          kind: 'counterSpec',
          name: kind.value[0].toLowerCase(),
          span: kind.span,
          rule: ID_COUNTERED,
        };
        args.counter = counter;
      }
      return { verb: 'goadCountered', args };
    },
  ),
});

export const GOAD_DRACONIC_EFFECT_RULES = [
  EFFECT_RESTRICT_UNBLOCKABLE_NEXT_TURN,
  EFFECT_GOAD_COUNTERED,
];
