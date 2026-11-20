/**
 * Clause lowerings of stage P32 (D-145, D-147): doubling power and toughness, fights, revealing until a card of a kind, casting a card
 * without paying its mana cost and damage divided as the caster chooses. Same contract as effects.ts: each declares the engine features it
 * needs and is checked before it runs. The excess damage of trample is joined to the damage before it in `sentences.ts`.
 */
import type { Amount } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { withoutZone } from '../rules/noun/phrases';
import { lowerAmount } from './amounts';
import { amountArg, arg, type Effects, eachObject, failure, operand } from './clauses';
import { missingFeatures } from './features';
import { declareDividedTarget, lowerFilter, objectRefOf, objectSelectorOf } from './nouns';
import type { Lowering } from './types';

const isFlag = (a: ReturnType<typeof arg>, value: boolean): boolean =>
  a?.kind === 'flag' && a.value === value;

/**
 * "Double the power and toughness of each creature you control until end of turn" (CR 701.10, 611.2a): the engine's `modifyPt` whose stats
 * are the `affected` amounts, one continuous effect for each creature, worked out as the effect resolves; a stat the text does not name gets
 * nothing. The duration is "until end of turn".
 */
export const DOUBLE_PT: Lowering<IrClause, Effects> = {
  head: 'doublePt',
  id: 'lower.double-pt',
  needs: ['effect:modifyPt', 'amount:affected', 'duration:untilEndOfTurn'],
  takesDuration: true,
  lower(clause, ctx) {
    const power = arg(clause, 'power');
    const toughness = arg(clause, 'toughness');
    if (power?.kind !== 'flag' || toughness?.kind !== 'flag') return failure(clause);
    if (clause.duration?.scope !== 'untilEndOfTurn') return failure(clause);
    // A spell's own `~` is the spell on the stack, which has no power to double.
    const objects = operand(clause, 'objects');
    if (objects?.kind === 'noun' && objects.det === 'self' && ctx.owner === 'spell') {
      return failure(clause);
    }
    return eachObject(
      clause,
      ctx,
      (selected) => ({
        kind: 'modifyPt',
        objects: selected,
        power: power.value ? { kind: 'affected', stat: 'power' } : 0,
        toughness: toughness.value ? { kind: 'affected', stat: 'toughness' } : 0,
        duration: 'untilEndOfTurn',
      }),
      'objects',
      { triggerSubject: true },
    );
  },
};

/**
 * "Target creature you control fights target creature you don't control" (CR 701.14): the engine's `fight` of two creatures (a target, `~` of
 * an ability, or "it"), each dealing damage equal to its power to the other.
 */
export const FIGHT: Lowering<IrClause, Effects> = {
  head: 'fight',
  id: 'lower.fight',
  needs: ['effect:fight'],
  lower(clause, ctx) {
    const fighter = operand(clause, 'fighters');
    const against = operand(clause, 'against');
    if (fighter?.kind !== 'noun' || against?.kind !== 'noun') return failure(clause);
    // "It" may be the permanent whose event caused the trigger ("Whenever a creature you control with flying enters, you may have it fight ...").
    const first = objectSelectorOf(fighter, ctx, { triggerSubject: true });
    if (!first.ok) return first;
    const second = objectSelectorOf(against, ctx);
    if (!second.ok) return second;
    // A spell's own `~` is the spell on the stack, which cannot fight.
    if (first.value.kind === 'thisSpell' || second.value.kind === 'thisSpell') {
      return failure(clause);
    }
    return {
      ok: true,
      value: [{ kind: 'fight', fighters: first.value, against: second.value }],
      rule: clause.rule,
    };
  },
};

/**
 * "Each of those tokens fights a different one of those creatures" (CR 701.14, 608.2c, 608.2d): after an instruction that made a token
 * for each creature of a filter, the engine's `fight` of the tokens made (`moved`) against the creatures counted (`each`), the controller
 * choosing which one each token fights, a different one each time (`pairing`). Anything else before it leaves "those" with nothing to mean.
 */
