/**
 * Lowerings of the Quandrix Unlimited deck, group D2: the instructions that reveal as many cards as an X says and put the cards of one kind onto the battlefield tapped, the rest on the
 * bottom of the library in a random order. Same contract as effects.ts: each declares the engine features it needs and is checked before it runs.
 */
import type { IrClause } from '../ir/types';
import { withoutZone } from '../rules/noun/phrases';
import { amountArg, arg, type Effects, failure, operand } from './clauses';
import { lowerFilter, playerSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * "Reveal cards from the top of your library until you reveal X land cards. Put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random
 * order." (CR 701.20, 401.4, 107.3a): the engine's `revealUntil` with a `count` (the X) that puts the cards found onto the battlefield tapped.
 */
const REVEAL_UNTIL_X: Lowering<IrClause, Effects> = {
  head: 'revealUntilX',
  id: 'lower.reveal-until-x',
  needs: ['effect:revealUntil', 'ability:revealUntilCount', 'amount:x'],
  lower(clause, ctx) {
    const card = arg(clause, 'card');
    if (card?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter({ ...card, filter: withoutZone(card.filter) });
    if (!filter.ok) return filter;
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return {
      ok: true,
      value: [
        {
          kind: 'revealUntil',
          filter: filter.value,
          count: count.value,
          put: 'battlefield',
          tapped: true,
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Reveal the top X cards of your library. Put all land cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order." (CR 701.20,
 * 401.4, 107.3a): the engine's `lookAtTop` of a reveal (`revealAll`) that takes every card of the kind (`take.all`) onto the battlefield tapped. The cards put are `moved`.
 */
const REVEAL_TOP_PUT_ALL: Lowering<IrClause, Effects> = {
  head: 'revealTopPutAll',
  id: 'lower.reveal-top-put-all',
  needs: ['effect:lookAtTop', 'ability:lookTakeAll', 'amount:x'],
  lower(clause, ctx) {
    const card = arg(clause, 'card');
    if (card?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter({ ...card, filter: withoutZone(card.filter) });
    if (!filter.ok) return filter;
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          revealAll: true,
          take: { filter: filter.value, max: 1, to: 'battlefield', tapped: true, all: true },
          rest: 'bottomRandom',
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Untap those lands." (CR 701.26a, 608.2c): the lands the instruction before it put onto the battlefield (`moved`), which only a reveal of the top that put cards there names; after any
 * other instruction "those lands" has no group and the clause is refused.
 */
const UNTAP_MOVED: Lowering<IrClause, Effects> = {
  head: 'untapMoved',
  id: 'lower.untap-moved',
  needs: ['effect:untap', 'selector:moved'],
  lower(clause, ctx) {
    if (ctx.lastEffectKind !== 'lookAtTop') return failure(clause);
    return { ok: true, value: [{ kind: 'untap', objects: { kind: 'moved' } }], rule: clause.rule };
  },
};

/**
 * "Reveal cards from the top of your library until you reveal that many creature cards. Put all creature cards revealed this way onto the battlefield, then shuffle the rest of the
 * revealed cards into your library." (Mass Polymorph, CR 701.20, 701.24, 608.2c): the engine's `revealUntil` with the creatures the exile before it exiled as its `count`, the rest left in
 * the library (`rest: 'stay'`), then a `shuffle`. "That many" is the exile of the instruction before; after any other instruction the clause is refused.
 */
const REVEAL_UNTIL_THAT_MANY: Lowering<IrClause, Effects> = {
  head: 'revealUntilThatMany',
  id: 'lower.reveal-until-that-many',
  needs: ['effect:revealUntil', 'ability:revealUntilCount', 'effect:shuffle'],
  lower(clause, ctx) {
    if (ctx.lastEffectKind !== 'exile') return failure(clause);
    const card = arg(clause, 'card');
    if (card?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter({ ...card, filter: withoutZone(card.filter) });
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        {
          kind: 'revealUntil',
          filter: filter.value,
          count: { kind: 'thisWay', what: 'exiledCreatures' },
          put: 'battlefield',
          rest: 'stay',
        },
        { kind: 'shuffle', player: { kind: 'you' } },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Target opponent reveals cards from the top of their library until they reveal a historic permanent card. You put that card onto the battlefield under your control and lose life equal to that
 * permanent's mana value. That player puts the rest of the revealed cards on the bottom of their library in a random order." (Jhoira, Weatherlight Corsair, issue 81, CR 701.20, 401.4,
 * 110.2a, 119.3): the engine's `revealUntil` of that player's library with the card found left in it, then `moveToZone` of that card onto the battlefield under the controller's control and the
 * life lost, the mana value of the permanent that entered.
 */
const REVEAL_UNTIL_TAKE_AND_LOSE_LIFE: Lowering<IrClause, Effects> = {
  head: 'revealUntilTakeAndLoseLife',
  id: 'lower.reveal-until-take-and-lose-life',
  needs: [
    'effect:revealUntil',
    'effect:moveToZone',
    'effect:loseLife',
    'selector:moved',
    'amount:manaValueOf',
  ],
  lower(clause, ctx) {
    const player = operand(clause, 'player');
    const card = arg(clause, 'card');
    if (player?.kind !== 'noun' || card?.kind !== 'noun') return failure(clause);
    // Only "target opponent": the player is chosen as the ability is put on the stack.
    if (player.det !== 'target' || player.filter.player !== 'opponent') return failure(clause);
    const from = playerSelectorOf(player, ctx);
    if (!from.ok) return from;
    const filter = lowerFilter({ ...card, filter: withoutZone(card.filter) });
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        { kind: 'revealUntil', filter: filter.value, put: 'none', from: from.value },
        { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'battlefield', controller: 'you' },
        {
          kind: 'loseLife',
          player: { kind: 'you' },
          amount: { kind: 'manaValueOf', of: { kind: 'moved' } },
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "That creature's controller reveals cards from the top of their library until they reveal a creature card. The player puts that card onto the battlefield and the rest on the bottom of their
 * library in any order." (Proteus Staff, issue 81, CR 701.20, 401.4, 110.2a, 608.2h): the engine's `revealUntil` of the library of the controller of the creature an earlier instruction named, the
 * card put under that player's control and the order of the rest chosen by the owner of the library.
 */
const REVEAL_UNTIL_PUTS_OWN: Lowering<IrClause, Effects> = {
  head: 'revealUntilPutsOwn',
  id: 'lower.reveal-until-puts-own',
  needs: ['effect:revealUntil', 'ability:revealUntilCount'],
  lower(clause, ctx) {
    const player = operand(clause, 'player');
    const card = arg(clause, 'card');
    if (player?.kind !== 'noun' || card?.kind !== 'noun') return failure(clause);
    const from = playerSelectorOf(player, ctx);
    if (!from.ok) return from;
    const filter = lowerFilter({ ...card, filter: withoutZone(card.filter) });
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        {
          kind: 'revealUntil',
          filter: filter.value,
          put: 'battlefield',
          from: from.value,
          putUnder: 'revealer',
          rest: 'bottomChosen',
        },
      ],
      rule: clause.rule,
    };
  },
};

export const QUANDRIX_D2_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  REVEAL_UNTIL_X,
  REVEAL_TOP_PUT_ALL,
  UNTAP_MOVED,
  REVEAL_UNTIL_THAT_MANY,
  REVEAL_UNTIL_TAKE_AND_LOSE_LIFE,
  REVEAL_UNTIL_PUTS_OWN,
];
