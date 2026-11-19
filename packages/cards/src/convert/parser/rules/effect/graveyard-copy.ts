/**
 * Effect rules of the token copy of a card exiled from a graveyard (issue 104, God-Pharaoh's Gift: "At the beginning of combat on your turn, you may exile a creature card from your
 * graveyard. If you do, create a token that's a copy of that card, except it's a 4/4 black Zombie. It gains haste until end of turn."). The token and its exceptions are
 * `token.copy-except`, "If you do" is the sentence condition `didPrevious`, "It gains haste until end of turn" is the grant of the token (`bind.ts`); the rule here is the offer: the exile
 * of a card the player chooses as the effect resolves. The lowering is in `lower/graveyard-copy.ts`.
 */
import { map, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { graveyardPhrase } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, single } from './operands';

const RULE = 'effect.exile-chosen-graveyard-card';

/**
 * `effect.exile-chosen-graveyard-card`: "exile a creature card from your graveyard", "exile a card from your graveyard" (CR 406.1, 608.2d, 404.1: the player chooses a card among those of
 * their own graveyard as the effect resolves, with "you may" none). The engine's `moveToZone` to exile of a `choose` in the graveyard; the card exiled is what "that card" names
 * afterwards. Not read: a target ("exile target creature card from a graveyard", the `effect.exile` rule's), another player's or any graveyard, more than one card ("two cards",
 * "up to"), a card of the hand, "all", an exile "until" something.
 */
export const EFFECT_EXILE_CHOSEN_GRAVEYARD_CARD = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 406.1 (Exile)', 'CR 608.2d (Resolving Spells and Abilities)', 'CR 404.1 (Graveyard)'],
  examples: [
    'exile a creature card from your graveyard',
    'exile a card from your graveyard',
    'exile an artifact card from your graveyard',
    'exile a Zombie card from your graveyard',
    'exile an instant or sorcery card from your graveyard',
  ],
  rejects: [
    'exile target creature card from your graveyard',
    'exile a creature card from a graveyard',
    "exile a creature card from an opponent's graveyard",
    'exile two creature cards from your graveyard',
    'exile up to two creature cards from your graveyard',
    'exile all creature cards from your graveyard',
    'exile a creature card from your hand',
    'exile a creature from your graveyard',
    'exile that card from your graveyard',
    'exile a creature card from your graveyard until ~ leaves the battlefield',
    'exile a creature card',
    'exile a card from your graveyard at random',
  ],
  parse: single(
    RULE,
    map(
      sequence(
        pattern(/exile an? /i),
        // Only the player's own graveyard: they choose among the cards they own there.
        satisfy(spanned(graveyardPhrase(false)), (phrase) => phrase.value.controller === 'you'),
        // The clause ends here: "exile a card from your graveyard at random" and "... until ~ leaves the battlefield" are other statements.
        pattern(/(?=[.,;:]|$)/u),
      ),
      ([, phrase]) => phrase,
    ),
    (phrase): { verb: string; args: Record<string, IrNoun> } => ({
      verb: 'exileChosenCard',
      args: {
        objects: {
          kind: 'noun',
          det: 'a',
          filter: phrase.value,
          upTo: false,
          plural: false,
          other: false,
          span: phrase.span,
          rule: RULE,
        },
      },
    }),
  ),
});

/** Quiet: a line this rule does not read ("Exile target creature card from a graveyard", "Exile a creature card from your hand") must stop where it always did. */
export const GRAVEYARD_COPY_EFFECT_RULES = [quietly(EFFECT_EXILE_CHOSEN_GRAVEYARD_CARD)];
