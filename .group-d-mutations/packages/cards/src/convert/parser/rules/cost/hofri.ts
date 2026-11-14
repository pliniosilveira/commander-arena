/**
 * Costs of the Hofri Ghostforge deck (stage P68, D-229): "Discard this card" (CR 118.3, 701.9: an ability that works from the hand, CR 113.6b, as Cycling does) and
 * "Exile ~" (CR 118.1, 406.1: the permanent exiles itself as a cost).
 */
import { fail, pattern } from '../../combinators';
import type { IrAmount, IrCost, IrNoun } from '../../ir/types';
import { defineRule, spanned } from '../registry';

/**
 * `cost.discard-this`: "Discard this card" (CR 701.9, 113.6b, 602.2): the card itself leaves the hand as a cost, so the ability works only from the hand. Not read:
 * "Discard ~" (a permanent's own name is "this card" only in a hand), a number of cards, "Discard a card" (another cost, `cost.discard`).
 */
export const COST_DISCARD_THIS = defineRule<IrCost>({
  id: 'cost.discard-this',
  family: 'cost',
  leading: ['discard'],
  cites: ['CR 701.9 (Discard)', 'CR 113.6b (Abilities)', 'CR 118.3 (Costs)'],
  examples: ['Discard this card', 'discard this card'],
  rejects: [
    'Discard',
    'Discard ~',
    'Discard a card',
    'Discard this card and',
    'Discard this',
    'Discard two cards',
    'Discard this permanent',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/discard this card(?![\p{L}\p{N}])(?!\s+and)/iu))(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'discardThis', span: r.value.span, rule: 'cost.discard-this' },
      pos: r.pos,
    };
  },
});

/**
 * `cost.exile-this`: "Exile ~" (CR 118.1, 406.1): the permanent with the ability is exiled as a cost, so it is not there for the effect. Not read: another
 * permanent, a card of the graveyard (`cost.exile`), "Exile ~ from your graveyard".
 */
export const COST_EXILE_THIS = defineRule<IrCost>({
  id: 'cost.exile-this',
  family: 'cost',
  leading: ['exile'],
  cites: ['CR 118.1 (Costs)', 'CR 406.1 (Exile)', 'CR 701.13a (Exile)'],
  examples: ['Exile ~', 'exile ~'],
  rejects: [
    'Exile',
    'Exile this',
    'Exile ~ from your graveyard',
    'Exile another creature',
    'Exile ~ and',
    'Exile two creature cards from your graveyard',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/exile ~(?![\p{L}\p{N}~])(?!\s+(?:and|from))/iu))(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'exileThis', span: r.value.span, rule: 'cost.exile-this' },
      pos: r.pos,
    };
  },
});

/**
 * `cost.exile-graveyard-cards`: "Exile two creature cards from your graveyard" (CR 118.1, 406.1, 701.13a: the player exiles that many cards of the kind from their own
 * graveyard as a cost; the cards are chosen as the ability is activated). The engine's `exileFromGraveyard` cost, of an ordinary activated ability. Not read: another zone
 * or player, "this card" (`cost.exile-this`), no count, a count of zero, a card that is not of a type ("Exile a card from your graveyard" is read: any card).
 */
export const COST_EXILE_GRAVEYARD_CARDS = defineRule<IrCost>({
  id: 'cost.exile-graveyard-cards',
  family: 'cost',
  leading: ['exile'],
  cites: ['CR 118.1 (Costs)', 'CR 406.1 (Exile)', 'CR 701.13a (Exile)'],
  examples: [
    'Exile two creature cards from your graveyard',
    'exile a creature card from your graveyard',
    'Exile three cards from your graveyard',
  ],
  rejects: [
    'Exile two creature cards from an opponent’s graveyard',
    'Exile two creature cards from your hand',
    'Exile cards from your graveyard',
    'Exile zero cards from your graveyard',
    'Exile ~ from your graveyard',
    'Exile two creature cards from your graveyard and',
    'Exile two creature cards',
  ],
  parse: (ctx, pos) => {
    // One pattern, so that a line that is not this cost ("Exile a card from your hand") records nothing of it.
    const r = spanned(
      pattern(
        /exile (an?|one|two|three|four|five|six|seven|eight|nine|[1-9]\d*) (artifact |creature |land |enchantment |planeswalker |instant |sorcery |battle )?cards? from your graveyard(?![\p{L}\p{N}'’])(?!\s+and)/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const words: Readonly<Record<string, number>> = {
      a: 1,
      an: 1,
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
    };
    const said = (r.value.value[1] ?? '').toLowerCase();
    const value = words[said] ?? Number(said);
    if (!(value >= 1)) return fail(ctx, pos);
    const type = (r.value.value[2] ?? '').trim().toLowerCase();
    const count: IrAmount = { kind: 'number', value, span: r.value.span };
    const what: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: { ...(type === '' ? {} : { types: [type] }), raw: ctx.text.slice(pos, r.pos) },
      count,
      upTo: false,
      plural: value > 1,
      other: false,
      span: r.value.span,
      rule: 'cost.exile-graveyard-cards',
    };
    return {
      ok: true,
      value: { kind: 'exile', what, span: r.value.span, rule: 'cost.exile-graveyard-cards' },
      pos: r.pos,
    };
  },
});

export const HOFRI_COST_RULES = [COST_DISCARD_THIS, COST_EXILE_THIS, COST_EXILE_GRAVEYARD_CARDS];
