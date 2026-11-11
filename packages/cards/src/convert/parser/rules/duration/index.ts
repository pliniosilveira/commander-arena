/**
 * Duration rules: how long a continuous effect lasts (CR 611.2). A duration is the tail of a
 * clause ("~ gets +1/+1 until end of turn"); the clause carries it as `IrClause.duration`, and the
 * lowering of the verb says whether the engine can run it (`duration:<scope>` in `needs`).
 */
import { literal, map } from '../../combinators';
import type { IrDuration } from '../../ir/types';
import { defineRule, node } from '../registry';

/**
 * `duration.until-end-of-turn`: "until end of turn" (CR 611.2a: a continuous effect from a
 * resolving spell or ability lasts as long as it states; CR 514.2: "until end of turn" effects end
 * in the cleanup step).
 */
export const DURATION_UNTIL_END_OF_TURN = defineRule<IrDuration>({
  id: 'duration.until-end-of-turn',
  family: 'duration',
  leading: ['until'],
  cites: ['CR 611.2a (Continuous Effects)', 'CR 514.2 (Cleanup Step)'],
  examples: ['until end of turn', 'Until end of turn'],
  rejects: [
    'until end of turn.',
    'until the end of turn',
    'until your next turn',
    'until end of combat',
    'for as long as you control ~',
  ],
  parse: node<string, IrDuration>(
    'duration.until-end-of-turn',
    map(literal('until end of turn'), (raw) => raw),
    () => ({ kind: 'duration', scope: 'untilEndOfTurn' }),
  ),
});

export const DURATION_RULES = [DURATION_UNTIL_END_OF_TURN];
