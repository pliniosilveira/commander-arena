/**
 * Conditions of group 1 of the Hylda deck (issue 42, D-510): "it isn't being declared as an attacker" (Verity Circle), the part of the event "a creature an opponent controls becomes
 * tapped" that leaves out the tapping of attackers as they are declared (CR 508.1f). It is read after the "if" of the "if" that follows the trigger (the segmenter's intervening "if",
 * CR 603.4), and the lowering of the trigger turns it into a part of the engine's trigger, which is read once as the event happens (it cannot be read later: nothing says afterwards how
 * the permanent became tapped).
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule } from '../registry';

/**
 * `condition.not-declared-attacker`: "it isn't being declared as an attacker" (CR 508.1f: the active player taps the attackers as they are declared; the permanent "becomes tapped"
 * then too). The engine's `notAsAttacker` of a `becomesTapped` trigger. Not read: the positive ("it is being declared as an attacker"), another role ("as a blocker"), another
 * subject than "it", the past tense or no "being".
 */
export const CONDITION_NOT_DECLARED_ATTACKER = defineRule<IrCondition>({
  id: 'condition.not-declared-attacker',
  family: 'condition',
  leading: ['it'],
  cites: ['CR 508.1f (Declare Attackers Step)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: [
    "it isn't being declared as an attacker",
    'it isn’t being declared as an attacker',
    "It isn't being declared as an attacker",
  ],
  rejects: [
    'it is being declared as an attacker',
    "it isn't being declared as a blocker",
    "it isn't declared as an attacker",
    "it isn't being declared as an attacker or",
    "~ isn't being declared as an attacker",
    "they aren't being declared as attackers",
    "it wasn't being declared as an attacker",
    "it isn't being declared as the attacker",
    "it isn't attacking",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(`it isn['’]t being declared as an attacker${BOUNDARY}(?! or\\b)`, 'iu'),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'notDeclaredAttacker' },
        span: { start: pos, end: r.pos },
        rule: 'condition.not-declared-attacker',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.youre-defending-player`: "you're the defending player" (Kazuul, Tyrant of the Cliffs; CR 506.3d, 508.1b, 603.4): the creature of the "attacks" trigger was declared attacking the
 * controller of the ability or a planeswalker they control. The lowering of the trigger turns it into the engine's `at: youOrPlaneswalkers` of that trigger, read as the event happens. Not
 * read: another player ("they're the defending player"), the negative, a past tense.
 */
export const CONDITION_YOURE_DEFENDING_PLAYER = defineRule<IrCondition>({
  id: 'condition.youre-defending-player',
  family: 'condition',
  leading: ['you', 'you’re', "you're"],
  cites: [
    'CR 506.3d (Combat Phase)',
    'CR 508.1b (Declare Attackers Step)',
    'CR 603.4 (Handling Triggered Abilities)',
  ],
  examples: [
    "you're the defending player",
    'you’re the defending player',
    'you are the defending player',
  ],
  rejects: [
    "you're not the defending player",
    "they're the defending player",
    "you're the defending player or",
    "you're a defending player",
    "you weren't the defending player",
    "you're the attacking player",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(`you(?:['’]re| are) the defending player${BOUNDARY}(?! or\\b)`, 'iu'),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'youAreDefendingPlayer' },
        span: { start: pos, end: r.pos },
        rule: 'condition.youre-defending-player',
      },
      pos: r.pos,
    };
  },
});

export const HYLDA_G1_CONDITION_RULES = [
  CONDITION_NOT_DECLARED_ATTACKER,
  CONDITION_YOURE_DEFENDING_PLAYER,
];
