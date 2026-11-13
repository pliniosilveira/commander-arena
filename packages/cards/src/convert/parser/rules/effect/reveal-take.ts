/**
 * "Reveal the top five cards of your library. You may put a creature or enchantment card from among them into your hand. Put the rest into your graveyard." (Commune with the
 * Gods, Satyr Wayfinder, Vessel of Nascency, Malevolent Rumble; D-396, CR 701.20a): the engine's `lookAtTop` with `revealAll`. The three sentences are one instruction (the
 * second and third only make sense with the cards the first reveals), so `splitSentences` keeps them together (`segment.ts`) and one rule reads the whole.
 */
import { literal, satisfy, sequence } from '../../combinators';
import type { IrArg } from '../../ir/types';
import { defineRule, family } from '../registry';
import { TAKEN_CARD } from './library';
import { type Clauses, single } from './operands';

/** A number of cards: digits or a word from one to ten (X is not read). */
const NUMBER = family<IrArg>('amount', { only: ['amount.number'] });

/**
 * `effect.reveal-take`: "reveal the top five cards of your library. You may put a creature or enchantment card from among them into your hand. Put the rest into your
 * graveyard" (CR 701.20a: every one of the cards is shown to all players, 701.20b: they stay in the library until they move). The player may take one card of the kind
 * into their hand, or none; the others go into their graveyard. The kind is what `effect.look-take` reads ("a land card", "a creature or enchantment card", "an artifact,
 * creature, enchantment, land, or planeswalker card", "a permanent card"). Not read: a count of fewer than two cards (the card taken would be the whole top), X, another library,
 * "reveal it" after "you may" (that is `effect.look-take`, where the cards are only looked at), more than one card taken, another place for the card taken or for the rest.
 */
export const EFFECT_REVEAL_TAKE = defineRule<Clauses>({
  id: 'effect.reveal-take',
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 701.20b (Reveal)',
    'CR 404.1 (Graveyard)',
    'CR 110.4a (Permanents)',
  ],
  examples: [
    'Reveal the top five cards of your library. You may put a creature or enchantment card from among them into your hand. Put the rest into your graveyard',
    'reveal the top four cards of your library. you may put a land card from among them into your hand. put the rest into your graveyard',
    'reveal the top four cards of your library. you may put a permanent card from among them into your hand. put the rest into your graveyard',
    'reveal the top four cards of your library. you may put an artifact, creature, enchantment, land, or planeswalker card from among them into your hand. put the rest into your graveyard',
    'reveal the top three cards of your library. you may put an instant or sorcery card from among them into your hand. put the rest into your graveyard',
    'reveal the top three cards of your library. you may put a card from among them into your hand. put the rest into your graveyard',
  ],
  rejects: [
    'reveal the top five cards of your library. you may put a creature card from among them into your hand',
    'reveal the top five cards of your library. put the rest into your graveyard',
    'reveal the top five cards of your library. you may put a creature card from among them into your hand. put the rest on the bottom of your library in a random order',
    'reveal the top five cards of your library. you may put a creature card from among them onto the battlefield. put the rest into your graveyard',
    'reveal the top five cards of your library. you may reveal a creature card from among them and put it into your hand. put the rest into your graveyard',
    'reveal the top five cards of your library. you may put two creature cards from among them into your hand. put the rest into your graveyard',
    'reveal the top five cards of your library. you may put a creature card from among them into your hand. put the rest into your hand',
    'reveal the top one card of your library. you may put a creature card from among them into your hand. put the rest into your graveyard',
    'reveal the top x cards of your library. you may put a creature card from among them into your hand. put the rest into your graveyard',
    'reveal the top five cards of target player’s library. you may put a creature card from among them into your hand. put the rest into your graveyard',
    'reveal the top five cards of your library. you may put a creature card from among them into your hand. put the rest into exile',
  ],
  parse: single(
    'effect.reveal-take',
    sequence(
      literal('reveal the top '),
      satisfy(NUMBER, (a) => a.kind === 'number' && a.value >= 2),
      literal(' cards of your library. you may put '),
      TAKEN_CARD,
      literal(' from among them into your hand. put the rest into your graveyard'),
    ),
    ([, count, , take]) => ({ verb: 'revealTake', args: { count, take } }),
  ),
});

export const REVEAL_TAKE_EFFECT_RULES = [EFFECT_REVEAL_TAKE];
