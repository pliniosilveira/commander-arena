/**
 * Effect rules of group 1 of the Lorehold Spirit deck (issue 86): "repeat this process once" (Claim Jumper), "you may exile one of them from your graveyard" of the cards a batch of
 * discards is about (Conspiracy Theorist), "shuffle any number of target cards from your graveyard into your library" (Perpetual Timepiece) and "each creature deals damage to itself
 * equal to its power" (Wave of Reckoning). Each says what the text says; the engine runs `conditional`, `exileFromTriggerCards`, `moveToZone` with `shuffle` and `dealDamageToSelf`
 * (rules/effects.ts, rules/damage-effects.ts) and what can be lowered is the lowering's business (`lower/lorehold-g1.ts`, `lower/sentences.ts`).
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, quietly } from '../registry';
import { type Clauses, single } from './operands';

const NOT_IN_WORD = BOUNDARY;

/**
 * `effect.repeat-process`: "repeat this process once" (CR 608.2c: the instructions of the ability before it are carried out again, once; the sentence says when, "Then if an opponent
 * controls more lands than you," in front of it). Only "once", and only the words themselves: "repeat this process twice", "repeat this process", "repeat this process for each ..." are other
 * instructions. What the process is, the lowering decides (the one instruction before it).
 */
export const EFFECT_REPEAT_PROCESS = defineRule<Clauses>({
  id: 'effect.repeat-process',
  family: 'effect',
  leading: ['repeat'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: ['repeat this process once', 'Repeat this process once'],
  rejects: [
    'repeat this process',
    'repeat this process twice',
    'repeat this process twice more',
    'repeat this process for each creature',
    'repeat this process once more',
    'repeat this once',
    'repeat the process once',
    'repeats this process once',
    'repeat this process once and draw a card',
  ],
  parse: single(
    'effect.repeat-process',
    pattern(new RegExp(`repeat this process once${NOT_IN_WORD}(?! (?:more|again))`, 'iu')),
    () => ({ verb: 'repeatProcess', args: {} }),
  ),
});

/**
 * `effect.exile-one-of-them`: "exile one of them from your graveyard" (CR 603.2c, 608.2d, 400.7: of the cards a trigger about one or more cards is about, the controller exiles one that is
 * still in their graveyard; the choice is the offer). "You may" is the sentence's, read before the rule. Only your graveyard, one card, and "them" (the cards of the batch); "exile them", "exile one of them
 * from a graveyard", "exile two of them" are other instructions. The lowering reads it only in the body of a batch trigger.
 */
export const EFFECT_EXILE_ONE_OF_THEM = defineRule<Clauses>({
  id: 'effect.exile-one-of-them',
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 400.7 (General)',
    'CR 701.13 (Exile)',
  ],
  examples: ['exile one of them from your graveyard', 'Exile one of them from your graveyard'],
  rejects: [
    'you may exile one of them from your graveyard',
    'exile them from your graveyard',
    'exile one of them',
    'exile one of them from a graveyard',
    "exile one of them from an opponent's graveyard",
    'exile two of them from your graveyard',
    'exile one of those from your graveyard',
    'exile one of them from your hand',
    'exile one of them from your graveyard and draw a card',
    'exile one of them from your graveyard then draw a card',
    'exile up to one of them from your graveyard',
    'exile one of it from your graveyard',
  ],
  parse: single(
    'effect.exile-one-of-them',
    sequence(
      literal('exile one of them from your graveyard'),
      pattern(/(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/u),
    ),
    () => ({ verb: 'exileOneOfThem', args: {} }),
  ),
});

/**
 * `effect.shuffle-cards-into-library`: "shuffle any number of target cards from your graveyard into your library", "shuffle target card from your graveyard into your library" (CR 701.24c,
 * 701.24d, 404.1: the cards go into your library, which is shuffled even when no card is there). The cards are the targets of a phrase of your own graveyard, one or any number. Not read: a
 * graveyard that is not yours, "their library", "on top of", a list, "all", "up to", a count.
 */
export const EFFECT_SHUFFLE_CARDS_INTO_LIBRARY = defineRule<Clauses>({
  id: 'effect.shuffle-cards-into-library',
  family: 'effect',
  leading: ['shuffle'],
  cites: [
    'CR 701.24c (Shuffle)',
    'CR 701.24d (Shuffle)',
    'CR 404.1 (Graveyard)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    'shuffle any number of target cards from your graveyard into your library',
    'shuffle target card from your graveyard into your library',
    'shuffle target creature card from your graveyard into your library',
    'shuffle any number of target creature cards from your graveyard into your library',
    'shuffle up to two target cards from your graveyard into your library',
    'Shuffle any number of target cards from your graveyard into your library',
  ],
  rejects: [
    'shuffle any number of target cards from a graveyard into your library',
    "shuffle any number of target cards from an opponent's graveyard into your library",
    'shuffle any number of target cards from your graveyard into their library',
    "shuffle any number of target cards from your graveyard into its owner's library",
    'shuffle any number of target cards from your graveyard on top of your library',
    'shuffle any number of target cards from your graveyard',
    'shuffle your graveyard into your library',
    'shuffle all cards from your graveyard into your library',
    'shuffle any number of cards from your graveyard into your library',
    'shuffle any number of target cards from your graveyard into your library and draw a card',
    'shuffle target card from your graveyard into your library, then draw a card',
    'shuffle target creature into your library',
    'shuffle any number of target creatures into your library',
  ],
  parse: single(
    'effect.shuffle-cards-into-library',
    sequence(
      literal('shuffle '),
      satisfy(
        family<IrNoun>('noun', {
          only: ['noun.target-graveyard-card', 'noun.any-number-target-graveyard-cards'],
        }),
        // Your graveyard only: the cards go into your library.
        (noun) => noun.filter.controller === 'you' && noun.det === 'target',
      ),
      literal(' into your library'),
      pattern(/(?![\p{L}\p{N}])(?!\s*(?:,|and|then)(?![\p{L}\p{N}]))/u),
    ),
    ([, objects]) => ({ verb: 'shuffleIntoLibrary', args: { objects } }),
  ),
});

/**
 * `effect.deal-damage-to-itself`: "each creature deals damage to itself equal to its power" (CR 120.3, 608.2h: each creature of the group is a source of damage that it is dealt, as much
 * as its power). A group of permanents with "each" and a kind; "equal to its power" only. Not read: another amount, another recipient, a target, "deals damage to each other", "deals damage
 * to itself equal to its toughness".
 */
export const EFFECT_DEAL_DAMAGE_TO_ITSELF = defineRule<Clauses>({
  id: 'effect.deal-damage-to-itself',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 120.3 (Damage)',
    'CR 120.8 (Damage)',
    'CR 608.2h (Resolving Spells and Abilities)',
    'CR 208.1 (Power and Toughness)',
  ],
  examples: [
    'each creature deals damage to itself equal to its power',
    'each creature you control deals damage to itself equal to its power',
    'each creature an opponent controls deals damage to itself equal to its power',
    'each other creature deals damage to itself equal to its power',
    'each nonland permanent deals damage to itself equal to its power',
    'Each creature deals damage to itself equal to its power',
  ],
  rejects: [
    'each creature deals damage to itself equal to its toughness',
    'each creature deals damage to itself',
    'each creature deals 2 damage to itself',
    'each creature deals damage to you equal to its power',
    'each creature deals damage to each opponent equal to its power',
    'each creature deals damage to itself equal to its power and gains flying',
    'each creature deals damage to itself equal to its power, then draw a card',
    'each creature deals damage to itself equal to that creature’s power',
    'target creature deals damage to itself equal to its power',
    'each creature deal damage to itself equal to its power',
    'each creature deals damage to itself equal to its power.',
  ],
  parse: single(
    'effect.deal-damage-to-itself',
    sequence(
      family<IrNoun>('noun', { only: ['noun.each-permanent'] }),
      pattern(
        new RegExp(
          ` deals damage to itself equal to its power${NOT_IN_WORD}(?!\\s*(?:,|and|then)${NOT_IN_WORD})`,
          'iu',
        ),
      ),
    ),
    ([objects]) => ({ verb: 'dealDamageToSelf', args: { objects } }),
  ),
});

/** Quiet: each starts like a rule that reads other lines ("each creature ...", "shuffle ...", "exile ...") and must leave those where they were. */
export const LOREHOLD_G1_EFFECT_RULES = [
  quietly(EFFECT_REPEAT_PROCESS),
  quietly(EFFECT_EXILE_ONE_OF_THEM),
  quietly(EFFECT_SHUFFLE_CARDS_INTO_LIBRARY),
  quietly(EFFECT_DEAL_DAMAGE_TO_ITSELF),
];
