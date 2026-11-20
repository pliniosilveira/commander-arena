/**
 * Effect rules of group 3 of the Ahoy Mateys deck (put onto the battlefield tapped and attacking).
 *
 * - `effect.exile-made-token-at-end-of-combat`: "Exile that token at end of combat." (Kari Zev, CR 603.7, 603.7c, 511.2).
 * - `effect.look-defenders-hand-put-attacking`: "Look at defending player's hand. You may put a creature card from it onto the battlefield under your control tapped and attacking that
 *   player or a planeswalker they control." (Zara, CR 508.4, 402.3, 608.2d).
 * - `effect.return-that-creature-at-end-step`: "Return that creature to its owner's hand at the beginning of the next end step." (Zara, CR 603.7, 603.7c, 108.3).
 */
import { fail, pattern } from '../../combinators';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const BOUNDARY = '(?![\\p{L}\\p{N}])';

/** Succeeds, reading nothing, when the text from here on is the end of the sentence (a period or the end of the text). */
const endsSentence = (ctx: { text: string }, pos: number): boolean =>
  /^(?:\.|$)/u.test(ctx.text.slice(pos));

/**
 * `effect.exile-made-token-at-end-of-combat`: "Exile that token at end of combat." (CR 603.7, 603.7c, 511.2: a delayed triggered ability about the token the instruction before it made,
 * waiting for the beginning of the end of combat step; a token that has left does nothing). The engine's `delayedTrigger` at the `combatEnd` step of an `exile` of `moved`. Not read: "at the
 * beginning of the next end step" (`effect.end-step-made-tokens`), another object, another step.
 */
export const EFFECT_EXILE_MADE_TOKEN_AT_END_OF_COMBAT = defineRule<Clauses>({
  id: 'effect.exile-made-token-at-end-of-combat',
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 603.7 (Delayed Triggered Abilities)',
    'CR 603.7c (Delayed Triggered Abilities)',
    'CR 511.2 (End of Combat Step)',
  ],
  examples: [
    'exile that token at end of combat',
    'Exile that token at end of combat',
    'exile those tokens at end of combat',
  ],
  rejects: [
    'exile that token at end of combat and draw a card',
    'exile that token at the beginning of the next end step',
    'exile that creature at end of combat',
    'exile that token',
    'exile ~ at end of combat',
    'exile that tokens at end of combat',
    'sacrifice that token at end of combat',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-made-token-at-end-of-combat';
    const r = spanned(
      pattern(new RegExp(`exile (?:that token|those tokens) at end of combat${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    if (!endsSentence(ctx, r.pos)) return fail(ctx, pos);
    return {
      ok: true,
      value: [makeClause(id, 'exileAtEndOfCombatMade', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.look-defenders-hand-put-attacking`: "Look at defending player's hand. You may put a creature card from it onto the battlefield under your control tapped and attacking that
 * player or a planeswalker they control." (CR 508.4, 402.3, 608.2d, 110.2a: the two sentences are one instruction, kept together by `segment.ts`; the creature enters under the
 * control of the controller of the ability, tapped, and joins the combat attacking the defending player, never declared as an attacker). The engine's `moveToZone` of a `choose`
 * with `fromHandOf` the defending player, then `enterAttacking`. The choice of the planeswalker is not offered (`docs/ROADMAP.md`). Not read: another player, another card kind, a
 * second "may", another state.
 */
export const EFFECT_LOOK_DEFENDERS_HAND_PUT_ATTACKING = defineRule<Clauses>({
  id: 'effect.look-defenders-hand-put-attacking',
  family: 'effect',
  leading: ['look'],
  cites: [
    'CR 508.4 (Declare Attackers Step)',
    'CR 402.3 (Hand)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    "look at defending player's hand. you may put a creature card from it onto the battlefield under your control tapped and attacking that player or a planeswalker they control",
    "Look at defending player's hand. You may put a creature card from it onto the battlefield under your control tapped and attacking that player or a planeswalker they control",
  ],
  rejects: [
    "look at defending player's hand",
    "look at defending player's hand. you may put a creature card from it onto the battlefield under your control tapped and attacking that player",
    "look at defending player's hand. you may put a creature card from it onto the battlefield under your control tapped",
    "look at defending player's hand. you may put a land card from it onto the battlefield under your control tapped and attacking that player or a planeswalker they control",
    "look at target player's hand. you may put a creature card from it onto the battlefield under your control tapped and attacking that player or a planeswalker they control",
    "look at defending player's hand. put a creature card from it onto the battlefield under your control tapped and attacking that player or a planeswalker they control",
    "look at defending player's hand. you may put a creature card from it onto the battlefield tapped and attacking that player or a planeswalker they control",
    "look at defending player's hand. you may put a creature card from it onto the battlefield under your control tapped and attacking that player or a planeswalker they control and draw a card",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.look-defenders-hand-put-attacking';
    const r = spanned(
      pattern(
        new RegExp(
          `look at defending player['’]s hand\\. you may put a creature card from it onto the battlefield under your control tapped and attacking that player or a planeswalker they control${BOUNDARY}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    if (!endsSentence(ctx, r.pos)) return fail(ctx, pos);
    return {
      ok: true,
      value: [makeClause(id, 'lookHandPutAttacking', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.return-that-creature-at-end-step`: "Return that creature to its owner's hand at the beginning of the next end step." (CR 603.7, 603.7c, 400.7j, 108.3: a delayed triggered
 * ability about the creature the instruction before it put onto the battlefield; once that object has changed zones it is a new object and the ability does nothing). The engine's
 * `delayedTrigger` at the end step of each turn, whose effect moves the `moved` objects to their owner's hand. Not read: "your next end step", another object, another zone.
 */
export const EFFECT_RETURN_THAT_CREATURE_AT_END_STEP = defineRule<Clauses>({
  id: 'effect.return-that-creature-at-end-step',
  family: 'effect',
  leading: ['return'],
  cites: [
    'CR 603.7 (Delayed Triggered Abilities)',
    'CR 603.7c (Delayed Triggered Abilities)',
    'CR 108.3 (Owners and Controllers)',
  ],
  examples: [
    "return that creature to its owner's hand at the beginning of the next end step",
    "Return that creature to its owner's hand at the beginning of the next end step",
  ],
  rejects: [
    "return that creature to its owner's hand at the beginning of your next end step",
    "return that creature to its owner's hand at the beginning of the next end step and draw a card",
    "return that creature to its owner's hand",
    "return that creature to its owner's hand at the beginning of the next end",
    "return those creatures to its owner's hand at the beginning of the next end step",
    "return target creature to its owner's hand at the beginning of the next end step",
    'return that creature to the command zone at the beginning of the next end step',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.return-that-creature-at-end-step';
    const r = spanned(
      pattern(
        new RegExp(
          `return that creature to its owner['’]s hand at the beginning of the next end step${BOUNDARY}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    if (!endsSentence(ctx, r.pos)) return fail(ctx, pos);
    return {
      ok: true,
      value: [makeClause(id, 'returnThatCreatureAtEndStep', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

/** Quiet: a line these rules do not read stops where it always did. */
export const AHOY_G3_EFFECT_RULES = [
  quietly(EFFECT_EXILE_MADE_TOKEN_AT_END_OF_COMBAT),
  quietly(EFFECT_LOOK_DEFENDERS_HAND_PUT_ATTACKING),
  quietly(EFFECT_RETURN_THAT_CREATURE_AT_END_STEP),
];
