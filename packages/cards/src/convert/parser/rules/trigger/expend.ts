/**
 * "Whenever you expend N" (CR 700.14): the controller of the ability pays a cost to cast a spell, and the mana they have spent to cast spells this turn was less than N before
 * that payment and is at least N after it. The engine's `expend` trigger; it can trigger only once a turn, since the amount never goes down.
 */
import { pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';

const ID = 'trigger.you-expend';

export const TRIGGER_YOU_EXPEND = defineRule<IrTrigger>({
  id: ID,
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 700.14 (General)',
    'CR 601.2h (Casting Spells)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: ['you expend 4', 'you expend 6', 'you expend 8'],
  rejects: [
    'you expend',
    'you expend X',
    'you expend 0',
    'you expend 4 or more',
    'you expend 4 or',
    'you expend 4 mana',
    'you expended 4',
    'an opponent expends 4',
    'you expend four',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you expend ([1-9]\d?)(?![\p{L}\p{N}])(?!\s+[\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'expend',
        expend: Number(r.value[1]),
        args: {},
        span: { start: pos, end: r.pos },
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const EXPEND_TRIGGER_RULES = [TRIGGER_YOU_EXPEND].map(quietly);
