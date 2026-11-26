/**
 * Effect rules of the counters a card has in exile (Mari, the Killing Quill; CR 122.1: counters stay on a card in exile): "exile it with a hit counter on it" and "remove a hit counter from a
 * card that player owns in exile". The engine runs the first as `exile` followed by `addCounters` on the card it exiled (`moved`) and the second as `removeChosenCounters` of the cards in
 * exile (`rules/counter-pick.ts`).
 */
import { pattern, sequence } from '../../combinators';
import type { IrCounterSpec, IrNoun } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const EXILE_ID = 'effect.exile-it-with-counter';
const REMOVE_ID = 'effect.remove-counter-from-owned-exiled-card';

/**
 * `effect.exile-it-with-counter`: "exile it with a hit counter on it" (CR 608.2c, 406.1, 122.1: the card is exiled and one counter of the kind is put on it, the card the pronoun names, the
 * one a trigger about a permanent dying is about). The kind of counter is one word. Not read: a number of counters, "them", a target, another zone, a trailing clause, "with" without a
 * counter, "on it" missing.
 */
export const EFFECT_EXILE_IT_WITH_COUNTER = defineRule<Clauses>({
  id: EXILE_ID,
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 406.1 (Exile)',
    'CR 122.1 (Counters)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 400.7 (Zone Changes)',
  ],
  examples: [
    'exile it with a hit counter on it',
    'exile it with a void counter on it',
    'exile it with an ink counter on it',
  ],
  rejects: [
    'exile it with two hit counters on it',
    'exile them with a hit counter on each of them',
    'exile target creature with a hit counter on it',
    'exile it with a hit counter',
    'exile it with a +1/+1 counter on it',
    'exile it',
    'exile it with a hit counter on it and draw a card',
    'exile it with a hit counter on them',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        pattern(/exile /iu),
        family<IrNoun>('noun', { only: ['noun.it'] }),
        pattern(/ with an? (\p{L}+) counter on it(?=\.|$)/iu),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, objects, tail] = r.value.value;
    const counter: IrCounterSpec = {
      kind: 'counterSpec',
      name: (tail[1] ?? '').toLowerCase(),
      span: r.value.span,
      rule: EXILE_ID,
    };
    return {
      ok: true,
      value: [makeClause(EXILE_ID, 'exileWithCounter', { objects, counter }, r.value.span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.remove-counter-from-owned-exiled-card`: "remove a hit counter from a card that player owns in exile" (CR 122.1, 108.3, 406.1: the controller chooses one of the cards the player
 * the trigger is about owns in exile that has a counter of the kind, and takes the counter off it). "That player" is a pronoun left to the binding pass. The engine's `removeChosenCounters`
 * of those cards with one counter at most, so a controller who may do it can decline. Not read: a number of counters, "any number", "target", "you own", "an opponent owns", a card in
 * another zone, a trailing clause.
 */
export const EFFECT_REMOVE_COUNTER_FROM_OWNED_EXILED_CARD = defineRule<Clauses>({
  id: REMOVE_ID,
  family: 'effect',
  leading: ['remove'],
  cites: [
    'CR 122.1 (Counters)',
    'CR 108.3 (Owner and Controller of Cards)',
    'CR 406.1 (Exile)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'remove a hit counter from a card that player owns in exile',
    'remove a void counter from a card that player owns in exile',
  ],
  rejects: [
    'remove a hit counter from a card you own in exile',
    'remove two hit counters from a card that player owns in exile',
    'remove any number of hit counters from a card that player owns in exile',
    'remove a hit counter from target card that player owns in exile',
    'remove a hit counter from a card that player owns in their graveyard',
    'remove a hit counter from a card that player owns',
    'remove a hit counter from a card that player owns in exile and draw a card',
    'remove a counter from a card that player owns in exile',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        pattern(/remove an? (\p{L}+) counter from a card /iu),
        family<IrNoun>('noun', { only: ['noun.that-player'] }),
        pattern(/ owns in exile(?=\.|$)/iu),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [lead, player] = r.value.value;
    const kind = (lead[1] ?? '').toLowerCase();
    const counter: IrCounterSpec = {
      kind: 'counterSpec',
      name: kind,
      span: r.value.span,
      rule: REMOVE_ID,
    };
    return {
      ok: true,
      value: [
        makeClause(REMOVE_ID, 'removeCounterFromOwnedExiled', { counter, player }, r.value.span),
      ],
      pos: r.pos,
    };
  },
});

export const EXILE_COUNTERS_EFFECT_RULES = [
  EFFECT_EXILE_IT_WITH_COUNTER,
  EFFECT_REMOVE_COUNTER_FROM_OWNED_EXILED_CARD,
].map(quietly);
