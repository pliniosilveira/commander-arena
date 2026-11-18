/**
 * Effect rules of group 9 of the Hashaton deck (issue 31, D-393 and D-394 provisional), the body of Rona, Tolarian Obliterator: "that source's controller exiles a card from their
 * hand at random. If it's a land card, you may put it onto the battlefield under your control. Otherwise, you may cast it without paying its mana cost." Three phrases, one clause
 * each; the lowerings are in `lower/hashaton-g9.ts`.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { spellPhrase } from '../noun/phrases';
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
 * `effect.cast-kind-from-among`: "cast an Aura spell from among them without paying its mana cost" (CR 608.2g, 118.9, 601.2; D-655, Herald of Amity): the engine's `castFree` of the cards
 * an instruction before it exiled (`moved`), only those a kind of spell describes ("an Aura spell"); the "you may" before it is the controller's question, as for `effect.cast-it-free`.
 * Not read: "it", "one of them", a number of spells, "from your hand", "this turn", another cost.
 */
export const EFFECT_CAST_KIND_FROM_AMONG = defineRule<Clauses>({
  id: 'effect.cast-kind-from-among',
  family: 'effect',
  leading: ['cast'],
  cites: [
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Costs)',
    'CR 601.2 (Casting Spells)',
  ],
  examples: [
    'cast an Aura spell from among them without paying its mana cost',
    'cast a creature spell from among them without paying its mana cost',
  ],
  rejects: [
    // A plain "a spell" is `effect.cast-from-among` (it also reads "up to two spells").
    'cast a spell from among them without paying its mana cost',
    'cast an Aura spell from among them',
    'cast two Aura spells from among them without paying their mana costs',
    'cast an Aura spell from among those cards without paying its mana cost',
    'cast an Aura spell from your hand without paying its mana cost',
    'cast an Aura spell from among them without paying its mana cost this turn',
    'cast an Aura spell from among them without paying its mana cost and draw a card',
    'cast it from among them without paying its mana cost',
  ],
  parse: single(
    'effect.cast-kind-from-among',
    (ctx, pos) => {
      const head = pattern(/cast an? /iu)(ctx, pos);
      if (!head.ok) return head;
      const phrase = spellPhrase(false)(ctx, head.pos);
      if (!phrase.ok) return phrase;
      const tail = pattern(
        / from among them without paying its mana cost(?![\p{L}\p{N}])(?!\s+(?:and|then|this)(?![\p{L}\p{N}]))/iu,
      )(ctx, phrase.pos);
      if (!tail.ok) return tail;
      const { stackKind: _kind, zone: _zone, ...rest } = phrase.value;
      void _kind;
      void _zone;
      // A plain "a spell" is another rule's (`effect.cast-from-among`).
      if (rest.types === undefined && rest.subtypes === undefined && rest.anyOf === undefined) {
        return fail(ctx, pos);
      }
      const span = { start: pos, end: tail.pos };
      const spell: IrNoun = {
        kind: 'noun',
        det: 'a',
        filter: rest,
        upTo: false,
        plural: false,
        other: false,
        span: { start: head.pos, end: phrase.pos },
        rule: 'effect.cast-kind-from-among',
      };
      return { ok: true, value: { spell, span }, pos: tail.pos };
    },
    ({ spell }) => ({ verb: 'castMovedFree', args: { spell } }),
  ),
});

/**
 * `effect.put-rest-bottom-random`: "put the rest on the bottom of your library in a random order" (CR 401.4, 701.20; D-655, Herald of Amity): the cards an instruction before it
 * exiled from the top of the library and that are still in exile, put under the library in an order the game's random generator makes. Not read: "in any order", "on top",
 * "into your graveyard", another library ("their", "that player's"), "the rest" with another number of cards.
 */
export const EFFECT_PUT_REST_BOTTOM_RANDOM = defineRule<Clauses>({
  id: 'effect.put-rest-bottom-random',
  family: 'effect',
  leading: ['put'],
  cites: ['CR 401.4 (Library)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['put the rest on the bottom of your library in a random order'],
  rejects: [
    'put the rest on the bottom of your library in any order',
    'put the rest on the bottom of your library',
    'put the rest on top of your library in a random order',
    'put the rest into your graveyard',
    'put the rest on the bottom of their library in a random order',
    'put the rest on the bottom of your library in a random order and draw a card',
    'put the rest into your hand in a random order',
  ],
  parse: single(
    'effect.put-rest-bottom-random',
    pattern(
      /put the rest on the bottom of your library in a random order(?![\p{L}\p{N}])(?!\s+and(?![\p{L}\p{N}]))/iu,
    ),
    () => ({ verb: 'putRestBottom', args: {} }),
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
  quietly(EFFECT_CAST_KIND_FROM_AMONG),
  quietly(EFFECT_PUT_REST_BOTTOM_RANDOM),
];
