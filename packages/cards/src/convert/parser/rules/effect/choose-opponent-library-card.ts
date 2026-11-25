/**
 * Effect rule of group 5 of the Mind Flayarrrs deck (Captain N'ghathrod): "choose target artifact or creature card in an opponent's graveyard that was put there from their library this turn".
 */
import { literal, sequence } from '../../combinators';
import { defineRule, quietly } from '../registry';
import { type Clauses, operands, single } from './operands';

const ID = 'effect.choose-card-in-opponent-graveyard-from-library';

/**
 * `effect.choose-card-in-opponent-graveyard-from-library`: "choose target artifact or creature card in an opponent's graveyard that was put there from their library this turn" (CR 115.1,
 * 601.2c, 603.3d: the target is chosen as the triggered ability is put on the stack; the words only name it for the sentence after, which says "it"). The engine's target of the ability, with
 * no effect of its own (as `effect.choose-card-in-a-graveyard-this-turn`). Not read: "choose" without a target, several cards, "up to", another graveyard, another instruction in the same sentence.
 */
export const EFFECT_CHOOSE_CARD_IN_OPPONENT_GRAVEYARD_FROM_LIBRARY = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['choose'],
  cites: ['CR 115.1 (Targets)', 'CR 601.2c (Casting Spells)', 'CR 603.3d (Triggered Abilities)'],
  examples: [
    "choose target artifact or creature card in an opponent's graveyard that was put there from their library this turn",
    "Choose target creature card in an opponent's graveyard that was put there from their library this turn",
  ],
  rejects: [
    'choose',
    "choose target creature card in an opponent's graveyard",
    "choose up to one target creature card in an opponent's graveyard that was put there from their library this turn",
    "choose two target creature cards in an opponent's graveyard that was put there from their library this turn",
    'choose target creature card in a graveyard that was put there from their library this turn',
    "choose creature card in an opponent's graveyard that was put there from their library this turn",
    "choose target creature card in an opponent's graveyard that was put there from their library this turn and draw a card",
  ],
  parse: single(
    ID,
    sequence(
      literal('choose '),
      operands(['noun.target-card-in-opponent-graveyard-from-library'], ID, {
        accept: (noun) => noun.det === 'target' && !noun.plural && noun.count === undefined,
        locate: (noun) => noun.span.start,
      }),
    ),
    ([, what]) => ({ verb: 'chooseTarget', args: { what } }),
  ),
});

export const CHOOSE_OPPONENT_LIBRARY_CARD_EFFECT_RULES = [
  EFFECT_CHOOSE_CARD_IN_OPPONENT_GRAVEYARD_FROM_LIBRARY,
].map(quietly);
