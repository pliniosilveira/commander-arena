/**
 * Effect rules of group 9 of the Hashaton deck (issue 31, D-1183 and D-1184 provisional), the body of Rona, Tolarian Obliterator: "that source's controller exiles a card from their
 * hand at random. If it's a land card, you may put it onto the battlefield under your control. Otherwise, you may cast it without paying its mana cost." Three phrases, one clause
 * each; the lowerings are in `lower/hashaton-g9.ts`.
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.exile-random-from-hand`: "that source's controller exiles a card from their hand at random", "that player exiles a card from their hand at random" (CR 701.13: exile;
 * CR 406.3: exiled cards are face up; CR 400.7: the card is a new object, "it" of the next sentences). The player exiles one card of their own hand, chosen by the game's
 * random generator, so nobody chooses and the card stays hidden until it is exiled. "It" after this clause is the card exiled (the binding pass), and the engine's `moved`.
 * Not read: another number of cards ("two cards"), a hand that is not their own ("from your hand", "from target player's hand"), a card chosen by the player (no "at random"),
 * several players ("each opponent exiles"), the controller of an object ("its controller exiles", another rule's phrase for another meaning).
 */
export const EFFECT_EXILE_RANDOM_FROM_HAND = defineRule<Clauses>({
  id: 'effect.exile-random-from-hand',
  family: 'effect',
  leading: ['that'],
  cites: ['CR 701.13 (Exile)', 'CR 406.3 (Exile)', 'CR 400.7 (General)', 'CR 113.7a (Abilities)'],
  examples: [
    "that source's controller exiles a card from their hand at random",
    'that source’s controller exiles a card from their hand at random',
    'that player exiles a card from their hand at random',
  ],
  rejects: [
    "that source's controller exiles a card from their hand",
    "that source's controller exiles two cards from their hand at random",
    "that source's controller exiles a card from your hand at random",
    "that source's controller exile a card from their hand at random",
    "that source's controller exiles a card from their graveyard at random",
    "that source's controller exiles a card from their library at random",
    "that source's controller discards a card at random",
    'each opponent exiles a card from their hand at random',
    'you exile a card from your hand at random',
    "that source's owner exiles a card from their hand at random",
    "that source's controller exiles a card from their hand at random and draws a card",
  ],
  parse: single(
    'effect.exile-random-from-hand',
    sequence(
      family<IrNoun>('noun', { only: ['noun.that-sources-controller', 'noun.that-player'] }),
      pattern(
        / exiles a card from their hand at random(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/iu,
      ),
    ),
    ([player]) => ({ verb: 'exileRandomFromHand', args: { player } }),
  ),
});

/**
 * `effect.put-it-onto-battlefield`: "put it onto the battlefield", "put it onto the battlefield under your control" (CR 400.7: the card is a new object; CR 110.2a: it enters under
 * the control of the player who puts it, so the bare form and "under your control" say the same). "It" is the card an instruction before it moved (the binding pass: the card
 * `exile-random-from-hand` exiled), and the lowering refuses any other "it". With "you may" before it (the sentence's own) the player may leave it. Not read: tapped, attacking,
 * counters, "under its owner's control", another zone, a card of a graveyard (`effect.put-battlefield`), "put that card".
 */
export const EFFECT_PUT_IT_ONTO_BATTLEFIELD = defineRule<Clauses>({
  id: 'effect.put-it-onto-battlefield',
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 400.7 (General)',
    'CR 110.2a (Permanents)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: ['put it onto the battlefield', 'put it onto the battlefield under your control'],
  rejects: [
    'put it onto the battlefield tapped',
    "put it onto the battlefield under its owner's control",
    'put it onto the battlefield under your control tapped',
    'put it into your hand',
    'put it on top of your library',
    'put them onto the battlefield',
    'put that card onto the battlefield',
    'put target creature card from a graveyard onto the battlefield',
    'put it onto the battlefield attacking',
    'put it onto the battlefield and draw a card',
  ],
  parse: single(
    'effect.put-it-onto-battlefield',
    sequence(
      literal('put '),
      family<IrNoun>('noun', { only: ['noun.it'] }),
      pattern(
        / onto the battlefield(?: under your control)?(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/iu,
      ),
    ),
    ([, objects]) => ({ verb: 'putMovedOntoBattlefield', args: { objects } }),
  ),
});

/**
 * `effect.cast-it-free`: "cast it without paying its mana cost" (CR 608.2g, 118.9, 601.2: the steps of casting, with no mana cost paid and no timing restriction as the effect
 * resolves). "It" is the card an instruction before it moved (the card `exile-random-from-hand` exiled). The words "you may" before it are the sentence's own, and the lowering
 * accepts only that form: the engine's `castFree` asks the controller which card to cast and lets them choose none, which a cast with no "may" would not allow. Not read: a
 * spell of a hand ("cast a spell from your hand without paying its mana cost", `effect.cast-free`), "play it", a cost paid instead, "that card", "them", "cast it this turn".
 */
export const EFFECT_CAST_IT_FREE = defineRule<Clauses>({
  id: 'effect.cast-it-free',
  family: 'effect',
  leading: ['cast'],
  cites: [
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Costs)',
    'CR 601.2 (Casting Spells)',
  ],
  examples: ['cast it without paying its mana cost'],
  rejects: [
    'cast it',
    'cast it by paying {2} rather than its mana cost',
    'cast it without paying its mana cost this turn',
    'cast them without paying their mana costs',
    'cast that card without paying its mana cost',
    'play it without paying its mana cost',
    'cast it without paying its mana cost and draw a card',
    'cast target card without paying its mana cost',
  ],
  parse: single(
    'effect.cast-it-free',
    sequence(
      literal('cast '),
      family<IrNoun>('noun', { only: ['noun.it'] }),
      pattern(
        / without paying its mana cost(?![\p{L}\p{N}])(?!\s+(?:and|then|this)(?![\p{L}\p{N}]))/iu,
      ),
    ),
    ([, objects]) => ({ verb: 'castMovedFree', args: { objects } }),
  ),
});

/**
 * Quiet: a line these rules do not read ("Put a +1/+1 counter on ~", "Put any number of cards from your hand ...", "Cast a spell ...") must stop where it always did, so the
 * words they share with the older rules ("put ", "cast ") do not become the closest rule of its diagnostic. Their matches are recorded as usual.
 */
export const HASHATON_G9_EFFECT_RULES = [
  quietly(EFFECT_EXILE_RANDOM_FROM_HAND),
  quietly(EFFECT_PUT_IT_ONTO_BATTLEFIELD),
  quietly(EFFECT_CAST_IT_FREE),
];
