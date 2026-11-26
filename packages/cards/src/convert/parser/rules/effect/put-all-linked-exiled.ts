/**
 * Effect rule of the Exit from Exile deck (Journey to the Lost City): "Put all permanent cards exiled with ~ onto the battlefield, then sacrifice it." (CR 607.2a, 110.2a, 701.21a).
 * The lowering is `lower/put-all-linked-exiled.ts`.
 */
import { pattern } from '../../combinators';
import { defineRule } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.put-all-permanent-cards-exiled-with-then-sacrifice';

/**
 * `effect.put-all-permanent-cards-exiled-with-then-sacrifice`: every permanent card the permanent exiled with its linked ability (CR 607.2a) goes onto the battlefield under the control of
 * the player, then the permanent is sacrificed. The two instructions are one: "it" is the permanent itself. Not read: another place, "all cards" (the instants and sorceries would have no
 * place to go), "target", another verb after "then", a second instruction.
 */
export const EFFECT_PUT_ALL_PERMANENT_CARDS_EXILED_WITH_THEN_SACRIFICE = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 607.2a (Linked Abilities)',
    'CR 110.2a (Permanents)',
    'CR 701.21a (Sacrifice)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: ['put all permanent cards exiled with ~ onto the battlefield, then sacrifice it'],
  rejects: [
    'put all permanent cards exiled with ~ onto the battlefield',
    'put all cards exiled with ~ onto the battlefield, then sacrifice it',
    'put all permanent cards exiled with ~ into your hand, then sacrifice it',
    'put all permanent cards exiled with ~ onto the battlefield, then draw a card',
    'put all permanent cards exiled with ~ onto the battlefield, then sacrifice it and draw a card',
    'put target permanent card exiled with ~ onto the battlefield, then sacrifice it',
  ],
  parse: single(
    ID,
    pattern(
      /put all permanent cards exiled with ~ onto the battlefield, then sacrifice it(?![\p{L}\p{N}])(?! and\b| then\b|,)/iu,
    ),
    () => ({ verb: 'putAllLinkedExiledThenSacrifice', args: {} }),
  ),
});

export const PUT_ALL_LINKED_EXILED_EFFECT_RULES = [
  EFFECT_PUT_ALL_PERMANENT_CARDS_EXILED_WITH_THEN_SACRIFICE,
];