export const FIGHT_PAIRS: Lowering<IrClause, Effects> = {
  head: 'fightPairs',
  id: 'lower.fight-pairs',
  needs: ['effect:fight', 'selector:moved', 'selector:each'],
  lower(clause, ctx) {
    const tokens = arg(clause, 'fighters');
    const creatures = arg(clause, 'against');
    const counted = ctx.createdPer;
    if (!isFlag(tokens, true) || !isFlag(creatures, true) || counted === null) {
      return failure(clause);
    }
    if (!(counted.types ?? []).includes('creature')) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'fight',
          fighters: { kind: 'moved' },
          against: { kind: 'each', filter: counted },
          pairing: 'differentChosen',
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest on the
 * bottom of your library in a random order." (CR 701.20, 401.4): the engine's `revealUntil`. The kind describes a card in a library: no
 * zone, controller or owner.
 */
export const REVEAL_UNTIL: Lowering<IrClause, Effects> = {
  head: 'revealUntil',
  id: 'lower.reveal-until',
  needs: ['effect:revealUntil'],
  lower(clause) {
    const card = arg(clause, 'card');
    const to = arg(clause, 'to');
    if (card?.kind !== 'noun' || to?.kind !== 'zoneSpec') return failure(clause);
    if (to.zone !== 'battlefield' && to.zone !== 'hand') return failure(clause);
    const filter = lowerFilter({ ...card, filter: withoutZone(card.filter) });
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        {
          kind: 'revealUntil',
          filter: filter.value,
          put: to.zone,
          ...(to.tapped === true && to.zone === 'battlefield' ? { tapped: true as const } : {}),
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Reveal cards from the top of your library until you reveal a creature card for each wild vote. Put those creature cards onto the battlefield, then shuffle the rest into your
 * library." (issue 103, CR 701.20, 701.38b, 701.24): the engine's `revealUntil` with a `count` (the votes) and the rest left in the library, then a `shuffle` of the controller's
 * library. The second sentence must name the kind of the first in the plural.
 */
export const REVEAL_UNTIL_VOTES: Lowering<IrClause, Effects> = {
  head: 'revealUntilVotes',
  id: 'lower.reveal-until-votes',
  needs: ['effect:revealUntil', 'effect:shuffle', 'ability:revealUntilCount', 'amount:votesFor'],
  lower(clause, ctx) {
    const card = arg(clause, 'card');
    const votes = arg(clause, 'count');
    const kind = arg(clause, 'kind');
    if (card?.kind !== 'noun' || votes?.kind !== 'votesFor' || kind?.kind !== 'name') {
      return failure(clause);
    }
    // "a creature card ... those creature cards": the same single type, nothing else asked of the card.
    const types = card.filter.types ?? [];
    if (types.length !== 1 || types[0] !== kind.name) return failure(clause);
    const filter = lowerFilter({ ...card, filter: withoutZone(card.filter) });
    if (!filter.ok) return filter;
    const count = lowerAmount(votes, ctx, clause.rule);
    if (!count.ok) return count;
    return {
      ok: true,
      value: [
        {
          kind: 'revealUntil',
          filter: filter.value,
          count: count.value,
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
 * "Reveal cards from the top of your library until you reveal an Aura card. You may put that card onto the battlefield. If you don't, put it into your hand. Put the rest on the
 * bottom of your library in a random order." (D-659, CR 701.20, 303.4f, 608.2c): the engine's `revealUntil` that moves nothing (`put: 'none'`; the rest go to the bottom), then a `may`
 * move of the card found onto the battlefield (an Aura chooses what it enchants as it enters) and, when the player did not, a move of it into the hand.
 */
export const REVEAL_UNTIL_MAY_PUT: Lowering<IrClause, Effects> = {
  head: 'revealUntilMayPut',
  id: 'lower.reveal-until-may-put',
  needs: [
    'effect:revealUntil',
    'effect:may',
    'effect:conditional',
    'effect:moveToZone',
    'selector:moved',
  ],
  lower(clause) {
    const card = arg(clause, 'card');
    if (card?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter({ ...card, filter: withoutZone(card.filter) });
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        { kind: 'revealUntil', filter: filter.value, put: 'none' },
        {
          kind: 'may',
          effect: { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'battlefield' },
        },
        {
          kind: 'conditional',
          condition: { kind: 'not', term: { kind: 'didPrevious' } },
          effect: { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'hand' },
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "You may cast a spell with mana value 5 or less from your hand without paying its mana cost", "You may play the exiled card without
 * paying its mana cost" (CR 608.2g, 118.9, 305.1): the engine's `castFree`, the controller choosing among the cards of their hand that
 * match (a `choose` selector) or taking the card a linked ability exiled; "play" lets a land be chosen too. Declining does nothing, which
 * the engine's effect already says, so the effect is not a `may` of its own.
 */
export const CAST_FREE: Lowering<IrClause, Effects> = {
  head: 'castFree',
  id: 'lower.cast-free',
  needs: ['effect:castFree'],
  lower(clause, ctx) {
    const objects = operand(clause, 'objects');
    const play = arg(clause, 'play');
    if (objects?.kind !== 'noun' || play?.kind !== 'flag') return failure(clause);
    // The cast is the controller's to decline: "you may cast ..." said by the sentence, or made optional by the "you may" of a triggered ability. "Cast a spell ..." alone is no offer.
    const written = arg(clause, 'mayWritten');
    if (written?.kind === 'flag' && !written.value && !clause.optional) return failure(clause);
    const playing = play.value ? { play: true as const } : {};
    if (objects.det === 'linkedExile') {
      // D-664 (CR 701.20, 701.13, 608.2g): in the text of a spell "the exiled card" is the card the instruction before it exiled, there being no permanent for a linked
      // ability to belong to: "Reveal cards from the top of your library until you reveal a nonland card. Exile that card ... You may cast the exiled card without paying its mana cost."
      if (ctx.owner === 'spell' && ctx.lastEffectKind === 'revealUntil' && !play.value) {
        return {
          ok: true,
          value: [{ kind: 'castFree', objects: { kind: 'moved' } }],
          rule: clause.rule,
        };
      }
      const ref = objectRefOf(objects, ctx);
      if (!ref.ok) return ref;
      if (ref.value.kind !== 'linkedExile') return failure(clause);
      return {
        ok: true,
        value: [{ kind: 'castFree', objects: ref.value, ...playing }],
        rule: clause.rule,
      };
    }
    if (objects.det !== 'a' || objects.filter.zone !== 'hand') return failure(clause);
    // "a spell with mana value X or less from your hand" (CR 107.3a, 202.3): the X announced for this spell, so only the text of a spell reads it.
    let subject = objects;
    let atMost: Amount | undefined;
    if (objects.filter.manaValueAtMostX === true) {
      if (ctx.owner !== 'spell' || ctx.xIs !== null) return failure(clause);
      const missing = missingFeatures(['selector:manaValueAtMost']);
      if (missing.length > 0) return failure(clause, missing);
      const amount = lowerAmount({ kind: 'x', span: objects.span }, ctx, clause.rule);
      if (!amount.ok) return amount;
      atMost = amount.value;
      const { manaValueAtMostX: _x, ...rest } = objects.filter;
      void _x;
      subject = { ...objects, filter: rest };
    }
    // "... with lesser mana value that shares a card type with it": "it" is the spell of the cast trigger the effect belongs to (CR 603.3d).
    let relative = false;
    if (subject.filter.lesserSharingTypeWithTriggerSpell === true) {
      if (!ctx.castTrigger) return failure(clause);
      const missing = missingFeatures(['selector:manaValueBelow', 'selector:sharesCardTypeWith']);
      if (missing.length > 0) return failure(clause, missing);
      const { lesserSharingTypeWithTriggerSpell: _lesser, ...rest } = subject.filter;
      void _lesser;
      subject = { ...subject, filter: rest };
      relative = true;
    }
    const filter = lowerFilter(subject);
    if (!filter.ok) return filter;
    const limited = {
      ...filter.value,
      ...(atMost === undefined ? {} : { manaValueAtMost: atMost }),
      ...(relative
        ? {
            manaValueBelow: {
              kind: 'manaValueOf' as const,
              of: { kind: 'triggerSubject' as const },
            },
            sharesCardTypeWith: 'triggerSubject' as const,
          }
        : {}),
    };
    return {
      ok: true,
      value: [{ kind: 'castFree', objects: { kind: 'choose', filter: limited }, ...playing }],
      rule: clause.rule,
    };
  },
};

/**
 * "~ deals X damage divided as you choose among any number of target creatures, where X is the greatest power among creatures you control as
 * you cast this spell" (CR 601.2d, 120.3): the targets slot with `divide` (the total is read once, as the spell is cast or the ability is put on the
 * stack, CR 602.2b, 603.3d) and the engine's `dealDividedDamage` to it. A spell's own text or an activated or triggered ability; the total is a number
 * or an amount that reads the game then, never an announced X.
 */
export const DEAL_DIVIDED_DAMAGE: Lowering<IrClause, Effects> = {
  head: 'dealDividedDamage',
  id: 'lower.deal-divided-damage',
  needs: ['effect:dealDividedDamage', 'selector:target'],
  lower(clause, ctx) {
    const to = operand(clause, 'to');
    if (to?.kind !== 'noun' || to.det !== 'target') return failure(clause);
    // "it deals ...": the damage is dealt by the source of the ability (CR 113.7a), which is the one thing the engine's `dealDividedDamage` knows; an "it" that is
    // another object is refused.
    const source = arg(clause, 'source');
    if (source !== undefined && (source.kind !== 'noun' || source.ref !== 'self')) {
      return failure(clause);
    }
    ctx.readAsCast = true;
    let total: Amount;
    try {
      const amount = amountArg(clause, 'amount', ctx);
      if (!amount.ok) return amount;
      total = amount.value;
    } finally {
      ctx.readAsCast = false;
    }
    // CR 107.3a, 601.2b: the X a spell announces is known before its targets are chosen, so only a spell's own text divides it (the validation refuses an ability).
    if (
      typeof total === 'object' &&
      total !== null &&
      total.kind === 'x' &&
      ctx.owner !== 'spell'
    ) {
      return failure(clause);
    }
    const id = declareDividedTarget(to, ctx, total);
    if (!id.ok) return id;
    return {
      ok: true,
      value: [{ kind: 'dealDividedDamage', to: { kind: 'target', id: id.value } }],
      rule: clause.rule,
    };
  },
};

export const DINOSAUR_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  DOUBLE_PT,
  FIGHT,
  FIGHT_PAIRS,
  REVEAL_UNTIL,
  REVEAL_UNTIL_VOTES,
  REVEAL_UNTIL_MAY_PUT,
  CAST_FREE,
  DEAL_DIVIDED_DAMAGE,
];
