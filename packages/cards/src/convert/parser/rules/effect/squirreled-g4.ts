/**
 * Effect rules of the Squirreled Away deck, group 4 (Insatiable Frugivore: "When ~ enters, create a Food token, then you may exile three cards from your graveyard. If you do, repeat this
 * process."). The lowering is in `lower/squirreled-g4.ts`.
 */
import { literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { graveyardPhrase } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, single } from './operands';

const RULE = 'effect.exile-chosen-graveyard-cards';

/**
 * `effect.exile-chosen-graveyard-cards`: "exile three cards from your graveyard", "exile two creature cards from your graveyard" (CR 406.1, 608.2d, 404.1: the player chooses that many
 * cards among those of their own graveyard as the effect resolves; with "you may" the whole is an offer, and a player with fewer cards than that can't take it). The engine's `moveToZone`
 * to exile of a `choose` of that count in the graveyard; the cards exiled are what `moved` names afterwards. The singular is `effect.exile-chosen-graveyard-card`. Not read: a target,
 * another player's or any graveyard, "up to", "all", "X", a number below two, a card of the hand, an exile "until" something, "at random".
 */
export const EFFECT_EXILE_CHOSEN_GRAVEYARD_CARDS = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 406.1 (Exile)', 'CR 608.2d (Resolving Spells and Abilities)', 'CR 404.1 (Graveyard)'],
  examples: [
    'exile three cards from your graveyard',
    'exile two cards from your graveyard',
    'exile 3 cards from your graveyard',
    'exile two creature cards from your graveyard',
    'exile four instant or sorcery cards from your graveyard',
  ],
  rejects: [
    'exile a card from your graveyard',
    'exile one card from your graveyard',
    'exile three target cards from your graveyard',
    'exile three cards from a graveyard',
    "exile three cards from an opponent's graveyard",
    'exile three cards from your hand',
    'exile up to three cards from your graveyard',
    'exile all cards from your graveyard',
    'exile X cards from your graveyard',
    'exile three cards',
    'exile three cards from your graveyard at random',
    'exile three cards from your graveyard until ~ leaves the battlefield',
    'exile three card from your graveyard',
  ],
  parse: single(
    RULE,
    map(
      sequence(
        literal('exile '),
        satisfy(spanned(quantity), (n) => n.value >= 2),
        literal(' '),
        // Only the player's own graveyard: they choose among the cards they own there.
        satisfy(spanned(graveyardPhrase(true)), (phrase) => phrase.value.controller === 'you'),
        // The clause ends here: "... at random" and "... until ~ leaves the battlefield" are other statements.
        pattern(/(?=[.,;:]|$)/u),
      ),
      ([, count, , phrase]) => ({ count, phrase }),
    ),
    ({ count, phrase }): { verb: string; args: Record<string, IrNoun> } => ({
      verb: 'exileChosenCards',
      args: {
        objects: {
          kind: 'noun',
          det: 'a',
          filter: phrase.value,
          count: { kind: 'number', value: count.value, span: count.span },
          upTo: false,
          plural: true,
          other: false,
          span: phrase.span,
          rule: RULE,
        },
      },
    }),
  ),
});

/** Quiet: a line this rule does not read ("Exile three target cards from a graveyard") must stop where it always did. */
export const SQUIRRELED_G4_EFFECT_RULES = [quietly(EFFECT_EXILE_CHOSEN_GRAVEYARD_CARDS)];
