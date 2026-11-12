/**
 * Effect rules of the Bruna deck program, Dawnbreak Reclaimer (stage P69, D-951). The lowering is in `lower/dawnbreak.ts`.
 */
import { fail, pattern } from '../../combinators';
import type { IrArg } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * The card types the engine's `returnGraveyardPair` takes: one card type, with the article that goes with it. Not instant and sorcery: CR 304.4 (Instants) and CR 307.4 (Sorceries) keep
 * such a card in its previous zone when it would enter the battlefield, which the engine does not apply to a return, so the text is unsupported rather than put on the battlefield.
 */
const PAIR_TYPES: Readonly<Record<string, 'a' | 'an'>> = {
  artifact: 'an',
  battle: 'a',
  creature: 'a',
  enchantment: 'an',
  land: 'a',
  planeswalker: 'a',
};

/**
 * `effect.choose-graveyard-pair`: "choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards
 * to the battlefield under their owners' control." (Dawnbreak Reclaimer; CR 608.2c, 608.2d, 110.2a, 400.3: the controller chooses a card of the type in an opponent's
 * graveyard, the owner of that card chooses one in the controller's graveyard, and the controller may return both, each under its owner's control.) Two sentences that
 * `splitSentences` keeps together. The engine's `returnGraveyardPair`. Not read: another chooser of either card, a graveyard other than "an opponent's" for the first card and
 * "your" for the second, two different card types, a card type the engine does not name, a return that is not optional, another place or another controller for the cards, a
 * count of one of them, the first sentence alone.
 */
export const EFFECT_CHOOSE_GRAVEYARD_PAIR = defineRule<Clauses>({
  id: 'effect.choose-graveyard-pair',
  family: 'effect',
  leading: ['choose'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 110.2a (Permanents)',
    'CR 400.3 (General)',
  ],
  examples: [
    "Choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards to the battlefield under their owners' control",
    "choose an artifact card in an opponent's graveyard, then that player chooses an artifact card in your graveyard. You may return those cards to the battlefield under their owners' control",
  ],
  rejects: [
    "choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard",
    "choose a creature card in an opponent's graveyard, then you choose a creature card in your graveyard. You may return those cards to the battlefield under their owners' control",
    "choose a creature card in an opponent's graveyard, then an opponent chooses a creature card in your graveyard. You may return those cards to the battlefield under their owners' control",
    "choose a creature card in an opponent's graveyard, then that player chooses a creature card in their graveyard. You may return those cards to the battlefield under their owners' control",
    "choose a creature card in an opponent's graveyard, then that player chooses a creature card in a graveyard. You may return those cards to the battlefield under their owners' control",
    "choose a creature card in each opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards to the battlefield under their owners' control",
    "choose a creature card in a graveyard, then that player chooses a creature card in your graveyard. You may return those cards to the battlefield under their owners' control",
    "choose a creature card in your graveyard, then that player chooses a creature card in an opponent's graveyard. You may return those cards to the battlefield under their owners' control",
    "choose a creature card in an opponent's graveyard, then that player chooses an artifact card in your graveyard. You may return those cards to the battlefield under their owners' control",
    "choose a nonland card in an opponent's graveyard, then that player chooses a nonland card in your graveyard. You may return those cards to the battlefield under their owners' control",
    "choose a permanent card in an opponent's graveyard, then that player chooses a permanent card in your graveyard. You may return those cards to the battlefield under their owners' control",
    "choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. Return those cards to the battlefield under their owners' control",
    "choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards to the battlefield under your control",
    "choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards to the battlefield tapped under their owners' control",
    "choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards to your hand",
    "choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards to the battlefield under their owner's control",
    "choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return one of those cards to the battlefield under its owner's control",
    "choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards to the battlefield under their owners' control and you gain 2 life",
    "choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards to the battlefield under their owners' control, then those creatures gain haste",
    "choose an instant card in an opponent's graveyard, then that player chooses an instant card in your graveyard. You may return those cards to the battlefield under their owners' control",
    "choose a sorcery card in an opponent's graveyard, then that player chooses a sorcery card in your graveyard. You may return those cards to the battlefield under their owners' control",
    "choose two creature cards in an opponent's graveyard, then that player chooses two creature cards in your graveyard. You may return those cards to the battlefield under their owners' control",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /[Cc]hoose (an?) (\p{L}+) card in an opponent['’]s graveyard, then that player chooses (an?) (\p{L}+) card in your graveyard\. You may return those cards to the battlefield under their owners['’] control(?![\p{L}\p{N}'’])/u,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, firstArticle, firstType, secondArticle, secondType] = r.value.value;
    // The same card type in both halves, a type the engine names, and the article that goes with it.
    if (
      firstType === undefined ||
      firstType !== secondType ||
      PAIR_TYPES[firstType] === undefined ||
      firstArticle !== PAIR_TYPES[firstType] ||
      secondArticle !== PAIR_TYPES[firstType]
    ) {
      return fail(ctx, pos);
    }
    const id = 'effect.choose-graveyard-pair';
    const span = r.value.span;
    const types: IrArg = {
      kind: 'typeList',
      subtypes: [],
      cardTypes: [firstType],
      span,
      rule: id,
    };
    return {
      ok: true,
      value: [makeClause(id, 'returnGraveyardPair', { types }, span)],
      pos: r.pos,
    };
  },
});

export const DAWNBREAK_EFFECT_RULES = [EFFECT_CHOOSE_GRAVEYARD_PAIR];
