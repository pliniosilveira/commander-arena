/**
 * Costs to the engine's `Cost` (CR 118, 602.1): one lowering per IR cost, each naming the engine
 * cost kind it becomes so the caller can check it against `costKinds` (an activated ability) or
 * `manaAbilityCostKinds` (a mana ability, CR 605.1a).
 */
import type { Cost } from '@commander-arena/engine';
import type { IrCost } from '../ir/types';
import { lowerAmount } from './amounts';
import { type FeatureRef, missingFeatures } from './features';
import { lowerFilter } from './nouns';
import { type LowerFailure, type LowerResult, newContext } from './types';

function failure(cost: IrCost, needs: readonly FeatureRef[] = []): LowerFailure {
  return { ok: false, needs, at: cost.span, rule: cost.rule };
}

/**
 * What a lowering allows beyond the plain costs: a hybrid mana symbol (an activated ability's cost)
 * and X (stage P16, D-103: the cost of an ordinary activated ability and an additional cost of a
 * spell, where X is announced, CR 107.3a; not a keyword's cost and not a mana ability's).
 */
export interface CostOptions {
  readonly hybrid?: boolean;
  readonly x?: boolean;
  /**
   * The costs of an ordinary activated ability (stage P29, D-133): "Tap three untapped Zombies you control" and "Sacrifice
   * two artifacts" are costs of that kind of ability only, not of a keyword, a mana ability or an additional cost.
   */
  readonly ordinary?: boolean;
  /** The cost of a mana ability (stage P51, D-208): "Mill a card" is paid as the mana ability is activated (CR 605.3). */
  readonly mana?: boolean;
  /** The cost an "unless you pay" asks of the player (stage P51, D-209): "{E}{E}" is paid there and nowhere else. */
  readonly unless?: boolean;
  /** The offer "you may pay that much life" of a life gain trigger (D-364, CR 119.4): the life gained is paid, and nowhere else. */
  readonly eventLife?: boolean;
  /** "Discard X cards" (Hashaton group 10, D-386, provisional, CR 107.3a, 701.9): an additional cost of a spell, where X is announced; nowhere else. */
  readonly discardX?: boolean;
}

/**
 * One cost. A hybrid mana symbol ({R/W}, CR 107.4e) is lowered where the caller allows it: the cost of
 * a mana ability (stage P14) and of an ordinary activated ability (stage P15), which the engine's
 * planner pays; the cost of a keyword (Cycling, Equip) has none, and is dropped whole. A sacrifice of a noun is "sacrifice a creature": the controller chooses among the
 * matching permanents they control (CR 701.21a); a count above one ("Sacrifice two artifacts", stage P29) is the cost
 * of an ordinary activated ability only, where the engine pays it.
 */
