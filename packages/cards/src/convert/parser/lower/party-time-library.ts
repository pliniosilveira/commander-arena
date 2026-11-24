/**
 * Lowering of the Party Time deck, group "library": "You may exile any number of non-Angel creatures you control until this creature leaves the battlefield" (Glorious Protector,
 * CR 608.2d, 610.3) is the engine's `moveToZone` into exile of an `anyNumber` choice among the controller's permanents, with `until` (the cards return when the permanent with
 * the ability leaves the battlefield). Only in an ability of a permanent: an instant or a sorcery has no permanent to leave.
 */
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import { lowerFilter, playerSelectorOf } from './nouns';
import type { Lowering } from './types';

const EXILE_ANY_NUMBER_UNTIL_LEAVES: Lowering<IrClause, Effects> = {
  head: 'exileAnyNumberUntilLeaves',
  id: 'lower.exile-any-number-until-leaves',
  needs: ['effect:moveToZone', 'selector:choose', 'ability:chooseExileUntilLeaves'],
  // "Any number" includes none, so the choice is the offer itself: with or without "you may" the engine asks once, for none or some permanents (CR 608.2d).
  acceptsOptional: true,
  lower(clause, ctx) {
    const objects = arg(clause, 'objects');
    if (objects?.kind !== 'noun' || ctx.owner === 'spell') return failure(clause);
    const filter = lowerFilter(objects);
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: { ...filter.value, zone: 'battlefield', controller: 'you' },
            anyNumber: true,
            optional: true,
          },
          to: 'exile',
          untilSourceLeaves: true,
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Look at the top four cards of your library. You may reveal a Cleric card, a Rogue card, a Warrior card, and/or a Wizard card from among them and put those cards into your hand.
 * Put the rest on the bottom of your library in a random order." (Harper Recruiter, CR 701.20, 401.4, 608.2d): the engine's `lookAtTop` with `take.kinds`, one card for each kind.
 */
const LOOK_TAKE_KINDS: Lowering<IrClause, Effects> = {
  head: 'lookTakeKinds',
  id: 'lower.look-take-kinds',
  needs: ['effect:lookAtTop', 'ability:lookTakeKinds'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    const list = arg(clause, 'kinds');
    if (list?.kind !== 'nounList' || list.items.length < 2) return failure(clause);
    const kinds = [];
    for (const item of list.items) {
      const filter = lowerFilter(item);
      if (!filter.ok) return filter;
      kinds.push(filter.value);
    }
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          take: { filter: {}, max: kinds.length, kinds },
          rest: 'bottomRandom',
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Look at the top four cards of target opponent's library, exile one of them face down, then put the rest on the bottom of that library in a random order. You may cast that card for as
 * long as it remains exiled, and mana of any type can be spent to cast that spell." (Gonti, Lord of Luxury, CR 401.2, 406.3, 609.4b): the engine's `lookAtTop` of the library of the
 * target player, the card taken exiled face down and remembered by nobody, then a `mayPlay` of that card (`moved`) that lasts while it is exiled, to cast only, looking at it, any mana type.
 */
const LOOK_EXILE_CAST_ANY_TYPE: Lowering<IrClause, Effects> = {
  head: 'lookExileCastAnyType',
  id: 'lower.look-exile-cast-any-type',
  needs: ['effect:lookAtTop', 'effect:mayPlay', 'ability:lookTakeFromPlayer'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    const owner = arg(clause, 'from');
    if (owner?.kind !== 'noun') return failure(clause);
    const from = playerSelectorOf(owner, ctx);
    if (!from.ok) return from;
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          from: from.value,
          take: { filter: {}, max: 1, min: 1, to: 'exileFaceDownUnlinked' },
          rest: 'bottomRandom',
        },
        {
          kind: 'mayPlay',
          objects: { kind: 'moved' },
          lasts: 'whileExiled',
          lookAt: true,
          castOnly: true,
          anyManaType: true,
        },
      ],
      rule: clause.rule,
    };
  },
};

export const PARTY_TIME_LIBRARY_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  LOOK_EXILE_CAST_ANY_TYPE,
  EXILE_ANY_NUMBER_UNTIL_LEAVES,
  LOOK_TAKE_KINDS,
];
