/**
 * The delayed draw (stage P26; D-128): "You draw a card at the beginning of the next turn's upkeep." and its
 * imperative form "Draw a card at the beginning of the next turn's upkeep." (CR 603.7: an effect may create a
 * delayed triggered ability that does something at a later time). One clause, `delayedDraw`, with the player
 * (always "you", written or implied) and the number of cards; the lowering builds the engine's `delayedTrigger`
 * at the upkeep of each turn whose effect is the draw.
 *
 * Only the draw and only "the next turn's upkeep" are read: the second sentence of Arcane Denial ("Its
 * controller may draw up to N cards ...") needs a player remembered from the resolution and a number the player
 * chooses, which the engine lacks (D-128), so it stays text the grammar does not read.
 */
import { choice, literal, map, pattern, quiet, sequence } from '../../combinators';
import type { IrAmount, IrManaSpec, IrNoun } from '../../ir/types';
import { NOUN_ITS_CONTROLLER } from '../noun/controller';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';
import { impliedYou } from './player';

/** A fixed number of cards: "a card", "two cards" ("X cards" is not a fixed amount and is not read). */
const CARD_COUNT = map(
  sequence(
    family<IrAmount>('amount', { only: ['amount.number', 'amount.article'] }),
    pattern(/ cards?(?![\p{L}\p{N}])/iu),
  ),
  ([amount]) => amount,
);

/**
 * " at the beginning of the next turn's upkeep": the first upkeep step to begin, whoever's turn it is. The clause
 * ends there: a join and a second instruction ("... upkeep and lose 1 life") would leave open whether that one is
 * delayed too, so it is not read.
 */
