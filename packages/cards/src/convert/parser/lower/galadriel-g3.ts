/**
 * Lowerings of group 3 of the Galadriel deck (issue 43): "Exchange control of ~ and target nonland permanent", "counter up to one target spell unless its controller pays mana equal to
 * ...", "Draw a card and reveal it. Remove a number of loyalty counters equal to that card's mana value from ~." and "Its activated abilities can't be activated this turn."
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { lowerAmount } from './amounts';
import { arg, type Effects, eachObject, failure, operand } from './clauses';
import { objectRefOf, objectSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * "Exchange control of ~ and target nonland permanent." (CR 701.12a, 701.12b): the engine's `exchangeControl` of the permanent with the ability and a target; whether the two are
 * controlled by two players and still on the battlefield is read as the effect resolves.
 */
const EXCHANGE_CONTROL: Lowering<IrClause, Effects> = {
  head: 'exchangeControl',
  id: 'lower.exchange-control',
  needs: ['effect:exchangeControl', 'selector:target'],
  lower(clause, ctx) {
    const first = arg(clause, 'first');
    const second = arg(clause, 'second');
    if (first?.kind !== 'noun' || second?.kind !== 'noun') return failure(clause);
    const a = objectSelectorOf(first, ctx);
    if (!a.ok) return a;
    const b = objectSelectorOf(second, ctx);
    if (!b.ok) return b;
    // One is the permanent with the ability and the other a target: the same two kinds the engine's validator accepts.
    if (a.value.kind !== 'this' || b.value.kind !== 'target') return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'exchangeControl', first: a.value, second: b.value }],
      rule: clause.rule,
    };
  },
};

/**
 * "Counter [up to one] target spell unless its controller pays mana equal to <amount>." (CR 118.12a, 608.2c): the engine's `counterUnlessPays` with the amount of generic mana, read as
 * it resolves. The spell is a target slot of the spell; "up to one" makes the slot optional (a minimum of 0).
 */
const COUNTER_UNLESS_PAYS_AMOUNT: Lowering<IrClause, Effects> = {
  head: 'counterUnlessPaysAmount',
  id: 'lower.counter-unless-pays-amount',
  needs: ['effect:counterUnlessPays', 'selector:target'],
  lower(clause, ctx) {
    const objects = operand(clause, 'objects');
    const amount = arg(clause, 'amount');
    if (objects?.kind !== 'noun' || amount === undefined) return failure(clause);
    const spell = objectRefOf(objects, ctx);
    if (!spell.ok) return spell;
    if (spell.value.kind !== 'target') return failure(clause);
    const how = (() => {
      switch (amount.kind) {
        case 'aggregate':
        case 'countOf':
        case 'powerOf':
          return lowerAmount(amount, ctx, clause.rule);
        default:
          return failure(clause);
      }
    })();
    if (!how.ok) return how;
    const effect: Effect = {
      kind: 'counterUnlessPays',
      objects: spell.value,
      cost: [],
      genericAmount: how.value,
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/**
 * "Draw a card and reveal it. Remove a number of loyalty counters equal to that card's mana value from ~." (CR 701.20a, 400.7j, 202.3, 122.1): the engine's `draw` with `reveal`, then
 * `removeCounters` of the counters of the kind the text names, as many as the mana value of the card drawn (`moved`), from the permanent with the ability.
 */
const DRAW_REVEAL_REMOVE: Lowering<IrClause, Effects> = {
  head: 'drawRevealRemove',
  id: 'lower.draw-reveal-remove',
  needs: ['effect:draw', 'effect:removeCounters', 'amount:manaValueOf', 'selector:moved'],
  lower(clause, ctx) {
    const counter = arg(clause, 'counter');
    const from = arg(clause, 'from');
    if (counter?.kind !== 'counterSpec' || from?.kind !== 'noun') return failure(clause);
    const objects = objectSelectorOf(from, ctx);
    if (!objects.ok) return objects;
    if (objects.value.kind !== 'this') return failure(clause);
    const effects: Effect[] = [
      { kind: 'draw', player: { kind: 'you' }, count: 1, reveal: true },
      {
        kind: 'removeCounters',
        objects: objects.value,
        counter: counter.name,
        count: { kind: 'manaValueOf', of: { kind: 'moved' } },
      },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

/**
 * "Its activated abilities can't be activated this turn." (CR 602.5, 605.1a, 611.2): the engine's `restrict` of `cantActivateAbilities` until end of turn, for the permanent an
 * earlier instruction of the text named (a target).
 */
const CANT_ACTIVATE: Lowering<IrClause, Effects> = {
  head: 'cantActivate',
  id: 'lower.cant-activate',
  needs: ['effect:restrict'],
  lower(clause, ctx) {
    return eachObject(clause, ctx, (objects) => ({
      kind: 'restrict',
      objects,
      restriction: 'cantActivateAbilities',
      duration: 'untilEndOfTurn',
    }));
  },
};

export const GALADRIEL_G3_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXCHANGE_CONTROL,
  COUNTER_UNLESS_PAYS_AMOUNT,
  DRAW_REVEAL_REMOVE,
  CANT_ACTIVATE,
];
