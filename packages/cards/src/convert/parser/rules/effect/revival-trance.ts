/**
 * Effect rules of the Revival Trance deck (issue 97): "Starting with the next opponent in turn order, each opponent chooses a creature card in your graveyard that hasn't been
 * chosen. Return each card chosen this way to the battlefield under your control."
 */
import { pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { NO_PARTS, toFilter } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.opponents-choose-graveyard-card';

/**
 * `effect.opponents-choose-graveyard-card`: the two sentences are one instruction (`segment.ts`). Each opponent of the controller, the next one in turn order first, chooses a card of
 * the controller's graveyard that nobody chose before, and the cards chosen enter the battlefield together under the controller's control (CR 101.4: players choosing in turn
 * order; CR 608.2d: the choice; CR 404.1: the graveyard is the controller's; CR 110.2a: under your control). The engine's `eachOpponentChoosesGraveyardCard`. Not read: another
 * starting player, "each player", a graveyard that is not yours, another number of cards, a count or a list of types, another destination, "tapped", a join to another instruction.
 */
export const EFFECT_OPPONENTS_CHOOSE_GRAVEYARD_CARD = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['starting'],
  cites: [
    'CR 101.4 (Handling Simultaneous Actions)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 404.1 (Graveyard)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    "starting with the next opponent in turn order, each opponent chooses a creature card in your graveyard that hasn't been chosen. return each card chosen this way to the battlefield under your control",
    "Starting with the next opponent in turn order, each opponent chooses a creature card in your graveyard that hasn't been chosen. Return each card chosen this way to the battlefield under your control",
  ],
  rejects: [
    "starting with the next opponent in turn order, each opponent chooses a creature card in your graveyard that hasn't been chosen",
    "starting with you, each opponent chooses a creature card in your graveyard that hasn't been chosen. return each card chosen this way to the battlefield under your control",
    "starting with the next opponent in turn order, each player chooses a creature card in your graveyard that hasn't been chosen. return each card chosen this way to the battlefield under your control",
    "starting with the next opponent in turn order, each opponent chooses a creature card in a graveyard that hasn't been chosen. return each card chosen this way to the battlefield under your control",
    'starting with the next opponent in turn order, each opponent chooses a creature card in your graveyard. return each card chosen this way to the battlefield under your control',
    "starting with the next opponent in turn order, each opponent chooses a creature card in your graveyard that hasn't been chosen. return each card chosen this way to your hand",
    "starting with the next opponent in turn order, each opponent chooses a creature card in your graveyard that hasn't been chosen. return each card chosen this way to the battlefield tapped under your control",
    "starting with the next opponent in turn order, each opponent chooses two creature cards in your graveyard that haven't been chosen. return each card chosen this way to the battlefield under your control",
    "starting with the next opponent in turn order, each opponent chooses a creature card in your graveyard that hasn't been chosen. return each card chosen this way to the battlefield under your control and draw a card",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /starting with the next opponent in turn order, each opponent chooses an? (artifact|creature|enchantment|land|planeswalker) card in your graveyard that hasn['’]t been chosen\. return each card chosen this way to the battlefield under your control(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const type = (r.value.value[1] ?? '').toLowerCase();
    const span = r.value.span;
    const objects: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: {
        ...toFilter('graveyard', { ...NO_PARTS, types: [type] }, `${type} card`),
        card: true,
      },
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: ID,
    };
    return {
      ok: true,
      value: [makeClause(ID, 'opponentsChooseGraveyardCard', { objects }, span)],
      pos: r.pos,
    };
  },
});

export const REVIVAL_TRANCE_EFFECT_RULES = [EFFECT_OPPONENTS_CHOOSE_GRAVEYARD_CARD].map(quietly);
