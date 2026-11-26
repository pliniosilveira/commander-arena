/**
 * Effect rule of the Jump Scare! deck (Disorienting Choice): "For each opponent, choose up to one target artifact or enchantment that player controls. For each permanent chosen this way, its
 * controller may exile it. Then if one or more of the chosen permanents are still on the battlefield, you search your library for up to that many land cards, put them onto the battlefield
 * tapped, then shuffle." (CR 115.1, 601.2c: one slot that takes at most one target of each opponent; CR 608.2d, 101.4: each controller decides about the permanents they control, in turn order;
 * CR 701.13: exile; CR 701.23: search; CR 400.7: a permanent exiled is a new object and is no longer "still on the battlefield"). The three sentences are one instruction that `splitSentences`
 * keeps together; the clause is lowered to the engine's `controllersMayExile` of a `onePerOpponent` slot and a search that reads `thisWay` `chosenStillOnBattlefield`.
 */
import { literal, sequence } from '../../combinators';
import { defineRule, quietly } from '../registry';
import { perOpponentNoun } from './angels';
import { type Clauses, makeClause } from './operands';

const CHOOSE = 'for each opponent, choose up to one target ';
const TAIL =
  '. for each permanent chosen this way, its controller may exile it. then if one or more of the chosen permanents are still on the battlefield, you search your library for up to that many land cards, put them onto the battlefield tapped, then shuffle';

export const EFFECT_CHOOSE_PER_OPPONENT_MAY_EXILE = defineRule<Clauses>({
  id: 'effect.choose-per-opponent-controllers-may-exile',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 101.4 (Handling Simultaneous Actions)',
    'CR 701.13 (Exile)',
    'CR 701.23 (Search)',
  ],
  examples: [
    'for each opponent, choose up to one target artifact or enchantment that player controls. for each permanent chosen this way, its controller may exile it. then if one or more of the chosen permanents are still on the battlefield, you search your library for up to that many land cards, put them onto the battlefield tapped, then shuffle',
    'for each opponent, choose up to one target creature that player controls. for each permanent chosen this way, its controller may exile it. then if one or more of the chosen permanents are still on the battlefield, you search your library for up to that many land cards, put them onto the battlefield tapped, then shuffle',
  ],
  rejects: [
    'for each opponent, choose up to one target artifact or enchantment that player controls',
    'for each opponent, choose up to one target artifact or enchantment that player controls. for each permanent chosen this way, its controller may exile it',
    'for each opponent, choose one target artifact or enchantment that player controls. for each permanent chosen this way, its controller may exile it. then if one or more of the chosen permanents are still on the battlefield, you search your library for up to that many land cards, put them onto the battlefield tapped, then shuffle',
    'for each opponent, choose up to one target artifact or enchantment you control. for each permanent chosen this way, its controller may exile it. then if one or more of the chosen permanents are still on the battlefield, you search your library for up to that many land cards, put them onto the battlefield tapped, then shuffle',
    'for each opponent, choose up to one target artifact or enchantment that player controls. for each permanent chosen this way, its controller may destroy it. then if one or more of the chosen permanents are still on the battlefield, you search your library for up to that many land cards, put them onto the battlefield tapped, then shuffle',
    'for each opponent, choose up to one target artifact or enchantment that player controls. for each permanent chosen this way, its controller may exile it. then if one or more of the chosen permanents are still on the battlefield, you search your library for up to that many basic land cards, put them onto the battlefield tapped, then shuffle',
    'for each opponent, choose up to one target artifact or enchantment that player controls. for each permanent chosen this way, its controller may exile it. then if one or more of the chosen permanents are still on the battlefield, you search your library for up to that many land cards, put them onto the battlefield, then shuffle',
    'for each player, choose up to one target artifact or enchantment that player controls. for each permanent chosen this way, its controller may exile it. then if one or more of the chosen permanents are still on the battlefield, you search your library for up to that many land cards, put them onto the battlefield tapped, then shuffle',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.choose-per-opponent-controllers-may-exile';
    const head = literal(CHOOSE)(ctx, pos);
    if (!head.ok) return head;
    const noun = perOpponentNoun(ctx, pos, 'choose', head.pos, id);
    if (!noun.ok) return noun;
    const tail = sequence(literal(TAIL))(ctx, noun.pos);
    if (!tail.ok) return tail;
    const span = { start: pos, end: tail.pos };
    return {
      ok: true,
      value: [makeClause(id, 'chooseTargetsControllersMayExile', { objects: noun.value }, span)],
      pos: tail.pos,
    };
  },
});

export const CONTROLLERS_MAY_EXILE_EFFECT_RULES = [EFFECT_CHOOSE_PER_OPPONENT_MAY_EXILE].map(
  quietly,
);
