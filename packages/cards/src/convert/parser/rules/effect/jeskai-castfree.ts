/**
 * Effects of the Jeskai free-cast cards (deck support issue 100): a free cast of a spell from among the cards looked at, from the library they are still in.
 */
import { choice, literal, map, pattern, quiet, sequence } from '../../combinators';
import type { IrAmount, IrFilter, IrNoun } from '../../ir/types';
import { NOUN_ITS_CONTROLLER } from '../noun/controller';
import { CARD_TYPES, typeChoice, typeWords } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { AT_LEAST_TWO } from './library';
import { type Clauses, makeClause, single } from './operands';

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

/**
 * `effect.look-cast-free-any`: "look at the top four cards of your library. You may cast a spell from among them without paying its mana cost. Put the rest on the bottom of your library
 * in a random order." (issue 345, Svella, Ice Shaper; CR 608.2g, 118.9, 401.4): the same three sentences as `effect.look-cast-free` with any spell (a nonland card) and no limit on its
 * mana value. The engine's `lookAtTop` whose card taken is cast (`take.to: 'castFree'`), none or one, the rest on the bottom in a random order. Not read: a kind of spell, a limit,
 * another place for the rest, the top card alone, "any order".
 */
export const EFFECT_LOOK_CAST_FREE_ANY = defineRule<Clauses>({
  id: 'effect.look-cast-free-any',
  family: 'effect',
  leading: ['look'],
  cites: [
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 401.4 (Library)',
  ],
  examples: [
    'look at the top four cards of your library. You may cast a spell from among them without paying its mana cost. Put the rest on the bottom of your library in a random order',
  ],
  rejects: [
    'look at the top four cards of your library. You may cast a spell from among them without paying its mana cost',
    'look at the top four cards of your library. You may cast a spell from among them without paying its mana cost. Put the rest into your graveyard',
    'look at the top four cards of your library. You may cast a spell from among them without paying its mana cost. Put the rest on the bottom of your library in any order',
    'look at the top four cards of your library. You may cast a creature spell from among them without paying its mana cost. Put the rest on the bottom of your library in a random order',
    'look at the top card of your library. You may cast a spell from among them without paying its mana cost. Put the rest on the bottom of your library in a random order',
    'look at the top four cards of your library. You may cast a spell from among them. Put the rest on the bottom of your library in a random order',
  ],
  parse: single(
    'effect.look-cast-free-any',
    sequence(
      literal('look at the top '),
      AT_LEAST_TWO,
      literal(
        ' cards of your library. you may cast a spell from among them without paying its mana cost. put the rest on the bottom of your library in a random order',
      ),
    ),
    ([, count]) => {
      const id = 'effect.look-cast-free-any';
      const take: IrNoun = {
        kind: 'noun',
        det: 'a',
        filter: { notTypes: ['land'], card: true, raw: 'a spell' },
        upTo: false,
        plural: false,
        other: false,
        span: count.span,
        rule: id,
      };
      const flag = (value: boolean) => ({
        kind: 'flag' as const,
        value,
        span: take.span,
        rule: id,
      });
      return {
        verb: 'lookTake',
        args: {
          count,
          take,
          toGraveyard: flag(false),
          ontoBattlefield: flag(false),
          castFree: flag(true),
        },
      };
    },
  ),
});

/**
 * `effect.reveal-x-cast-free`: "reveal the top X cards of your library, where X is that spell's mana value. You may cast a spell with mana value X or less from among cards revealed
 * this way without paying its mana cost. Put the rest on the bottom of your library in a random order." (Sunbird's Invocation; CR 701.20a, 608.2g, 118.9, 202.3, 401.4, 603.3d). Three
 * sentences that `splitSentences` keeps together, in the effect of a trigger about a cast spell. The engine's `lookAtTop` of a reveal (`revealAll`) whose card taken is cast
 * (`take.to: 'castFree'`) from the library, none or one, with a mana value at most the same amount, the rest on the bottom in a random order. Not read: another amount for the cards
 * revealed, another limit than the same X, a kind of spell, another place for the rest, "any order", a sentence missing.
 */
