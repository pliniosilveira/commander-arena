/**
 * Trigger rules of Mirkwood Trapper: "a player attacks you" and "a player attacks" (CR 508.1, 508.1b, 603.2): the attackers are declared together and the ability triggers once for the
 * declaration, however many creatures it holds. Whoever declares them; "that player" of the body is the one who declared them.
 */
import { pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

/**
 * `trigger.player-attacks-you`: "a player attacks you" (CR 508.1b: a creature attacks "you" when it is declared attacking the player, not a planeswalker or a battle they control; CR
 * 603.2: once for the declaration). The engine's `attackBatch` of any player with `attackedYou`. Not read: "or a planeswalker you control", "with ...", other players, more words.
 */
export const TRIGGER_PLAYER_ATTACKS_YOU = defineRule<IrTrigger>({
  id: 'trigger.player-attacks-you',
  family: 'trigger',
  leading: ['a'],
  cites: [
    'CR 508.1b (Declare Attackers Step)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: ['a player attacks you'],
  rejects: [
    'a player attacks you or a planeswalker you control',
    'a player attacks you with two or more creatures',
    'a player attacks you and',
    'a player attacks you or',
    'a player attacks',
    'a player attack you',
    'a player attacked you',
    'an opponent attacks you',
    'another player attacks you',
    'each player attacks you',
    'you attack you',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.player-attacks-you';
    const r = pattern(
      /a player attacks you(?![\p{L}\p{N}'’])(?!\s+(?:with|or|and)(?![\p{L}\p{N}]))/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor: makeNoun(id, { start: pos, end: pos + 'a player'.length }, 'eachPlayer', {
          raw: 'a player',
        }),
        atLeast: 1,
        attackedYou: true,
        args: {},
        span,
        rule: id,
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.player-attacks-bare`: "a player attacks" (CR 508.1, 603.2: once for the declaration, whoever declares it, the controller of the ability too). The engine's `attackBatch` of any
 * player with `atLeast` 1. What the declaration attacked is the intervening "if" of the ability. Not read: "you", "one of your opponents", "with ...", "alone", "or", "and".
 */
export const TRIGGER_PLAYER_ATTACKS_BARE = defineRule<IrTrigger>({
  id: 'trigger.player-attacks-bare',
  family: 'trigger',
  leading: ['a'],
  cites: [
    'CR 508.1 (Declare Attackers Step)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: ['a player attacks'],
  rejects: [
    'a player attacks you',
    'a player attacks one of your opponents',
    'a player attacks with two or more creatures',
    'a player attacks with creatures',
    'a player attacks alone',
    'a player attacks or',
    'a player attacks and',
    'a player attack',
    'a player attacked',
    'an opponent attacks',
    'each player attacks',
    'you attack',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.player-attacks-bare';
    // What follows ("you", "one of ...", "with ...", "alone", "or ...") belongs to another trigger rule: a rule that reads a prefix would hide it.
    const r = pattern(
      /a player attacks(?![\p{L}\p{N}'’])(?!\s+(?:with|alone|you|one|or|and)(?![\p{L}\p{N}]))/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor: makeNoun(id, { start: pos, end: pos + 'a player'.length }, 'eachPlayer', {
          raw: 'a player',
        }),
        atLeast: 1,
        args: {},
        span,
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const PLAYER_ATTACKS_TRIGGER_RULES = [
  TRIGGER_PLAYER_ATTACKS_YOU,
  TRIGGER_PLAYER_ATTACKS_BARE,
].map(quietly);
