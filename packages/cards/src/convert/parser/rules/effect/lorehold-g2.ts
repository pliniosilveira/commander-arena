/**
 * Effect rules of group 2 of the Lorehold Spirit deck (issue 86): "Choose target card exiled with ~. You may cast that card this turn without paying its mana cost. If that spell would be put
 * into a graveyard, put it on the bottom of its owner's library instead." (Quintorius, Loremaster). The engine runs `mayCast` of a card in exile (`rules/may-effects.ts`) and what can be lowered is
 * the lowering's business (`lower/lorehold-g2.ts`).
 */
import { literal, optional, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, single } from './operands';

/** ". if that spell would be put into a graveyard, put it on the bottom of its owner's library instead": the rider of the permission, the third sentence, taken with the clause (CR 614.1a). */
const BOTTOM_INSTEAD = pattern(
  new RegExp(
    `\\. if that spell would be put into a graveyard, put it on the bottom of its owner['’]s library instead${BOUNDARY}(?!,| and\\b| then\\b)`,
    'iu',
  ),
);

/**
 * `effect.cast-exiled-with-self`: "choose target card exiled with ~. you may cast that card this turn without paying its mana cost" and the same with the rider "if that spell would be put into a
 * graveyard, put it on the bottom of its owner's library instead" (CR 607.2a: the card the permanent exiled with its linked ability; CR 601.2, 118.9: cast, this turn, for no mana cost; CR 614.1a:
 * the spell goes to the bottom of its owner's library instead of a graveyard; CR 611.2a: until end of turn). Three sentences that are one instruction (the segmenter joins them), because "that
 * card" and "that spell" are the target of the first and the spell cast with the permission of the second. The engine's `mayCast` of a card in exile, with `free` and, with the rider,
 * `bottomInstead`. Not read: another target ("choose target card exiled with it"), "you may cast it" (no card to say it of), the permission with no "this turn", a rider about another zone
 * ("exile it instead"), a rider with no permission, "you may play that card".
 */
export const EFFECT_CAST_EXILED_WITH_SELF = defineRule<Clauses>({
  id: 'effect.cast-exiled-with-self',
  family: 'effect',
  leading: ['choose'],
  cites: [
    'CR 607.2a (Linked Abilities)',
    'CR 601.2 (Casting Spells)',
    'CR 118.9 (Alternative Costs)',
    'CR 614.1a (Replacement Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'choose target card exiled with ~. you may cast that card this turn without paying its mana cost',
    'choose target card exiled with ~. you may cast that card this turn without paying its mana cost. if that spell would be put into a graveyard, put it on the bottom of its owner’s library instead',
    "choose target card exiled with ~. you may cast that card this turn without paying its mana cost. if that spell would be put into a graveyard, put it on the bottom of its owner's library instead",
  ],
  rejects: [
    'choose target card exiled with ~',
    'choose target card exiled with it. you may cast that card this turn without paying its mana cost',
    'choose target card exiled with ~. you may cast it this turn without paying its mana cost',
    'choose target card exiled with ~. you may cast that card without paying its mana cost',
    'choose target card exiled with ~. you may cast that card this turn',
    'choose target card exiled with ~. you may play that card this turn without paying its mana cost',
    'choose target card exiled with ~. you may cast that card this turn without paying its mana cost. if that spell would be put into a graveyard, exile it instead',
    'choose target card exiled with ~. you may cast that card this turn without paying its mana cost. if that spell would be put into your graveyard, put it on the bottom of its owner’s library instead',
    'choose target card exiled with ~. you may cast that card this turn without paying its mana cost. if that spell would be put into a graveyard, put it on the bottom of your library instead',
    'choose target card exiled with ~. you may cast that card this turn without paying its mana cost, then draw a card',
    'choose target card exiled with ~. you may cast that card this turn without paying its mana cost. if that spell would be put into a graveyard, put it on the bottom of its owner’s library instead, then draw a card',
    'choose target creature. you may cast that card this turn without paying its mana cost',
    'you may cast that card this turn without paying its mana cost',
  ],
  parse: single(
    'effect.cast-exiled-with-self',
    sequence(
      literal('choose '),
      family<IrNoun>('noun', { only: ['noun.target-card-exiled-with-self'] }),
      pattern(
        new RegExp(`\\. you may cast that card this turn without paying its mana cost${BOUNDARY}`, 'iu'),
      ),
      optional(spanned(BOTTOM_INSTEAD), null),
    ),
    ([, objects, , rider]) => ({
      verb: 'mayCastExiled',
      args: {
        objects,
        bottomInstead: flag('effect.cast-exiled-with-self', rider !== null, objects.span),
      },
    }),
  ),
});

export const LOREHOLD_G2_EFFECT_RULES = [EFFECT_CAST_EXILED_WITH_SELF];