export const EFFECT_REVEAL_X_CAST_FREE = defineRule<Clauses>({
  id: 'effect.reveal-x-cast-free',
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 202.3 (Mana Value)',
    'CR 401.4 (Library)',
  ],
  examples: [
    "reveal the top X cards of your library, where X is that spell's mana value. You may cast a spell with mana value X or less from among cards revealed this way without paying its mana cost. Put the rest on the bottom of your library in a random order",
  ],
  rejects: [
    "reveal the top X cards of your library, where X is that spell's mana value. You may cast a spell with mana value X or less from among cards revealed this way without paying its mana cost",
    "reveal the top X cards of your library, where X is that spell's mana value. You may cast a spell with mana value X or less from among cards revealed this way without paying its mana cost. Put the rest into your graveyard",
    "reveal the top X cards of your library, where X is that spell's mana value. You may cast a spell with mana value X or less from among cards revealed this way without paying its mana cost. Put the rest on the bottom of your library in any order",
    "reveal the top X cards of your library, where X is that spell's mana value. You may cast a spell with mana value X or less from among cards revealed this way. Put the rest on the bottom of your library in a random order",
    "reveal the top X cards of your library, where X is that spell's mana value. You may cast a creature spell with mana value X or less from among cards revealed this way without paying its mana cost. Put the rest on the bottom of your library in a random order",
    "reveal the top X cards of your library, where X is that spell's mana value. You may cast a spell from among cards revealed this way without paying its mana cost. Put the rest on the bottom of your library in a random order",
    "reveal the top X cards of your library, where X is that card's mana value. You may cast a spell with mana value X or less from among cards revealed this way without paying its mana cost. Put the rest on the bottom of your library in a random order",
    'reveal the top three cards of your library. You may cast a spell with mana value X or less from among cards revealed this way without paying its mana cost. Put the rest on the bottom of your library in a random order',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/reveal the top X cards of your library, where X is /iu),
      family<IrAmount>('amount', { only: ['amount.that-spells-mana-value'] }),
      pattern(
        /\. you may cast a spell with mana value X or less from among cards revealed this way without paying its mana cost\. put the rest on the bottom of your library in a random order(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const id = 'effect.reveal-x-cast-free';
    const span = { start: pos, end: r.pos };
    const take: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: { notTypes: ['land'], card: true, raw: 'a spell' },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: id,
    };
    const flag = (value: boolean) => ({ kind: 'flag' as const, value, span, rule: id });
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'lookTake',
          {
            count: r.value[1],
            take,
            toGraveyard: flag(false),
            ontoBattlefield: flag(false),
            castFree: flag(true),
            revealAll: flag(true),
            manaValueAtMost: r.value[1],
          },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.counter-exile-cast`: "counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard, then you may cast it without
 * paying its mana cost." (CR 701.6a, 614.1a, 608.2g: Transcendent Dragon). Two sentences that `splitSentences` keeps together. The engine's `counter` with `exileInstead`, then a
 * `castFree` of the card exiled. Not read: a counter with a condition ("unless"), another place for the spell, a cast that costs mana, the second sentence alone.
 */
export const EFFECT_COUNTER_EXILE_CAST = defineRule<Clauses>({
  id: 'effect.counter-exile-cast',
  family: 'effect',
  leading: ['counter'],
  cites: [
    'CR 701.6a (Counter)',
    'CR 614.1a (Replacement Effects)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
  ],
  examples: [
    "counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard, then you may cast it without paying its mana cost",
    "counter target noncreature spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard, then you may cast it without paying its mana cost",
  ],
  rejects: [
    "counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard",
    "counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard, then you may cast it",
    "counter target spell. If that spell is countered this way, put it into its owner's hand, then you may cast it without paying its mana cost",
    "counter target spell unless its controller pays {1}. If that spell is countered this way, exile it instead of putting it into its owner's graveyard, then you may cast it without paying its mana cost",
    "counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard, then you may cast it by paying {2}",
    "counter target spell. If that creature is countered this way, exile it instead of putting it into its owner's graveyard, then you may cast it without paying its mana cost",
  ],
  parse: single(
    'effect.counter-exile-cast',
    sequence(
      literal('counter '),
      family<IrNoun>('noun', {
        only: ['noun.target-spell'],
      }),
      pattern(
        /\. if that spell is countered this way, exile it instead of putting it into its owner['’]s graveyard, then you may cast it without paying its mana cost(?![\p{L}\p{N}])/iu,
      ),
    ),
    ([, objects]) => ({ verb: 'counterExileCast', args: { objects } }),
  ),
});

/**
 * `effect.destroyed-controller-exile-cast`: "if that permanent is destroyed this way, its controller exiles cards from the top of their library until they exile a nonland card,
 * then they may cast that card without paying its mana cost." (CR 701.8, 701.13, 608.2g, 118.9: Transforming Flourish). The sentence after a destroy: when the permanent was
 * destroyed (not when it was indestructible or regenerated), the player who controlled it exiles from the top of their own library until a nonland card is exiled and may cast
 * that card for free. The engine's `exileUntilFound` and `castFree` of the card exiled, for that player, behind `thisWayAtLeast` of the `destroyed` count. Not read: another
 * moment of the condition, another player, a land, a cast that costs mana, a kind of card other than nonland.
 */
export const EFFECT_DESTROYED_CONTROLLER_EXILE_CAST = defineRule<Clauses>({
  id: 'effect.destroyed-controller-exile-cast',
  family: 'effect',
  leading: ['if'],
  cites: [
    'CR 701.8 (Destroy)',
    'CR 701.13 (Exile)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
  ],
  examples: [
    'if that permanent is destroyed this way, its controller exiles cards from the top of their library until they exile a nonland card, then they may cast that card without paying its mana cost',
    'if that creature is destroyed this way, its controller exiles cards from the top of their library until they exile a nonland card, then they may cast that card without paying its mana cost',
  ],
  rejects: [
    'if that permanent is destroyed this way, its controller exiles cards from the top of their library until they exile a nonland card',
    'if that permanent is destroyed this way, its controller exiles cards from the top of their library until they exile a land card, then they may cast that card without paying its mana cost',
    'if that permanent is destroyed this way, you exile cards from the top of your library until you exile a nonland card, then you may cast that card without paying its mana cost',
    'if that permanent is exiled this way, its controller exiles cards from the top of their library until they exile a nonland card, then they may cast that card without paying its mana cost',
    'if that permanent is destroyed this way, its controller exiles cards from the top of their library until they exile a nonland card, then they may cast that card',
    'that permanent is destroyed this way, its controller exiles cards from the top of their library until they exile a nonland card, then they may cast that card without paying its mana cost',
  ],
  parse: (ctx, pos) =>
    map(
      spanned(
        quiet(
          sequence(
            pattern(/if that (?:permanent|creature|artifact) is destroyed this way, /iu),
            NOUN_ITS_CONTROLLER.parse,
            pattern(
              / exiles cards from the top of their library until they exile a nonland card, then they may cast that card without paying its mana cost(?![\p{L}\p{N}])/iu,
            ),
          ),
        ),
      ),
      ({ value, span }): Clauses => [
        makeClause(
          'effect.destroyed-controller-exile-cast',
          'destroyedControllerExileCast',
          { player: value[1] },
          span,
        ),
      ],
    )(ctx, pos),
});

// Read quietly: these start like the plain look, counter and "if" rules, so they must not move the point where a line they do not read stops.
export const JESKAI_CASTFREE_EFFECT_RULES = [
  EFFECT_LOOK_CAST_FREE,
  EFFECT_LOOK_CAST_FREE_ANY,
  EFFECT_REVEAL_X_CAST_FREE,
  EFFECT_COUNTER_EXILE_CAST,
  EFFECT_DESTROYED_CONTROLLER_EXILE_CAST,
].map(quietly);
