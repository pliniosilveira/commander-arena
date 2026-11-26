/**
 * Trigger rule of Thieving Amalgam: "a creature you control but don't own dies" (CR 700.4, 603.10a, 108.3: a creature that dies under the control of a player who is not its owner,
 * as one an effect of that player took or put onto the battlefield, or a token another player's effect made). The engine's `dies` over the creatures you control and do not own
 * (`notOwnedByYou`). Not read: another noun, "another", "you own", another controller, an event other than dying.
 */
import { fail, pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

const ID = 'trigger.creature-not-owned-dies';

/** `trigger.creature-not-owned-dies`: "a creature you control but don't own dies" (CR 108.3, 700.4). */
export const TRIGGER_CREATURE_NOT_OWNED_DIES = defineRule<IrTrigger>({
  id: ID,
  family: 'trigger',
  leading: ['a'],
  cites: [
    'CR 700.4 (General)',
    'CR 603.10a (Handling Triggered Abilities)',
    'CR 108.3 (Owners and Controllers)',
  ],
  examples: [
    "a creature you control but don't own dies",
    'a creature you control but don’t own dies',
  ],
  rejects: [
    'a creature you control dies',
    "another creature you control but don't own dies",
    "a creature you control but don't own enters",
    "a creature an opponent controls but don't own dies",
    "a creature you control but you don't own dies",
    "a creature you control but don't own dies or",
    "a permanent you control but don't own dies",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /a creature you control but don['’]t own dies(?![\p{L}\p{N}'’])(?!\s+or\b)/iu,
    )(ctx, pos);
    if (!r.ok) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const subject = makeNoun(ID, span, 'a', {
      types: ['creature'],
      controller: 'you',
      notOwnedByYou: true,
      raw: "a creature you control but don't own",
    });
    return {
      ok: true,
      value: { kind: 'trigger', event: 'dies', subject, args: {}, span, rule: ID },
      pos: r.pos,
    };
  },
});

export const NOT_OWNED_DIES_TRIGGER_RULES = [TRIGGER_CREATURE_NOT_OWNED_DIES].map(quietly);
