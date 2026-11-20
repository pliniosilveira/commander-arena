/**
 * Conditions of the players an effect asks (stage P52, D-210, CR 608.2d, 608.2c): "If the player doesn't," after "target opponent may have you draw three cards", and
 * "If a creature card was discarded this way," after "each player may discard a card". Read only in the body of a triggered ability.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `condition.player-declines`: "the player doesn't" and "they don't", after the "if" the sentence parser reads: the player a "may" sentence asked said no ("Each opponent may discard
 * a card. If they don't, they lose 3 life", Death Toll deck, group C, Professor Onyx; CR 608.2d).
 */
export const CONDITION_PLAYER_DECLINES = defineRule<IrCondition>({
  id: 'condition.player-declines',
  family: 'condition',
  leading: ['the', 'they'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    "the player doesn't",
    'the player doesn’t',
    "The player doesn't",
    "they don't",
    'they don’t',
  ],
  rejects: [
    'the player does',
    "the player didn't",
    "that player doesn't",
    "the players don't",
    'the player does not',
    "an opponent doesn't",
    "the player doesn'ts",
    'they do',
    "they didn't",
    "they don'ts",
    "they doesn't",
    "the player don't",
  ],
  parse: (ctx, pos) => {
    const r = pattern(/(?:the player doesn['’]t|they don['’]t)(?![\p{L}\p{N}'’])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'declined' },
        span: { start: pos, end: r.pos },
        rule: 'condition.player-declines',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.each-opponent-declines`: "for each opponent who doesn't" (Meren deck, Braids, Arisen Nightmare; CR 608.2d, 608.2c, 101.4): after "each opponent may sacrifice a permanent",
 * what is done for each opponent who did not, as "If they don't" does for the players a "may" sentence asked. The sentence parser reads it where it reads "if" (the words start
 * the sentence). Not read: "for each opponent who does", "for each player who doesn't", "for each opponent who didn't", "each opponent who doesn't" (no "for").
 */
export const CONDITION_EACH_OPPONENT_DECLINES = defineRule<IrCondition>({
  id: 'condition.each-opponent-declines',
  family: 'condition',
  leading: ['for'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 101.4 (Handling Simultaneous Decisions)',
  ],
  examples: ["for each opponent who doesn't", 'For each opponent who doesn’t'],
  rejects: [
    'for each opponent who does',
    "for each player who doesn't",
    "for each opponent who didn't",
    "each opponent who doesn't",
    "for each opponents who doesn't",
    "for an opponent who doesn't",
    "for each opponent who doesn'ts",
  ],
  parse: (ctx, pos) => {
    const r = pattern(/for each opponent who doesn['’]t(?![\p{L}\p{N}'’])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'declined' },
        span: { start: pos, end: r.pos },
        rule: 'condition.each-opponent-declines',
      },
      pos: r.pos,
    };
  },
});

/** `condition.discarded-this-way`: "a creature card was discarded this way", "a noncreature card was discarded this way" (CR 608.2c, 701.9). */
export const CONDITION_DISCARDED_THIS_WAY = defineRule<IrCondition>({
  id: 'condition.discarded-this-way',
  family: 'condition',
  leading: ['a'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 701.9 (Discard)'],
  examples: [
    'a creature card was discarded this way',
    'a noncreature card was discarded this way',
    'A creature card was discarded this way',
  ],
  rejects: [
    'a land card was discarded this way',
    'a creature card was discarded',
    'a creature card is discarded this way',
    'a creature was discarded this way',
    'creature cards were discarded this way',
    'a nonland card was discarded this way',
    'a creature card was discarded this turn',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/a (non)?creature card was discarded this way(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'discardedThisWay', creature: r.value[1] === undefined },
        span: { start: pos, end: r.pos },
        rule: 'condition.discarded-this-way',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.discarded-spell-this-way`: "you discarded an instant or sorcery card this way" (D-358, Vohar, Vodalian Desecrator; CR 608.2c: what the instruction before it
 * did, CR 701.9: the cards were discarded). The engine's `thisWayAtLeast` of `discardedInstantOrSorcery`. Only after a discard of the same text, which the lowering checks.
 */
export const CONDITION_DISCARDED_SPELL_THIS_WAY = defineRule<IrCondition>({
  id: 'condition.discarded-spell-this-way',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 701.9 (Discard)'],
  examples: [
    'you discarded an instant or sorcery card this way',
    'You discarded an instant or sorcery card this way',
  ],
  rejects: [
    'you discarded an instant card this way',
    'you discarded an instant or sorcery card',
    'you discarded an instant or sorcery card this turn',
    'you discarded a sorcery or instant card this way',
    'you discarded two instant or sorcery cards this way',
    'you discarded a creature card this way',
    'a creature card was discarded this way',
    'you discarded an instant or sorcery card this way and',
    'an opponent discarded an instant or sorcery card this way',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you discarded an instant or sorcery card this way(?![\p{L}\p{N}])/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'discardedSpellThisWay' },
        span: { start: pos, end: r.pos },
        rule: 'condition.discarded-spell-this-way',
      },
      pos: r.pos,
    };
  },
});

export const CHOOSER_CONDITION_RULES = [
  CONDITION_PLAYER_DECLINES,
  CONDITION_EACH_OPPONENT_DECLINES,
  CONDITION_DISCARDED_THIS_WAY,
  CONDITION_DISCARDED_SPELL_THIS_WAY,
];
