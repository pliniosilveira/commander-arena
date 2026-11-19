/**
 * Trigger rules of the Rooms (CR 709.5): "When you unlock this door". What the engine can run is the lowering's business (`lower/triggers.ts`).
 */
import { pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

/**
 * `trigger.unlock-this-door`: "you unlock this door" (CR 709.5h, 709.5j: a door is a half of a Room; the ability triggers when that half is given its unlocked designation, as
 * the Room enters because that half was cast, by the special action of CR 709.5e or by an effect of CR 709.5f). The engine's `doorUnlocked`, an ability of the half whose text has
 * it. Not read: another player ("an opponent unlocks"), a door that is not this one ("a door"), the Room ("this Room": a different event), "fully unlocks" (CR 709.5i), the past
 * tense, a second event.
 */
export const TRIGGER_UNLOCK_THIS_DOOR = defineRule<IrTrigger>({
  id: 'trigger.unlock-this-door',
  family: 'trigger',
  leading: ['you'],
  cites: ['CR 709.5h (Split Cards)', 'CR 709.5j (Split Cards)', 'CR 709.5e (Split Cards)'],
  examples: ['you unlock this door'],
  rejects: [
    'you unlock this Room',
    'you unlock a door',
    'you unlock this door or',
    'you unlock this door and',
    'you unlocked this door',
    'you unlock this doors',
    'you fully unlock this Room',
    'an opponent unlocks this door',
    'a player unlocks this door',
    'you unlock another door',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you unlock this door(?![\p{L}\p{N}])(?!\s+(?:or|and)(?![\p{L}\p{N}]))/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'doorUnlocked',
        actor: makeNoun('trigger.unlock-this-door', { start: pos, end: pos + 3 }, 'you', {
          raw: 'you',
        }),
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.unlock-this-door',
      },
      pos: r.pos,
    };
  },
});

export const ROOM_TRIGGER_RULES = [TRIGGER_UNLOCK_THIS_DOOR].map(quietly);
