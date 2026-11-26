/**
 * Cost of the Jump Scare! deck (issue #108), Primordial Mist: "Exile a face-down permanent you control face up" (CR 118.3, 406.3, 708.9, 602.2b).
 */
import { fail, literal, map, pattern, satisfy } from '../../combinators';
import type { IrCost, IrNoun } from '../../ir/types';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, spanned } from '../registry';

/**
 * `cost.exile-face-down-permanent`: "Exile a face-down permanent you control face up" (CR 118.3: exiling a permanent is a cost, chosen as the ability is activated; CR 406.3: exiled
 * cards are face up by default; CR 708.9: a face-down permanent that leaves the battlefield is revealed). One permanent of the player's own that is face down; the card it
 * becomes in exile is what "that card" names in the effect. The engine's `exilePermanent`, a cost of an ordinary activated ability. Not read: another number, a face-up
 * permanent, one an opponent controls, "exile ~", a card of the graveyard (`cost.exile-graveyard-cards`), a phrase without "face up" or with "face down".
 */
export const COST_EXILE_FACE_DOWN_PERMANENT = defineRule<IrCost>({
  id: 'cost.exile-face-down-permanent',
  family: 'cost',
  leading: ['exile'],
  cites: [
    'CR 118.3 (Costs)',
    'CR 406.3 (Exile)',
    'CR 708.9 (Face-Down Spells and Permanents)',
    'CR 602.2b (Activating Activated Abilities)',
  ],
  examples: [
    'Exile a face-down permanent you control face up',
    'exile a face-down creature you control face up',
  ],
  rejects: [
    'Exile a face-down permanent you control',
    'Exile a face-down permanent you control face down',
    'Exile a face-up permanent you control face up',
    'Exile a permanent you control face up',
    'Exile a face-down permanent face up',
    'Exile a face-down permanent an opponent controls face up',
    'Exile two face-down permanents you control face up',
    'Exile a face-down permanent you control face up and',
    'Exile ~ face up',
  ],
  parse: (ctx, pos) => {
    const lead = literal('exile a ')(ctx, pos);
    if (!lead.ok) return lead;
    const phrase = satisfy(
      map(permanentPhrase(false, 'all'), withoutZone),
      (filter) => filter.controller === 'you' && filter.facing === 'down',
    )(ctx, lead.pos);
    if (!phrase.ok) return phrase;
    if (phrase.value.anyOf !== undefined) return fail(ctx, pos);
    const face = spanned(pattern(/ face up(?![\p{L}\p{N}-])/iu))(ctx, phrase.pos);
    if (!face.ok) return face;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: phrase.value,
      upTo: false,
      plural: false,
      other: false,
      span: { start: lead.pos, end: phrase.pos },
      rule: 'cost.exile-face-down-permanent',
    };
    return {
      ok: true,
      value: {
        kind: 'exilePermanent',
        what: noun,
        span: { start: pos, end: face.pos },
        rule: 'cost.exile-face-down-permanent',
      },
      pos: face.pos,
    };
  },
});

export const EXILE_PERMANENT_COST_RULES = [COST_EXILE_FACE_DOWN_PERMANENT];
