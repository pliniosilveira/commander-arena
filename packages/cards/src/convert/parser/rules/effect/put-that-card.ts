/**
 * Effect rule of the Lorwyn Eclipsed reanimation wording (The Reaper, King No More): "put that card onto the battlefield under your control", the card a creature became when it
 * died. It says what "return that card to the battlefield under your control" says (`effect.return`), with the verb "put": the engine's `moveToZone` of the card the creature
 * became (`triggerCard`) to the battlefield.
 */
import { literal, map, optional, pattern, sequence } from '../../combinators';
import type { IrZoneSpec } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, operands, single, UNDER_CONTROL } from './operands';

const ID = 'effect.put-that-card-onto-battlefield';

/** " onto the battlefield", then "tapped" and the control when the text says them, in that order. */
const ONTO_THE_BATTLEFIELD = map(
  spanned(
    sequence(
      pattern(/ onto the battlefield/iu),
      optional(literal(' tapped'), null),
      optional(UNDER_CONTROL, null),
    ),
  ),
  ({ value: [, tapped, whose], span }): IrZoneSpec => ({
    kind: 'zoneSpec',
    zone: 'battlefield',
    ...(tapped === null ? {} : { tapped: true }),
    ...(whose === null ? {} : { whose }),
    span,
    rule: ID,
  }),
);

/**
 * `effect.put-that-card-onto-battlefield`: "put that card onto the battlefield", "put that card onto the battlefield under your control", "put that card onto the battlefield
 * tapped" (CR 400.7, 603.10a, 110.2a: the card the permanent that died became in the graveyard, put onto the battlefield under the control of the player the text names, or of
 * the controller of the effect). The lowering reads it only in a trigger about a permanent that died (it refuses another "that card"). Not read: "it", "put that card onto the
 * battlefield attached to ...", "put that card into your hand" and a card chosen by an earlier instruction.
 */
export const EFFECT_PUT_THAT_CARD_ONTO_BATTLEFIELD = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 400.7 (General)',
    'CR 603.10a (Handling Triggered Abilities)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    'put that card onto the battlefield',
    'put that card onto the battlefield under your control',
    'put that card onto the battlefield tapped under your control',
    "put that card onto the battlefield under its owner's control",
  ],
  rejects: [
    'put that card into your hand',
    'put that card onto the battlefield attached to it',
    'put that card onto your battlefield',
    'put those cards onto the battlefield',
    'put that cards onto the battlefield',
    'put that card',
    'put it onto the battlefield under your control',
  ],
  parse: single(
    ID,
    sequence(literal('put '), operands(['noun.that-card'], ID), ONTO_THE_BATTLEFIELD),
    ([, objects, to]) => ({ verb: 'return', args: { objects, to } }),
  ),
});

export const PUT_THAT_CARD_EFFECT_RULES = [EFFECT_PUT_THAT_CARD_ONTO_BATTLEFIELD].map(quietly);
