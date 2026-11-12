/**
 * Effect rules of the Angel of Serenity group (the Bruna deck, D-932): the leaves trigger of a permanent that exiled several cards with its linked ability.
 */

import { pattern } from '../../combinators';
import type { IrArg, IrNoun } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.return-exiled-cards-to-hand`: "return the exiled cards to their owners' hands" (CR 607.2a, 400.3, 603.10a: the linked ability of the permanent returns every
 * card the permanent exiled with its other ability that is still in exile, each to the hand of its owner; a leaves trigger reads what the permanent had as it left). The
 * engine's `moveToZone` to the hand of `linkedExile`. Not read: one card ("the exiled card" is the rule of the other zones), another zone, "your hand", the battlefield,
 * "all cards exiled with ~", a card exiled by another permanent, or a second instruction after it.
 */
export const EFFECT_RETURN_EXILED_CARDS_TO_HAND = defineRule<Clauses>({
  id: 'effect.return-exiled-cards-to-hand',
  family: 'effect',
  leading: ['return'],
  cites: [
    'CR 607.2a (Linked Abilities)',
    'CR 400.3 (General)',
    'CR 603.10a (Handling Triggered Abilities)',
  ],
  examples: ["return the exiled cards to their owners' hands"],
  rejects: [
    "return the exiled card to its owner's hand",
    'return the exiled cards to your hand',
    "return the exiled cards to their owners' graveyards",
    'return the exiled cards to the battlefield under their owners’ control',
    'return the exiled cards to the battlefield',
    "return the exiled cards to their owner's hand",
    "return the exiled cards to their owners' libraries",
    "return the exiled cards to their owners' hands and draw a card",
    "return all cards exiled with ~ to their owners' hands",
    "return the cards to their owners' hands",
    "return those cards to their owners' hands",
    "return the exiled cards to their owners' hand",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/return the exiled cards to their owners['’] hands(?![\p{L}\p{N}])(?!\s+and)/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const id = 'effect.return-exiled-cards-to-hand';
    const span = r.value.span;
    const objects: IrNoun = {
      kind: 'noun',
      det: 'linkedExile',
      filter: { raw: 'the exiled cards' },
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: id,
    };
    const to: IrArg = { kind: 'zoneSpec', zone: 'hand', whose: 'owner', span, rule: id };
    return { ok: true, value: [makeClause(id, 'return', { objects, to }, span)], pos: r.pos };
  },
});

export const CROSS_ZONE_EFFECT_RULES = [EFFECT_RETURN_EXILED_CARDS_TO_HAND];
