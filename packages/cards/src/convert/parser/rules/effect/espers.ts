/**
 * Effect rules of Espers to Magicite (deck-support issue 97): "Choose up to one target creature card exiled this way." The two sentences around it are read by `effect.exile`
 * ("Exile each opponent's graveyard.") and `token.copy-except` ("Create a token that's a copy of that card, except it's an artifact and it loses all other card types.").
 */
import { literal, sequence } from '../../combinators';
import { defineRule, quietly } from '../registry';
import { type Clauses, operands, single } from './operands';

const ID = 'effect.choose-card-exiled-this-way';

/**
 * `effect.choose-card-exiled-this-way`: "choose up to one target creature card exiled this way" (CR 603.12, 115.1, 603.3d: the target of a reflexive ability is chosen as it goes on the
 * stack; the words only name it for the sentence after, which says "that card"). The engine's target of the reflexive ability, with no effect of its own (as `effect.choose-target`). Not
 * read: "choose" without a target, two cards, a card that is not exiled this way, another instruction in the same sentence.
 */
export const EFFECT_CHOOSE_CARD_EXILED_THIS_WAY = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['choose'],
  cites: ['CR 603.12 (Reflexive Triggered Abilities)', 'CR 115.1 (Targets)'],
  examples: [
    'choose up to one target creature card exiled this way',
    'Choose up to one target creature card exiled this way',
    'choose up to one target card exiled this way',
  ],
  rejects: [
    'choose',
    'choose up to one target creature card',
    'choose up to two target creature cards exiled this way',
    'choose target creature card exiled this way',
    'choose up to one creature card exiled this way',
    'choose up to one target creature card exiled this way and draw a card',
    'choose one',
  ],
  parse: single(
    ID,
    sequence(
      literal('choose '),
      operands(['noun.target-card-exiled-this-way'], ID, {
        accept: (noun) => noun.det === 'target',
        locate: (noun) => noun.span.start,
      }),
    ),
    ([, what]) => ({ verb: 'chooseTarget', args: { what } }),
  ),
});

/** Quiet: it starts like other instructions ("choose ..."), and must leave the diagnostics of the lines it does not read where they were. */
export const ESPERS_EFFECT_RULES = [EFFECT_CHOOSE_CARD_EXILED_THIS_WAY].map(quietly);
