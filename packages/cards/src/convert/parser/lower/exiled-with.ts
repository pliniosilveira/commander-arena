/**
 * Lowerings of Valakut Exploration (the Tannuk landfall group): "put them into their owner's graveyard" after the intervening "if there are
 * cards exiled with ~". "Them" are the cards that condition counted, which the engine names `linkedExile`, and "that much" is how many of them were put there (`movedCount`).
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure, operand } from './clauses';
import type { FeatureRef } from './features';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

/** "Put them into their owner's graveyard" (CR 607.2a, 400.3): the cards the permanent exiled with its linked ability, still in exile, go to their owners' graveyards. */
const PUT_EXILED_WITH_GRAVEYARD: Lowering<IrClause, Effects> = {
  head: 'putExiledWithGraveyard',
  id: 'lower.put-exiled-with-graveyard',
  needs: ['effect:moveToZone'],
  lower(clause, ctx) {
    // "Them" has an antecedent only in "if there are cards exiled with ~", the intervening "if" of the same ability.
    if (!ctx.exiledWithCondition) return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'moveToZone', objects: { kind: 'linkedExile' }, to: 'graveyard' }],
      rule: clause.rule,
    };
  },
};

/**
 * "Return those cards to the battlefield under their owner's control" (Colfenor's Urn, CR 607.2a, 400.3, 110.2a): the cards the permanent exiled with its linked ability, still in exile, each
 * under the control of its owner. As `PUT_EXILED_WITH_GRAVEYARD`, "those cards" has an antecedent only in the intervening "if" that counted them. The ability of the permanent that was
 * sacrificed just before ("sacrifice it. If you do, ...") reads the link the permanent had (last-known information, `ObjectRef` `linkedExile`).
 */
const RETURN_EXILED_WITH_BATTLEFIELD: Lowering<IrClause, Effects> = {
  head: 'returnExiledWithBattlefield',
  id: 'lower.return-exiled-with-battlefield',
  needs: ['effect:moveToZone'],
  lower(clause, ctx) {
    if (!ctx.exiledWithCondition) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'moveToZone',
          objects: { kind: 'linkedExile' },
          to: 'battlefield',
          controller: 'owner',
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Then you may exile a creature or planeswalker card from each graveyard" (CR 608.2d, 404.1, 607.2a): one optional choice for each graveyard, the cards remembered by the permanent the ability
 * belongs to. A spell is no permanent to remember them, so the clause is not lowered there.
 */
const EXILE_FROM_EACH_GRAVEYARD: Lowering<IrClause, Effects> = {
  head: 'exileFromEachGraveyard',
  id: 'lower.exile-from-each-graveyard',
  needs: ['effect:moveToZone'],
  lower(clause, ctx) {
    const what = operand(clause, 'objects');
    if (what === undefined || what.kind !== 'noun' || ctx.owner !== 'ability') {
      return failure(clause);
    }
    const filter = lowerFilter(what);
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: { ...filter.value, zone: 'graveyard', controller: 'you' },
            count: 1,
            // "Exile an instant or sorcery card from each graveyard" (Summon: Esper Valigarmanda) has no "you may": a graveyard with a card gives one.
            ...(arg(clause, 'mandatory') === undefined ? { optional: true as const } : {}),
            eachGraveyard: true,
          },
          to: 'exile',
          linked: true,
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Until end of turn, you may cast spells from among cards exiled with ~, and you may spend mana as though it were mana of any color to cast those spells" (CR 607.2a, 609.4b, 611.2a): the engine's
 * `mayPlay` of the cards the permanent exiled with its linked ability, to cast only, until end of turn. Only in an ability of a permanent: a spell exiles nothing it can remember.
 */
const MAY_CAST_EXILED_WITH: Lowering<IrClause, Effects> = {
  head: 'mayCastExiledWith',
  id: 'lower.may-cast-exiled-with',
  needs: ['effect:mayPlay'],
  lower(clause, ctx) {
    if (ctx.owner !== 'ability') return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'mayPlay',
          objects: { kind: 'linkedExile' },
          lasts: 'endOfTurn',
          castOnly: true,
          anyManaColor: true,
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "You may cast an instant or sorcery card exiled with ~, and mana of any type can be spent to cast that spell" (Summon: Esper Valigarmanda, CR 608.2g, 607.2a, 609.4b): as the ability resolves
 * the controller may cast one such card the permanent exiled with its linked ability, paying its mana cost with any mana (the engine's `castFree` with `paying`). The engine asks the
 * controller, and the question may be declined, so the "you may" is that question (`acceptsOptional`). Only in an ability of a permanent: a spell exiles nothing it can remember.
 */
const CAST_EXILED_WITH_PAYING: Lowering<IrClause, Effects> = {
  head: 'castExiledWithPaying',
  id: 'lower.cast-exiled-with-paying',
  needs: ['effect:castFree', 'ability:castPayingFromLinkedExile'],
  acceptsOptional: true,
  lower(clause, ctx) {
    if (ctx.owner !== 'ability' || arg(clause, 'anyManaType') === undefined) {
      return failure(clause);
    }
    return {
      ok: true,
      value: [
        {
          kind: 'castFree',
          objects: { kind: 'linkedExile' },
          filter: { anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] },
          paying: true,
          anyManaType: true,
        },
      ],
      rule: clause.rule,
    };
  },
};

export const EXILED_WITH_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  PUT_EXILED_WITH_GRAVEYARD,
  RETURN_EXILED_WITH_BATTLEFIELD,
  EXILE_FROM_EACH_GRAVEYARD,
  MAY_CAST_EXILED_WITH,
  CAST_EXILED_WITH_PAYING,
];

/** The features the lowerings of this file name, for the dimension test. */
export const EXILED_WITH_NEEDS: readonly FeatureRef[] = [
  'effect:moveToZone',
  'condition:amountIs',
  'amount:countOf',
  'selector:exiledWithSource',
];
