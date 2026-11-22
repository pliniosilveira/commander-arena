/**
 * Trigger rules of the Mardu Surge deck (issue 101).
 *
 * - `trigger.attack-with-self-or-commander`: "you attack with ~ and/or your commander" (CR 508.1, 603.2c, 903.3): once for the declaration, when at least one of the creatures declared is
 *   this creature or a commander its controller owns. The engine's `attackBatch` with a filter of two members.
 */
import { literal, pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun, youNoun } from './subjects';

export const TRIGGER_ATTACK_WITH_SELF_OR_COMMANDER = defineRule<IrTrigger>({
  id: 'trigger.attack-with-self-or-commander',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 508.1 (Declare Attackers Step)',
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 903.3 (Commander)',
  ],
  examples: ['you attack with ~ and/or your commander'],
  rejects: [
    'you attack with ~',
    'you attack with ~ and your commander',
    'you attack with ~ or your commander',
    'you attack with your commander and/or ~',
    'you attack with ~ and/or your commanders',
    'you attack with ~ and/or your commander and',
    'another player attacks with ~ and/or your commander',
    'you attack with ~ and/or a commander',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.attack-with-self-or-commander';
    const actor = youNoun(id)(ctx, pos);
    if (!actor.ok) return actor;
    const rest = literal(' attack with ~ and/or your commander')(ctx, actor.pos);
    if (!rest.ok) return rest;
    const span = { start: pos, end: rest.pos };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor: actor.value,
        atLeast: 1,
        subject: makeNoun(id, span, 'a', {
          anyOf: [
            { isSelf: true, raw: '~' },
            { commander: 'yours', raw: 'your commander' },
          ],
          raw: '~ and/or your commander',
        }),
        args: {},
        span,
        rule: id,
      },
      pos: rest.pos,
    };
  },
});

/**
 * `trigger.opponents-dealt-combat-damage`: "your opponents are dealt combat damage" (CR 510.2, 603.2c; Mindblade Render): one occurrence for the whole damage event, however many
 * opponents were dealt damage (issue 508: the official ruling of the card). The engine's `combatDamageBatch` with `to: 'opponents'`; "if any of that damage was dealt by a Warrior" is the
 * type in the filter of the sources (`condition.damage-dealt-by-type`, folded by the lowering of the trigger).
 */
export const TRIGGER_OPPONENTS_DEALT_COMBAT_DAMAGE = defineRule<IrTrigger>({
  id: 'trigger.opponents-dealt-combat-damage',
  family: 'trigger',
  leading: ['your'],
  cites: ['CR 510.2 (Combat Damage Step)', 'CR 603.2c (Handling Triggered Abilities)'],
  examples: ['your opponents are dealt combat damage'],
  rejects: [
    'your opponents are dealt damage',
    'your opponent is dealt combat damage',
    'your opponents are dealt combat damage by a Warrior',
    'you are dealt combat damage',
    'an opponent is dealt combat damage',
    'your opponents are dealt combat damage and',
    'your opponents are dealt noncombat damage',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/your opponents are dealt combat damage(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const subject = makeNoun('trigger.opponents-dealt-combat-damage', span, 'a', {
      types: ['creature'],
      raw: 'creatures',
    });
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'combatDamageBatch',
        subject: { ...subject, plural: true },
        damaged: 'opponents',
        args: {},
        span,
        rule: 'trigger.opponents-dealt-combat-damage',
      },
      pos: r.pos,
    };
  },
});

export const MARDU_SURGE_TRIGGER_RULES = [
  TRIGGER_ATTACK_WITH_SELF_OR_COMMANDER,
  TRIGGER_OPPONENTS_DEALT_COMBAT_DAMAGE,
].map(quietly);
