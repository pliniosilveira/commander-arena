/**
 * Effect rules of the Death Toll deck, group B: the two instructions that pick cards of your graveyard at random (CR 608.2c, 400.7): "choose a card at random in your graveyard" (the
 * card is "it" of the sentences after it) and "return two creature cards at random from your graveyard to the battlefield". The lowerings are in `lower/death-toll-b.ts`.
 */
import { pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { NO_PARTS, toFilter } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { single } from './operands';

/** The kinds of card whose name starts with a consonant ("a creature card") and with a vowel ("an artifact card"): the article agrees with it. */
const CONSONANT_KIND = 'creature|land|planeswalker|sorcery';
const VOWEL_KIND = 'artifact|enchantment|instant';
const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

/** The cards a phrase picks out in your graveyard: any card, or one kind of card ("creature cards"). */
function yardCards(rule: string, type: string | undefined, span: IrNoun['span']): IrNoun {
  return {
    kind: 'noun',
    det: 'a',
    filter: {
      ...toFilter(
        'graveyard',
        { ...NO_PARTS, ...(type === undefined ? {} : { types: [type] }) },
        type === undefined ? 'cards' : `${type} cards`,
      ),
      card: true,
    },
    upTo: false,
    plural: true,
    other: false,
    span,
    rule,
  };
}

/**
 * `effect.choose-random-graveyard-card`: "choose a card at random in your graveyard", "choose a creature card at random from your graveyard" (CR 608.2c: the card is "it" of the
 * instructions after it; CR 400.7). One card of the graveyard of the controller, picked by the game's seeded random generator, so nobody chooses. The engine's `chooseRandomFromGraveyard`
 * moves nothing. Not read: another number ("two cards"), another graveyard ("an opponent's graveyard", "a graveyard"), another zone, a card the player chooses (no "at random"), a card of
 * two kinds.
 */
export const EFFECT_CHOOSE_RANDOM_GRAVEYARD_CARD = defineRule({
  id: 'effect.choose-random-graveyard-card',
  family: 'effect',
  leading: ['choose'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 400.7 (General)'],
  examples: [
    'choose a card at random in your graveyard',
    'choose a card at random from your graveyard',
    'choose a creature card at random in your graveyard',
    'choose an artifact card at random from your graveyard',
  ],
  rejects: [
    'choose two cards at random in your graveyard',
    'choose a card in your graveyard',
    'choose a card at random in a graveyard',
    "choose a card at random in an opponent's graveyard",
    'choose a card at random in your hand',
    'choose a card at random in your library',
    'choose an creature card at random in your graveyard',
    'choose a artifact card at random in your graveyard',
    'choose a creature or land card at random in your graveyard',
    'choose a card at random in your graveyard and',
    'choose a card at random in your graveyard then',
    'choose an opponent at random',
  ],
  parse: single(
    'effect.choose-random-graveyard-card',
    spanned(
      pattern(
        new RegExp(
          `choose (?:a (?:(${CONSONANT_KIND}) )?|an (?:(${VOWEL_KIND}) )?)card at random (?:in|from) your graveyard${NOT_IN_WORD}(?!\\s+(?:and|then)${NOT_IN_WORD})`,
          'iu',
        ),
      ),
    ),
    ({ span, value }) => {
      const kind = (value[1] ?? value[2])?.toLowerCase();
      return {
        verb: 'chooseRandomGraveyardCard',
        args: {
          card: yardCards('effect.choose-random-graveyard-card', kind, span),
          count: { kind: 'number', value: 1, span },
        },
      };
    },
  ),
});

const COUNTS: Readonly<Record<string, number>> = { two: 2, three: 3 };

/**
 * `effect.return-random-graveyard-cards`: "return two creature cards at random from your graveyard to the battlefield", "return a creature card at random from your graveyard to the
 * battlefield" (CR 608.2c, 400.7, 110.2a: the cards come back under the control of the player who returns them). The cards are picked by the game's seeded random generator, nobody
 * choosing, and are put onto the battlefield together; fewer cards than the number asked for all come back. The lowering is the engine's `chooseRandomFromGraveyard` and a move of the
 * cards it picked. Not read: another zone than the battlefield, a number the text spells with digits, no "at random" (a choice), another graveyard, tapped or any rider, a card of two
 * kinds, no kind of card.
 */
export const EFFECT_RETURN_RANDOM_GRAVEYARD_CARDS = defineRule({
  id: 'effect.return-random-graveyard-cards',
  family: 'effect',
  leading: ['return'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 400.7 (General)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    'return two creature cards at random from your graveyard to the battlefield',
    'return a creature card at random from your graveyard to the battlefield',
    'return three artifact cards at random from your graveyard to the battlefield',
    'return an artifact card at random from your graveyard to the battlefield',
  ],
  rejects: [
    'return two creature cards from your graveyard to the battlefield',
    'return two creature cards at random from your graveyard to your hand',
    'return two creature cards at random from a graveyard to the battlefield',
    "return two creature cards at random from an opponent's graveyard to the battlefield",
    'return 2 creature cards at random from your graveyard to the battlefield',
    'return two creature cards at random from your graveyard to the battlefield tapped',
    'return two creature cards at random from your graveyard to the battlefield and',
    'return two creature or land cards at random from your graveyard to the battlefield',
    'return two creature card at random from your graveyard to the battlefield',
    'return a creature cards at random from your graveyard to the battlefield',
    'return a card at random from your graveyard to the battlefield',
    'return an creature card at random from your graveyard to the battlefield',
    'return a artifact card at random from your graveyard to the battlefield',
  ],
  parse: single(
    'effect.return-random-graveyard-cards',
    spanned(
      pattern(
        new RegExp(
          `return (?:a (${CONSONANT_KIND}) card|an (${VOWEL_KIND}) card|(two|three) (${CONSONANT_KIND}|${VOWEL_KIND}) cards) at random from your graveyard to the battlefield${NOT_IN_WORD}(?!\\s+(?:and|tapped|under|with|attacking)${NOT_IN_WORD})`,
          'iu',
        ),
      ),
    ),
    ({ span, value }) => {
      const kind = (value[1] ?? value[2] ?? value[4])?.toLowerCase();
      const count = value[3] === undefined ? 1 : (COUNTS[value[3].toLowerCase()] ?? 1);
      return {
        verb: 'returnRandomGraveyardCards',
        args: {
          card: yardCards('effect.return-random-graveyard-cards', kind, span),
          count: { kind: 'number', value: count, span },
        },
      };
    },
  ),
});

export const DEATH_TOLL_B_EFFECT_RULES = [
  EFFECT_CHOOSE_RANDOM_GRAVEYARD_CARD,
  EFFECT_RETURN_RANDOM_GRAVEYARD_CARDS,
].map(quietly);
