/**
 * Cost of the Hatsune Miku deck (issue 145), Halo Fountain: "Untap two tapped creatures you control" (CR 701.26b, 118.3).
 */
import { choice, fail, literal, map, pattern, satisfy } from '../../combinators';
import type { IrCost, IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, spanned } from '../registry';

/**
 * `cost.untap-permanents`: "Untap a tapped creature you control", "Untap two tapped creatures you control", "Untap fifteen tapped creatures you control" (CR 701.26b: only a tapped
 * permanent can be untapped; CR 118.3: a cost can't be paid unless the whole of it can; CR 602.2: the cost is paid as the ability is activated; CR 302.6: only a creature's own {T}
 * ability is held back by summoning sickness, so a creature that arrived this turn may be untapped). The permanents are the player's own, so the phrase says "you control"; what kind
 * they are is any phrase of the permanent family. "Tapped" is the cost's own word (the permanents untapped are tapped ones) and is not part of the filter. The engine's
 * `untapPermanents`, paid after the mana. Not read: "Untap ~" (`{Q}`), "another", "one" (the article says it), "X", a total ("with total power"), a permanent an opponent controls,
 * a phrase with no "tapped".
 */
export const COST_UNTAP_PERMANENTS = defineRule<IrCost>({
  id: 'cost.untap-permanents',
  family: 'cost',
  leading: ['untap'],
  cites: [
    'CR 701.26b (Tap and Untap)',
    'CR 118.3 (Costs)',
    'CR 602.2 (Activating Activated Abilities)',
    'CR 302.6 (Summoning Sickness)',
  ],
  examples: [
    'Untap a tapped creature you control',
    'Untap two tapped creatures you control',
    'Untap fifteen tapped creatures you control',
    'Untap three tapped Elves you control',
    'Untap a tapped artifact you control',
  ],
  rejects: [
    'Untap',
    'Untap ~',
    'Untap a creature you control',
    'Untap two creatures you control',
    'Untap a tapped creature',
    'Untap a tapped creature an opponent controls',
    'Untap another tapped creature you control',
    'Untap one tapped creature you control',
    'Untap X tapped creatures you control',
    'Untap a tapped creatures you control',
    'Untap two tapped creature you control',
    'Untap two tapped creatures you control with total power 4 or greater',
    'Untap two tapped creatures you control and',
    'Untap target creature',
  ],
  parse: (ctx, pos) => {
    const lead = literal('untap ')(ctx, pos);
    if (!lead.ok) return lead;
    const howMany = choice(
      map(spanned(satisfy(quantity, (n) => n >= 2)), ({ value, span }) => ({
        count: value,
        plural: true,
        span,
      })),
      map(spanned(pattern(/an? /i)), ({ span }) => ({ count: 1, plural: false, span })),
    )(ctx, lead.pos);
    if (!howMany.ok) return howMany;
    const { count, plural, span } = howMany.value;
    // "two tapped": the space is before the word; "a " and "an " end in it.
    const word = pattern(/ ?tapped /iu)(ctx, howMany.pos);
    if (!word.ok) return word;
    const phrase = satisfy(
      map(permanentPhrase(plural, 'all'), withoutZone),
      (filter) => filter.controller === 'you',
    )(ctx, word.pos);
    if (!phrase.ok) return phrase;
    if (phrase.value.anyOf !== undefined) return fail(ctx, pos);
    const noun: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: phrase.value,
      upTo: false,
      plural,
      other: false,
      ...(plural ? { count: { kind: 'number' as const, value: count, span } } : {}),
      span: { start: word.pos, end: phrase.pos },
      rule: 'cost.untap-permanents',
    };
    return {
      ok: true,
      value: {
        kind: 'untapPermanents',
        what: noun,
        count,
        span: { start: pos, end: phrase.pos },
        rule: 'cost.untap-permanents',
      },
      pos: phrase.pos,
    };
  },
});

export const UNTAP_PERMANENTS_COST_RULES = [COST_UNTAP_PERMANENTS];
