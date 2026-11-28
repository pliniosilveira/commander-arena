/**
 * The trigger "whenever you give a gift" (issue 112, Jolly Gerbils; CR 702.174c). It says what the text says; what the engine can run is the lowering's business
 * (`lower/triggers.ts`).
 */
import { pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

const ID = 'trigger.give-gift';

/**
 * `trigger.give-gift`: "you give a gift", "an opponent gives a gift", "a player gives a gift" (CR 702.174c: a player gives a gift as an instant or sorcery spell they
 * control whose gift cost was paid resolves, or as the gift triggered ability of a permanent they control resolves). The engine's `givesGift`. Not read: the past tense,
 * "one or more gifts", a kind of gift ("give a card").
 */
export const TRIGGER_GIVE_GIFT = defineRule<IrTrigger>({
  id: ID,
  family: 'trigger',
  leading: ['you', 'an', 'a'],
  cites: ['CR 702.174c (Gift)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: ['you give a gift', 'an opponent gives a gift', 'a player gives a gift'],
  rejects: [
    'you gives a gift',
    'an opponent give a gift',
    'you gave a gift',
    'you give gifts',
    'you give two gifts',
    'you give a gift card',
    'you give a card',
    'each opponent gives a gift',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /(you give|an opponent gives|a player gives) a gift(?![\p{L}\p{N}])(?! card)/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const words = (r.value[1] ?? '').replace(/ gives?$/iu, '');
    const lower = words.toLowerCase();
    const det = lower === 'you' ? 'you' : lower === 'a player' ? 'eachPlayer' : 'eachOpponent';
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'givesGift',
        actor: makeNoun(ID, { start: pos, end: pos + words.length }, det, { raw: words }),
        args: {},
        span: { start: pos, end: r.pos },
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const GIFT_TRIGGER_RULES = [TRIGGER_GIVE_GIFT].map(quietly);