const NEXT_UPKEEP = pattern(
  /\sat the beginning of the next turn['’]s upkeep(?![\p{L}\p{N}])(?!,| and\b| then\b)/iu,
);

/**
 * `effect.delayed-draw`: "you draw a card at the beginning of the next turn's upkeep" (CR 603.7, CR 121.1). The
 * card says "the next turn's upkeep", the upkeep of whichever turn comes next (the engine's `whose: 'each'`).
 * Tried before `effect.player` and `effect.draw`, whose phrase is a prefix of this one. Read quietly: a text this
 * rule does not read (a plain "Draw cards equal to ...") leaves the diagnostics of the rules after it as they were.
 */
export const EFFECT_DELAYED_DRAW = defineRule<Clauses>({
  id: 'effect.delayed-draw',
  family: 'effect',
  leading: ['you', 'draw'],
  cites: [
    'CR 603.7 (Handling Triggered Abilities)',
    'CR 603.7a (Handling Triggered Abilities)',
    'CR 121.1 (Drawing a Card)',
  ],
  examples: [
    "you draw a card at the beginning of the next turn's upkeep",
    "draw a card at the beginning of the next turn's upkeep",
    "you draw two cards at the beginning of the next turn's upkeep",
    'Draw a card at the beginning of the next turn’s upkeep',
  ],
  rejects: [
    "you draw X cards at the beginning of the next turn's upkeep",
    "you draw cards at the beginning of the next turn's upkeep",
    'you draw a card at the beginning of your next upkeep',
    'you draw a card at the beginning of the next upkeep',
    "you draw a card at the beginning of the next turn's end step",
    "you draw a card at the beginning of the next turn's draw step",
    'you draw a card at the beginning of the next turn',
    "you draw a card at the beginning of the next turn's upkeeps",
    "you draw a card for each creature at the beginning of the next turn's upkeep",
    "you may draw a card at the beginning of the next turn's upkeep",
    "target player draws a card at the beginning of the next turn's upkeep",
    "each opponent draws a card at the beginning of the next turn's upkeep",
    "its controller draws a card at the beginning of the next turn's upkeep",
    "its controller may draw up to two cards at the beginning of the next turn's upkeep",
    "you draw a card at the beginning of the next turn's upkeep and lose 1 life",
    "you draw a card at the beginning of the next turn's upkeep, then discard a card",
    'you draw a card',
    'draw a card',
    "draws a card at the beginning of the next turn's upkeep",
    "you gain 2 life at the beginning of the next turn's upkeep",
  ],
  parse: (ctx, pos) =>
    map(
      spanned(
        quiet(sequence(choice(literal('you draw '), literal('draw ')), CARD_COUNT, NEXT_UPKEEP)),
      ),
      ({ value, span }): Clauses => {
        const player: IrNoun = impliedYou('effect.delayed-draw', pos);
        return [
          makeClause('effect.delayed-draw', 'delayedDraw', { player, amount: value[1] }, span),
        ];
      },
    )(ctx, pos),
});

/**
 * `effect.delayed-draw-up-to`: "its controller may draw up to two cards at the beginning of the next turn's upkeep" (stage P64, D-217, CR 603.7, 603.7c, 121.1,
 * 608.2d: the player who controlled the spell this ability targeted, as it was as the ability resolved, chooses how many cards from none to the number). The
 * engine's delayed `draw` with `upTo`. Read quietly, as `effect.delayed-draw`. Not read: another player, "you may", a number that is not fixed, another moment.
 */
export const EFFECT_DELAYED_DRAW_UP_TO = defineRule<Clauses>({
  id: 'effect.delayed-draw-up-to',
  family: 'effect',
  leading: ['its', 'that'],
  cites: [
    'CR 603.7 (Handling Triggered Abilities)',
    'CR 603.7c (Handling Triggered Abilities)',
    'CR 121.1 (Drawing a Card)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    "its controller may draw up to two cards at the beginning of the next turn's upkeep",
    'its controller may draw up to three cards at the beginning of the next turn’s upkeep',
  ],
  rejects: [
    "its controller may draw two cards at the beginning of the next turn's upkeep",
    'its controller may draw up to two cards at the beginning of your next upkeep',
    "its controller may draw up to X cards at the beginning of the next turn's upkeep",
    "its owner may draw up to two cards at the beginning of the next turn's upkeep",
    "its controller draws up to two cards at the beginning of the next turn's upkeep",
    "its controller may draw up to two cards at the beginning of the next turn's upkeep and lose 1 life",
    'its controller may draw up to two cards',
  ],
  parse: (ctx, pos) =>
    map(
      spanned(
        quiet(
          sequence(
            NOUN_ITS_CONTROLLER.parse,
            literal(' may draw up to '),
            family<IrAmount>('amount', { only: ['amount.number'] }),
            pattern(/ cards(?![\p{L}\p{N}])/iu),
            NEXT_UPKEEP,
          ),
        ),
      ),
      ({ value, span }): Clauses => [
        makeClause(
          'effect.delayed-draw-up-to',
          'delayedDrawUpTo',
          { player: value[0], amount: value[2] },
          span,
        ),
      ],
    )(ctx, pos),
});

/**
 * `effect.delayed-mana`: "add an amount of {C} equal to the amount of mana spent to cast that spell at the beginning of your next main phase" (stage P64,
 * D-217, CR 603.7, 603.7c, 601.2h, 106.4: a delayed triggered ability adds the mana at the beginning of the controller's next main phase; the amount is what
 * was spent on the spell the ability targeted, fixed as it was created). The engine's delayed `addMana`. Not read: another symbol or a choice, a spell that is
 * not "that spell", another moment, an amount that is not the mana spent.
 */
export const EFFECT_DELAYED_MANA = defineRule<Clauses>({
  id: 'effect.delayed-mana',
  family: 'effect',
  leading: ['add'],
  cites: [
    'CR 603.7 (Handling Triggered Abilities)',
    'CR 603.7c (Handling Triggered Abilities)',
    'CR 601.2h (Casting Spells)',
    'CR 500.1 (Beginning of Turn)',
  ],
  examples: [
    'add an amount of {C} equal to the amount of mana spent to cast that spell at the beginning of your next main phase',
  ],
  rejects: [
    'add an amount of {C} equal to the amount of mana spent to cast that spell',
    'add an amount of {G} equal to the amount of mana spent to cast that spell at the beginning of your next main phase',
    'add an amount of {C} equal to the amount of mana spent to cast it at the beginning of your next main phase',
    'add an amount of {C} equal to the amount of mana spent to cast that spell at the beginning of the next main phase',
    'add an amount of {C} equal to the amount of mana spent to cast that spell at the beginning of your next end step',
    'add an amount of {C} equal to its mana value at the beginning of your next main phase',
    'add {C} at the beginning of your next main phase',
  ],
  parse: (ctx, pos) =>
    map(
      spanned(
        quiet(
          sequence(
            literal('add an amount of '),
            pattern(/\{C\}/u),
            literal(' equal to the amount of mana spent to cast '),
            spanned(pattern(/that spell(?![\p{L}\p{N}])/iu)),
            pattern(
              / at the beginning of your next main phase(?![\p{L}\p{N}])(?!,| and\b| then\b)/iu,
            ),
          ),
        ),
      ),
      ({ value, span }): Clauses => {
        const spell: IrNoun = {
          kind: 'noun',
          det: 'anaphor',
          filter: { raw: 'that spell' },
          upTo: false,
          plural: false,
          other: false,
          span: value[3].span,
          rule: 'effect.delayed-mana',
        };
        const mana: IrManaSpec = {
          kind: 'manaSpec',
          what: { kind: 'symbols', symbols: ['C'] },
          span,
          rule: 'effect.delayed-mana',
        };
        return [makeClause('effect.delayed-mana', 'delayedMana', { mana, spell }, span)];
      },
    )(ctx, pos),
});

export const DELAYED_RULES = [EFFECT_DELAYED_DRAW, EFFECT_DELAYED_DRAW_UP_TO, EFFECT_DELAYED_MANA];
