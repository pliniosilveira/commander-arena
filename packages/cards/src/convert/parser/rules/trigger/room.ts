/**
 * Trigger rules of the Rooms (CR 709.5): "When you unlock this door". What the engine can run is the lowering's business (`lower/triggers.ts`).
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
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

/**
 * `trigger.fully-unlock-room`: "you fully unlock a Room" (CR 709.5i, 709.5h; Fear of Sleep Paralysis): the engine's `roomFullyUnlocked`, which triggers when the controller gives any Room the
 * unlocked designation it lacked so that it has both. Not read: another player, "this Room", a Room that is not "a", the past tense, "unlock" with no "fully".
 */
export const TRIGGER_FULLY_UNLOCK_ROOM = defineRule<IrTrigger>({
  id: 'trigger.fully-unlock-room',
  family: 'trigger',
  leading: ['you'],
  cites: ['CR 709.5i (Split Cards)', 'CR 709.5h (Split Cards)'],
  examples: ['you fully unlock a Room'],
  rejects: [
    'you unlock a Room',
    'you fully unlock this Room',
    'you fully unlock a Room or',
    'you fully unlocked a Room',
    'an opponent fully unlocks a Room',
    'you fully unlock a door',
    'you fully unlock Rooms',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you fully unlock a Room(?![\p{L}\p{N}])(?!\s+or(?![\p{L}\p{N}]))/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'roomFullyUnlocked',
        actor: makeNoun('trigger.fully-unlock-room', { start: pos, end: pos + 3 }, 'you', {
          raw: 'you',
        }),
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.fully-unlock-room',
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.or-subjects-and-unlock`: "~ or another enchantment you control enters and whenever you fully unlock a Room" (Fear of Sleep Paralysis, Eerie; CR 603.2c, 709.5i): the two subjects
 * of `trigger.or-subjects` entering, and a second event, a Room fully unlocked. One ability that three events cause, an engine ability for each with the same body, as for `trigger.or`.
 * Not read: another first event than entering, another second event, a third event.
 */
export const TRIGGER_OR_SUBJECTS_AND_UNLOCK = defineRule<IrTrigger>({
  id: 'trigger.or-subjects-and-unlock',
  family: 'trigger',
  leading: ['~'],
  cites: [
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 603.6a (Handling Triggered Abilities)',
    'CR 709.5i (Split Cards)',
  ],
  examples: [
    '~ or another enchantment you control enters and whenever you fully unlock a Room',
    '~ or another creature enters and whenever you fully unlock a Room',
  ],
  rejects: [
    '~ or another enchantment you control dies and whenever you fully unlock a Room',
    '~ or another enchantment you control enters and whenever you unlock a Room',
    '~ or another enchantment you control enters and you fully unlock a Room',
    '~ or another enchantment you control enters, and whenever you fully unlock a Room',
    '~ or another enchantment you control enters or whenever you fully unlock a Room',
    '~ or another enchantment you control enters and whenever you fully unlock a Room and whenever you fully unlock a Room',
    '~ enters and whenever you fully unlock a Room',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      satisfy(
        family<IrTrigger>('trigger', { only: ['trigger.or-subjects'] }),
        (t) => t.event === 'enters',
      ),
      literal(' and whenever '),
      family<IrTrigger>('trigger', { only: ['trigger.fully-unlock-room'] }),
    )(ctx, pos);
    if (!r.ok) return r;
    const [first, , unlock] = r.value;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        ...first,
        span,
        rule: 'trigger.or-subjects-and-unlock',
        alternatives: [...(first.alternatives ?? []), unlock],
      },
      pos: r.pos,
    };
  },
});

export const ROOM_TRIGGER_RULES = [
  TRIGGER_UNLOCK_THIS_DOOR,
  TRIGGER_FULLY_UNLOCK_ROOM,
  TRIGGER_OR_SUBJECTS_AND_UNLOCK,
].map(quietly);
