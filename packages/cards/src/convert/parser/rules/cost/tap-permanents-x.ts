/**
 * Cost of Hazel of the Rootbloom: "Tap X untapped tokens you control" (CR 107.3, 118.3, 605.3b).
 */
import { fail, map, pattern, satisfy } from '../../combinators';
import type { IrCost, IrNoun } from '../../ir/types';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, family } from '../registry';

/**
 * `cost.tap-permanents-x`: "Tap X untapped tokens you control", "Tap X untapped creatures you control" (CR 118.3: the cost taps as many untapped permanents as the player chooses;
 * CR 107.3: X is a number the player chooses, here by naming the permanents, as a mana ability uses no stack to announce one: CR 605.3b; CR 302.6: only a creature's own {T}
 * ability is held back by summoning sickness, so a creature that arrived this turn may be tapped). The permanents are the player's own, so the phrase says "you control"; what kind
 * they are is any plural phrase of the permanent family. "Untapped" is the cost's own word and is not part of the filter. The engine's `tapPermanentsX`, only in a mana ability whose
 * mana is "X mana in any combination of colors" (`lower/activated.ts`). Not read: a number, "another", "an" in place of X, a singular phrase, "up to", a total ("with total power"),
 * a permanent an opponent controls, a phrase with no "untapped".
 */
export const COST_TAP_PERMANENTS_X = defineRule<IrCost>({
  id: 'cost.tap-permanents-x',
  family: 'cost',
  leading: ['tap'],
  cites: [
    'CR 118.3 (Costs)',
    'CR 107.3 (Variables)',
    'CR 605.3b (Mana Abilities)',
    'CR 302.6 (Summoning Sickness)',
  ],
  examples: [
    'Tap X untapped tokens you control',
    'Tap X untapped creatures you control',
    'Tap X untapped Elves you control',
  ],
  rejects: [
    'Tap X',
    'Tap X tokens you control',
    'Tap X untapped tokens',
    'Tap X untapped tokens an opponent controls',
    'Tap X untapped token you control',
    'Tap two untapped tokens you control',
    'Tap an untapped token you control',
    'Tap another untapped creature you control',
    'Tap up to X untapped tokens you control',
    'Tap X untapped creatures you control with total power 4 or greater',
    'Tap X untapped tokens you control and',
    'Tap target creature',
    'Tap ~',
  ],
  parse: (ctx, pos) => {
    const lead = pattern(/tap X untapped /iu)(ctx, pos);
    if (!lead.ok) return lead;
    // "tokens you control" and "creature tokens you control" are the noun rule of the token group; any other plural phrase is a phrase of the permanent family.
    const tokens = family<IrNoun>('noun', { only: ['noun.token-permanents'] })(ctx, lead.pos);
    let noun: IrNoun;
    let end: number;
    if (tokens.ok) {
      noun = { ...tokens.value, rule: 'cost.tap-permanents-x' };
      end = tokens.pos;
    } else {
      const phrase = satisfy(
        map(permanentPhrase(true, 'all'), withoutZone),
        (filter) => filter.controller === 'you',
      )(ctx, lead.pos);
      if (!phrase.ok) return phrase;
      if (phrase.value.anyOf !== undefined) return fail(ctx, pos);
      noun = {
        kind: 'noun',
        det: 'a',
        filter: phrase.value,
        upTo: false,
        plural: true,
        other: false,
        span: { start: lead.pos, end: phrase.pos },
        rule: 'cost.tap-permanents-x',
      };
      end = phrase.pos;
    }
    return {
      ok: true,
      value: {
        kind: 'tapPermanentsX',
        what: noun,
        span: { start: pos, end },
        rule: 'cost.tap-permanents-x',
      },
      pos: end,
    };
  },
});

export const TAP_PERMANENTS_X_COST_RULES = [COST_TAP_PERMANENTS_X];
