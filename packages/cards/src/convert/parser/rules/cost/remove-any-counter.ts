/**
 * Cost of the Counter Blitz deck (O'aka, Traveling Merchant; Scholar of New Horizons): "Remove a counter from a nonland permanent you control" (CR 118.3, 122.1, 602.2b).
 */
import { pattern, satisfy } from '../../combinators';
import type { IrCost, IrNoun } from '../../ir/types';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule } from '../registry';

const ID = 'cost.remove-any-counter';

/**
 * `cost.remove-any-counter`: "Remove a counter from a nonland permanent you control", "Remove a counter from a permanent you control" (CR 118.3: a cost can't be paid unless the
 * whole of it can; CR 122.1: counters on permanents; CR 602.2b: the cost is paid as the ability is activated). One counter of any kind comes off one permanent the player controls
 * that the phrase names; the player chooses the permanent and the kind. The engine's `removeCounters` with `among` and `anyKind`, the cost of an ordinary activated ability. Not
 * read: "~" alone (that is `cost.remove-counters`), a kind of counter ("a +1/+1 counter", `cost.remove-counters-among`), a number other than one, "target", a permanent an opponent
 * controls, a permanent with no controller, a plural noun.
 */
export const COST_REMOVE_ANY_COUNTER = defineRule<IrCost>({
  id: ID,
  family: 'cost',
  leading: ['remove'],
  cites: ['CR 118.3 (Costs)', 'CR 122.1 (Counters)', 'CR 602.2b (Activating Activated Abilities)'],
  examples: [
    'Remove a counter from a nonland permanent you control',
    'Remove a counter from a permanent you control',
    'Remove a counter from a creature you control',
  ],
  rejects: [
    'Remove a counter from ~',
    'Remove a +1/+1 counter from a permanent you control',
    'Remove two counters from a permanent you control',
    'Remove a counter from target permanent you control',
    'Remove a counter from a permanent',
    'Remove a counter from a permanent an opponent controls',
    'Remove a counter from permanents you control',
    'Remove a counter from among permanents you control',
    'Remove a counter from a permanent you control and',
    'Remove counter from a permanent you control',
  ],
  parse: (ctx, pos) => {
    const head = pattern(/remove a counter from (?=an? )/iu)(ctx, pos);
    if (!head.ok) return head;
    const article = pattern(/an? /iu)(ctx, head.pos);
    if (!article.ok) return article;
    const phrase = satisfy(
      permanentPhrase(false, 'all'),
      (filter) => filter.controller === 'you' && filter.anyOf === undefined,
    )(ctx, article.pos);
    if (!phrase.ok) return phrase;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: withoutZone(phrase.value),
      upTo: false,
      plural: false,
      other: false,
      span: { start: article.pos, end: phrase.pos },
      rule: ID,
    };
    return {
      ok: true,
      value: {
        kind: 'removeCountersAmong',
        counter: '',
        count: 1,
        anyKind: true,
        what: noun,
        span: { start: pos, end: phrase.pos },
        rule: ID,
      },
      pos: phrase.pos,
    };
  },
});

export const REMOVE_ANY_COUNTER_COST_RULES = [COST_REMOVE_ANY_COUNTER];
