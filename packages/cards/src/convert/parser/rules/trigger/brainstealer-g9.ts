/**
 * Trigger rule of Brainstealer Dragon: "a nonland permanent an opponent owns enters under your control" (a permanent that came onto the battlefield under the control of a player who does not own
 * it). CR numbers are those the repository's comments already cite (603.6a, 108.3, 110.2); the CR text was not available to check them.
 */
import { fail, pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

const ID = 'trigger.enters-under-your-control-opponent-owned';

const WORDS: Readonly<Record<string, { types?: readonly string[]; notTypes?: readonly string[] }>> =
  {
    'nonland permanent': { notTypes: ['land'] },
    permanent: {},
    creature: { types: ['creature'] },
    artifact: { types: ['artifact'] },
    enchantment: { types: ['enchantment'] },
  };

/**
 * `trigger.enters-under-your-control-opponent-owned`: "a nonland permanent an opponent owns enters the battlefield under your control" (CR 603.6a, 108.3, 110.2: the permanent is owned by a player
 * other than the controller of the ability and enters under that controller's control, as a permanent of another player does when an effect of yours puts it onto the battlefield). The
 * engine's `entersBattlefield` over the kind of permanent you control and do not own (`notOwnedByYou`). Not read: other nouns, "you own", a number, "another", an event other than entering,
 * a permanent that enters under another player's control.
 */
export const TRIGGER_ENTERS_UNDER_YOUR_CONTROL_OPPONENT_OWNED = defineRule<IrTrigger>({
  id: ID,
  family: 'trigger',
  leading: ['a', 'an'],
  cites: [
    'CR 603.6a (Handling Triggered Abilities)',
    'CR 108.3 (Owners and Controllers)',
    'CR 110.2 (Permanents)',
  ],
  examples: [
    'a nonland permanent an opponent owns enters the battlefield under your control',
    'a nonland permanent an opponent owns enters under your control',
    'a creature an opponent owns enters the battlefield under your control',
  ],
  rejects: [
    'a nonland permanent an opponent owns enters',
    'a nonland permanent you own enters the battlefield under your control',
    'a land an opponent owns enters the battlefield under your control',
    'another nonland permanent an opponent owns enters the battlefield under your control',
    'a nonland permanent an opponent owns enters the battlefield under an opponent’s control',
    'a nonland permanent an opponent owns dies',
    'a nonland permanent an opponent owns enters the battlefield under your control and',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `an? (${Object.keys(WORDS).join('|')}) an opponent owns enters(?: the battlefield)? under your control(?![\\p{L}\\p{N}])(?!\\s+and\\b)`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const parts = WORDS[(r.value[1] ?? '').toLowerCase()];
    if (parts === undefined) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const subject = makeNoun(ID, span, 'a', {
      ...parts,
      controller: 'you',
      notOwnedByYou: true,
      raw: r.value[0],
    });
    return {
      ok: true,
      value: { kind: 'trigger', event: 'enters', subject, args: {}, span, rule: ID },
      pos: r.pos,
    };
  },
});

export const BRAINSTEALER_G9_TRIGGER_RULES = [TRIGGER_ENTERS_UNDER_YOUR_CONTROL_OPPONENT_OWNED].map(
  quietly,
);
