/**
 * Cost rule of group C of the Grand Larceny deck (issue 119): "Put a card an opponent owns from exile into that player's graveyard" (Void Attendant; CR 108.3, 118.3, 404.1, 406.1).
 */
import { pattern } from '../../combinators';
import type { IrCost, IrNoun } from '../../ir/types';
import { defineRule, spanned } from '../registry';

const ID = 'cost.put-opponent-exile-graveyard';

/**
 * `cost.put-opponent-exile-graveyard`: "Put a card an opponent owns from exile into that player's graveyard" (CR 108.3: the owner of a card is the player whose deck it started in;
 * CR 118.3, 602.2b: a cost of an activated ability; CR 404.1: the card goes to the graveyard of its owner, "that player"). The player chooses one face-up card in exile that an
 * opponent owns, of the kind named when one is, and puts it into its owner's graveyard. The engine's `putOpponentExileInGraveyard` cost. Not read: your own cards, a number of cards,
 * "an opponent controls", another zone, a different graveyard ("your graveyard"), a trailing word.
 */
export const COST_PUT_OPPONENT_EXILE_GRAVEYARD = defineRule<IrCost>({
  id: ID,
  family: 'cost',
  leading: ['put'],
  cites: ['CR 108.3 (Owner)', 'CR 118.3 (Costs)', 'CR 404.1 (Graveyard)', 'CR 406.1 (Exile)'],
  examples: [
    "Put a card an opponent owns from exile into that player's graveyard",
    'put a card an opponent owns from exile into that player’s graveyard',
    "Put a creature card an opponent owns from exile into that player's graveyard",
  ],
  rejects: [
    "Put a card an opponent owns from exile into that player's graveyard and",
    "Put two cards an opponent owns from exile into that player's graveyard",
    'Put a card you own from exile into your graveyard',
    "Put a card an opponent controls from exile into that player's graveyard",
    'Put a card an opponent owns from exile into your graveyard',
    "Put a card an opponent owns from a graveyard into that player's graveyard",
    "Put a card an opponent owns from exile into that player's hand",
    "Put a card from exile into its owner's graveyard",
    'Put a card an opponent owns from exile onto the battlefield',
  ],
  parse: (ctx, pos) => {
    // One pattern, so that a line that is not this cost records nothing of it.
    const r = spanned(
      pattern(
        /put an? (artifact |creature |land |enchantment |planeswalker |instant |sorcery |battle )?card an opponent owns from exile into that player['’]s graveyard(?![\p{L}\p{N}'’])(?!\s+and)/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const type = (r.value.value[1] ?? '').trim().toLowerCase();
    const what: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: {
        ...(type === '' ? {} : { types: [type] }),
        card: true,
        raw: ctx.text.slice(pos, r.pos),
      },
      upTo: false,
      plural: false,
      other: false,
      span: r.value.span,
      rule: ID,
    };
    return {
      ok: true,
      value: { kind: 'putOpponentExile', what, span: r.value.span, rule: ID },
      pos: r.pos,
    };
  },
});

export const GRAND_LARCENY_C_COST_RULES = [COST_PUT_OPPONENT_EXILE_GRAVEYARD];
