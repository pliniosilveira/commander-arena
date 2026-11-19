/**
 * Effects of the Jeskai free-cast cards (deck support issue 100): a free cast of a spell from among the cards looked at, from the library they are still in.
 */
import { choice, literal, pattern, sequence } from '../../combinators';
import type { IrAmount, IrFilter, IrNoun } from '../../ir/types';
import { CARD_TYPES, typeChoice, typeWords } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { AT_LEAST_TWO } from './library';
import { type Clauses, single } from './operands';

/**
 * `effect.look-cast-free`: "look at the top seven cards of your library. You may cast an instant or sorcery spell with mana value less than or equal to ~'s power from among them
 * without paying its mana cost. Put the rest on the bottom of your library in a random order." (CR 608.2g, 118.9, 202.3, 401.4: Velomachus Lorehold). Three sentences that
 * `splitSentences` keeps together. The engine's `lookAtTop` whose card taken is cast (`take.to: 'castFree'`) from the library, none or one, the rest on the bottom in a random
 * order. Not read: another place for the rest, a limit that is not the power of the source, a spell of the hand.
 */
export const EFFECT_LOOK_CAST_FREE = defineRule<Clauses>({
  id: 'effect.look-cast-free',
  family: 'effect',
  leading: ['look'],
  cites: [
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 202.3 (Mana Value)',
    'CR 401.4 (Library)',
  ],
  examples: [
    "look at the top seven cards of your library. You may cast an instant or sorcery spell with mana value less than or equal to ~'s power from among them without paying its mana cost. Put the rest on the bottom of your library in a random order",
    "look at the top five cards of your library. You may cast a creature spell with mana value less than or equal to ~'s power from among them without paying its mana cost. Put the rest on the bottom of your library in a random order",
  ],
  rejects: [
    "look at the top seven cards of your library. You may cast an instant or sorcery spell with mana value less than or equal to ~'s power from among them without paying its mana cost",
    "look at the top seven cards of your library. You may cast an instant or sorcery spell with mana value less than or equal to ~'s power from among them without paying its mana cost. Put the rest into your graveyard",
    "look at the top seven cards of your library. You may cast an instant or sorcery spell with mana value less than or equal to ~'s power from among them. Put the rest on the bottom of your library in a random order",
    'look at the top seven cards of your library. You may cast an instant or sorcery spell with mana value less than or equal to 3 from among them without paying its mana cost. Put the rest on the bottom of your library in a random order',
    "look at the top seven cards of your library. You may cast an instant or sorcery spell with mana value less than or equal to ~'s toughness from among them without paying its mana cost. Put the rest on the bottom of your library in a random order",
    "look at the top card of your library. You may cast an instant or sorcery spell with mana value less than or equal to ~'s power from among them without paying its mana cost. Put the rest on the bottom of your library in a random order",
    "look at the top seven cards of your library. You may cast an instant or sorcery card with mana value less than or equal to ~'s power from among them without paying its mana cost. Put the rest on the bottom of your library in a random order",
  ],
  parse: single(
    'effect.look-cast-free',
    sequence(
      literal('look at the top '),
      AT_LEAST_TWO,
      literal(' cards of your library. you may cast '),
      (ctx, pos) => {
        const one = sequence(
          pattern(/an? /iu),
          choice(typeChoice(CARD_TYPES), typeWords(CARD_TYPES, false)),
          literal(' spell'),
        )(ctx, pos);
        if (!one.ok) return one;
        const types = one.value[1];
        const filter: IrFilter = {
          ...(types.length === 1
            ? { types }
            : { anyOf: types.map((t): IrFilter => ({ types: [t], raw: t })) }),
          card: true,
          raw: ctx.text.slice(pos, one.pos),
        };
        const noun: IrNoun = {
          kind: 'noun',
          det: 'a',
          filter,
          upTo: false,
          plural: false,
          other: false,
          span: { start: pos, end: one.pos },
          rule: 'effect.look-cast-free',
        };
        return { ok: true, value: noun, pos: one.pos } as const;
      },
      spanned(pattern(/ with mana value less than or equal to ~['’]s power(?![\p{L}\p{N}])/iu)),
      literal(
        ' from among them without paying its mana cost. put the rest on the bottom of your library in a random order',
      ),
    ),
    ([, count, , take, limit]) => {
      const of: IrNoun = {
        kind: 'noun',
        det: 'self',
        filter: { raw: '~' },
        upTo: false,
        plural: false,
        other: false,
        span: limit.span,
        rule: 'effect.look-cast-free',
      };
      const atMost: IrAmount = { kind: 'powerOf', of, span: limit.span };
      return {
        verb: 'lookTake',
        args: {
          count,
          take,
          toGraveyard: {
            kind: 'flag',
            value: false,
            span: take.span,
            rule: 'effect.look-cast-free',
          },
          ontoBattlefield: {
            kind: 'flag',
            value: false,
            span: take.span,
            rule: 'effect.look-cast-free',
          },
          castFree: { kind: 'flag', value: true, span: take.span, rule: 'effect.look-cast-free' },
          manaValueAtMost: atMost,
        },
      };
    },
  ),
});

export const JESKAI_CASTFREE_EFFECT_RULES = [EFFECT_LOOK_CAST_FREE];
