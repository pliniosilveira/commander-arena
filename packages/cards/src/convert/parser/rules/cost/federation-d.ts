/**
 * Cost of group D of the Federation Fleet deck, Ensign Harry Kim, Operations: "Remove two +1/+1 counters from among creatures you control" (CR 118.3, 122.1).
 */
import { fail, pattern, satisfy } from '../../combinators';
import type { IrCost, IrNoun } from '../../ir/types';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule } from '../registry';

const NUMBER_WORDS: ReadonlyMap<string, number> = new Map([
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
]);

/**
 * `cost.remove-counters-among`: "Remove two +1/+1 counters from among creatures you control", "Remove a +1/+1 counter from among creatures you control" (CR 118.3: a cost can't be paid
 * unless the whole of it can; CR 122.1: counters on permanents; CR 602.2: the cost is paid as the ability is activated). The counters come off the permanents the player controls that
 * the phrase names, the player choosing which permanent gives each one. The engine's `removeCounters` with `among`, the cost of an ordinary activated ability. Not read: "~" alone (that
 * is `cost.remove-counters`), "X", "all", "any number", one permanent ("from a creature you control"), "target", a permanent an opponent controls, the singular noun, a counter with no
 * kind.
 */
export const COST_REMOVE_COUNTERS_AMONG = defineRule<IrCost>({
  id: 'cost.remove-counters-among',
  family: 'cost',
  leading: ['remove'],
  cites: ['CR 118.3 (Costs)', 'CR 122.1 (Counters)', 'CR 602.2 (Activating Activated Abilities)'],
  examples: [
    'Remove two +1/+1 counters from among creatures you control',
    'Remove a +1/+1 counter from among creatures you control',
    'Remove three charge counters from among artifacts you control',
    'Remove two +1/+1 counters from among permanents you control',
  ],
  rejects: [
    'Remove two +1/+1 counters from ~',
    'Remove a +1/+1 counter from a creature you control',
    'Remove two counters from among creatures you control',
    'Remove X +1/+1 counters from among creatures you control',
    'Remove all +1/+1 counters from among creatures you control',
    'Remove any number of +1/+1 counters from among creatures you control',
    'Remove two +1/+1 counters from among target creatures',
    'Remove two +1/+1 counters from among creatures your opponents control',
    'Remove two +1/+1 counters from among creatures',
    'Remove two +1/+1 counters from among creature you control',
    'Remove two +1/+1 counters from among creatures you control and',
    'Remove zero +1/+1 counters from among creatures you control',
    'Remove a +1/+1 counters from among creatures you control',
    'Remove two +1/+1 counter from among creatures you control',
  ],
  parse: (ctx, pos) => {
    const head = pattern(
      /remove (an?|\d+|one|two|three|four|five|six|seven|eight|nine|ten) ([+-]\d+\/[+-]\d+|first strike|double strike|[a-z]+) (counters?) from among /iu,
    )(ctx, pos);
    if (!head.ok) return head;
    const word = (head.value[1] ?? '').toLowerCase();
    const count = word === 'a' || word === 'an' ? 1 : (NUMBER_WORDS.get(word) ?? Number(word));
    // "a +1/+1 counter" is one counter and "two +1/+1 counters" is more: the noun's number follows the count.
    const plural = (head.value[3] ?? '').toLowerCase() === 'counters';
    if (!Number.isSafeInteger(count) || count < 1 || plural !== (count !== 1)) {
      return fail(ctx, pos);
    }
    const phrase = satisfy(
      permanentPhrase(true, 'all'),
      (filter) => filter.controller === 'you' && filter.anyOf === undefined,
    )(ctx, head.pos);
    if (!phrase.ok) return phrase;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: withoutZone(phrase.value),
      upTo: false,
      plural: true,
      other: false,
      span: { start: head.pos, end: phrase.pos },
      rule: 'cost.remove-counters-among',
    };
    return {
      ok: true,
      value: {
        kind: 'removeCountersAmong',
        counter: (head.value[2] ?? '').toLowerCase(),
        count,
        what: noun,
        span: { start: pos, end: phrase.pos },
        rule: 'cost.remove-counters-among',
      },
      pos: phrase.pos,
    };
  },
});

export const FEDERATION_D_COST_RULES = [COST_REMOVE_COUNTERS_AMONG];