export function lowerCost(cost: IrCost, options: CostOptions = {}): LowerResult<Cost> {
  const ok = (value: Cost): LowerResult<Cost> => ({ ok: true, value, rule: cost.rule });
  switch (cost.kind) {
    case 'mana':
      if (options.hybrid !== true && cost.symbols.some((symbol) => symbol.includes('/'))) {
        return failure(cost);
      }
      if (options.x !== true && cost.symbols.includes('X')) return failure(cost);
      // CR 107.4f (D-390): a Phyrexian symbol ({B/P}) is paid with the mana or 2 life by the planner of an ordinary activation (and of a tax paid by the attackers,
      // `lowerPlayRule`), never in the cost of a mana ability: the engine's `manaAbilityCostKinds` takes generic, colored and hybrid mana only.
      if (options.mana === true && cost.symbols.some((symbol) => symbol.endsWith('/P'))) {
        return failure(cost);
      }
      return ok({ kind: 'mana', symbols: [...cost.symbols] });
    case 'tap':
      return ok({ kind: 'tap' });
    case 'untap':
      return ok({ kind: 'untap' });
    case 'payLife': {
      if (cost.amount.kind === 'number') {
        return cost.amount.value >= 1
          ? ok({ kind: 'payLife', amount: cost.amount.value })
          : failure(cost);
      }
      // "Pay that much life" (D-364, CR 119.4): the life that caused the trigger, in the offer of a "you may pay" only.
      if (cost.amount.kind === 'triggerDamage') {
        if (options.eventLife !== true) return failure(cost);
        const blocked = missingFeatures(['amount:triggerDamage']);
        return blocked.length > 0
          ? failure(cost, blocked)
          : ok({ kind: 'payLife', amount: { kind: 'triggerDamage' } });
      }
      // "Pay life equal to the number of colors in your commanders' color identity" (stage P30, D-135, CR 119.4): an amount the
      // engine works out as the ability is activated; only the cost of an ordinary activated ability takes one.
      if (options.ordinary !== true) return failure(cost);
      const amount = lowerAmount(cost.amount, newContext('ability', []), cost.rule);
      return amount.ok ? ok({ kind: 'payLife', amount: amount.value }) : amount;
    }
    case 'payXLife':
      return options.x === true ? ok({ kind: 'payXLife' }) : failure(cost);
    case 'discardX':
      // CR 107.3a, 601.2b (D-386): "discard X cards" is announced as the spell is cast; the engine runs it as an additional cost of a spell only.
      return options.discardX === true ? ok({ kind: 'discardX' }) : failure(cost);
    case 'blight':
      // CR 701.68a (D-407): Blight 1 is paid as the cost of an ordinary activated ability: the player chooses the creature as it is activated.
      return options.ordinary === true ? ok({ kind: 'blight', count: cost.count }) : failure(cost);
    case 'removeCounters':
      return cost.amount.kind === 'number' && cost.amount.value >= 1
        ? ok({ kind: 'removeCounters', counter: cost.counter, count: cost.amount.value })
        : failure(cost);
    case 'sacrifice': {
      const { what } = cost;
      if (what.det === 'self') return ok({ kind: 'sacrifice', what: { kind: 'this' } });
      // "Sacrifice two artifacts" (stage P29, D-133): the engine's `count` of an activated ability's cost.
      const many = what.count?.kind === 'number' ? what.count.value : 1;
      if (what.det !== 'a' || (what.count !== undefined && what.count.kind !== 'number')) {
        return failure(cost);
      }
      if (many > 1 && options.ordinary !== true) return failure(cost);
      const filter = lowerFilter(what);
      return filter.ok
        ? ok({ kind: 'sacrifice', what: filter.value, ...(many > 1 ? { count: many } : {}) })
        : filter;
    }
    case 'tapPermanents': {
      // "Tap three untapped Zombies you control" (stage P29, D-133, CR 118.3): the engine's `tapPermanents`, a cost of an
      // ordinary activated ability.
      if (options.ordinary !== true) return failure(cost);
      const filter = lowerFilter(cost.what);
      return filter.ok
        ? ok({ kind: 'tapPermanents', filter: filter.value, count: cost.count })
        : filter;
    }
    case 'mill':
      // CR 701.17, 605.3 (stage P51, D-208): the cost of a mana ability, N cards of the library; D-229: of an ordinary activated ability too.
      if (options.mana !== true && options.ordinary !== true) return failure(cost);
      return cost.amount.kind === 'number' && cost.amount.value >= 1
        ? ok({ kind: 'mill', count: cost.amount.value })
        : failure(cost);
    case 'discardThis':
      // CR 701.9, 113.6b (stage P68, D-229): the card itself, from the hand: the cost of an ordinary activated ability, which then works from the hand.
      return options.ordinary === true ? ok({ kind: 'discardThis' }) : failure(cost);
    case 'exileThis':
      // CR 118.1, 406.1 (stage P68, D-229): the permanent with the ability exiles itself, a cost of an ordinary activated ability.
      return options.ordinary === true ? ok({ kind: 'exileThis' }) : failure(cost);
    case 'energy':
      // CR 107.14 (stage P51, D-209): paid by the player an "unless you pay" asks, and nowhere else.
      return options.unless === true && cost.count >= 1
        ? ok({ kind: 'energy', count: cost.count })
        : failure(cost);
    case 'discard': {
      // CR 701.9, 118.3: N cards of the hand, the paying player's choice. The count is a whole
      // number of one or more; the engine pays no other discard cost (D-095).
      if (cost.amount.kind !== 'number' || cost.amount.value < 1) return failure(cost);
      if (cost.filter === undefined && cost.named === undefined) {
        return ok({ kind: 'discard', count: cost.amount.value });
      }
      // D-207 (stage P50): "Discard a legendary card", "Discard another card named ~": the cost of an ordinary activated ability.
      if (options.ordinary !== true) return failure(cost);
      if (cost.named === true)
        return ok({ kind: 'discard', count: cost.amount.value, named: true });
      const narrowed = lowerFilter({
        kind: 'noun',
        det: 'a',
        filter: cost.filter ?? { raw: '' },
        upTo: false,
        plural: false,
        other: false,
        span: cost.span,
        rule: cost.rule,
      });
      return narrowed.ok
        ? ok({ kind: 'discard', count: cost.amount.value, filter: narrowed.value })
        : narrowed;
    }
    case 'putCounters':
      // "Put a page counter on ~" (stage P31, D-140, CR 118.3): counters on the permanent itself, a cost of an ordinary activated ability.
      if (options.ordinary !== true || cost.count < 1) return failure(cost);
      return ok({ kind: 'putCounters', counter: cost.counter, count: cost.count });
    case 'returnToHand': {
      // "Return an artifact you control to its owner's hand" (stage P31, D-140, CR 118.3): the permanent itself, or `count` of the
      // permanents of a filter the player controls, a cost of an ordinary activated ability.
      if (options.ordinary !== true) return failure(cost);
      if (cost.what.det === 'self') return ok({ kind: 'returnToHand', what: { kind: 'this' } });
      const filter = lowerFilter(cost.what);
      if (!filter.ok) return filter;
      return ok({
        kind: 'returnToHand',
        what: filter.value,
        ...(cost.count > 1 ? { count: cost.count } : {}),
      });
    }
    case 'loyalty':
      // CR 606.2 (stage P47, D-202): the symbol of a loyalty ability, the cost of an ordinary activation on a planeswalker (the caller checks the face).
      return options.ordinary === true
        ? ok({ kind: 'loyalty', change: cost.change })
        : failure(cost);
    case 'exile': {
      // "Exile two creature cards from your graveyard" (stage P72, D-232, CR 118.1, 406.1): the engine's `exileFromGraveyard`, the cost of an ordinary activated ability.
      if (options.ordinary !== true) return failure(cost);
      const blocked = missingFeatures(['cost:exileFromGraveyard']);
      if (blocked.length > 0) return failure(cost, blocked);
      const many = cost.what.count?.kind === 'number' ? cost.what.count.value : 1;
      const { count: _counted, ...described } = cost.what;
      const filter = lowerFilter(described);
      return filter.ok
        ? ok({ kind: 'exileFromGraveyard', filter: filter.value, count: many })
        : filter;
    }
  }
}

/** Every `cost:` feature a lowering can name, for the dimension test. */
export const COST_NEEDS: readonly FeatureRef[] = [
  'cost:tap',
  'cost:mana',
  'cost:untap',
  'cost:sacrifice',
  'cost:tapPermanents',
  'cost:blight',
  'cost:payLife',
  'cost:payXLife',
  'cost:discardX',
  'cost:discard',
  'cost:exileFromGraveyard',
  'cost:removeCounters',
  'cost:energy',
  'cost:putCounters',
  'cost:returnToHand',
  'cost:loyalty',
];
