/**
 * Clause lowerings of stage P32 (D-145, D-147): doubling power and toughness, fights, revealing until a card of a kind, casting a card
 * without paying its mana cost and damage divided as the caster chooses. Same contract as effects.ts: each declares the engine features it
 * needs and is checked before it runs. The excess damage of trample is joined to the damage before it in `sentences.ts`.
 */
import type { Amount } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { withoutZone } from '../rules/noun/phrases';
import { amountArg, arg, type Effects, eachObject, failure, operand } from './clauses';
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
    const first = objectSelectorOf(fighter, ctx);
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
    const playing = play.value ? { play: true as const } : {};
    if (objects.det === 'linkedExile') {
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
    const filter = lowerFilter(objects);
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [{ kind: 'castFree', objects: { kind: 'choose', filter: filter.value }, ...playing }],
      rule: clause.rule,
    };
  },
};

/**
 * "~ deals X damage divided as you choose among any number of target creatures, where X is the greatest power among creatures you control as
 * you cast this spell" (CR 601.2d, 120.3): the spell's targets slot with `divide` (the total is read once, as the spell is cast) and the
 * engine's `dealDividedDamage` to it. Only a spell's own text; the total is a number or an amount that reads the game as the spell is cast,
 * never an announced X.
 */
export const DEAL_DIVIDED_DAMAGE: Lowering<IrClause, Effects> = {
  head: 'dealDividedDamage',
  id: 'lower.deal-divided-damage',
  needs: ['effect:dealDividedDamage', 'selector:target'],
  lower(clause, ctx) {
    const to = operand(clause, 'to');
    if (to?.kind !== 'noun' || to.det !== 'target' || ctx.owner !== 'spell') return failure(clause);
    ctx.readAsCast = true;
    let total: Amount;
    try {
      const amount = amountArg(clause, 'amount', ctx);
      if (!amount.ok) return amount;
      total = amount.value;
    } finally {
      ctx.readAsCast = false;
    }
    if (typeof total === 'object' && total !== null && total.kind === 'x') return failure(clause);
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
  CAST_FREE,
  DEAL_DIVIDED_DAMAGE,
];
