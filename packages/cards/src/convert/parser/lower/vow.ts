/**
 * Lowerings of Promise of Loyalty (CR 608.2d, 701.21a, 122.1, 508.1a, 506.3, 611.2b, 611.2c): "Each player puts a vow counter on a creature they control and sacrifices the rest." is the
 * engine's `sparePermanents` of each player's own creatures that remembers what it kept; "Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow
 * counter on it." is its `cantAttackController` over what the sentence before kept. The name of what was kept is fixed here, so the second sentence alone, or after something else, names
 * nothing and the validator refuses the card.
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import type { Lowering } from './types';

/** The name the creatures kept go by: the first sentence gives it, the second reads it. */
export const KEPT_CREATURES = 'keptCreatures';

const counterOf = (clause: IrClause): string | null => {
  const c = arg(clause, 'counter');
  return c?.kind === 'counterSpec' ? c.name : null;
};

export const KEEP_ONE_WITH_COUNTER: Lowering<IrClause, Effects> = {
  head: 'keepOneWithCounter',
  id: 'lower.keep-one-with-counter',
  needs: ['effect:sparePermanents'],
  lower(clause) {
    const counter = counterOf(clause);
    if (counter === null) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'sparePermanents',
          types: ['creature'],
          own: {
            players: { kind: 'eachPlayer' },
            onlyTypes: true,
            counter,
            keptAs: KEPT_CREATURES,
          },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const CANT_ATTACK_WHILE_COUNTER: Lowering<IrClause, Effects> = {
  head: 'cantAttackWhileCounter',
  id: 'lower.cant-attack-while-counter',
  needs: ['effect:cantAttackController'],
  lower(clause) {
    const counter = counterOf(clause);
    if (counter === null) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'cantAttackController',
          objects: { kind: 'chosen', id: KEPT_CREATURES },
          planeswalkers: true,
          whileCounter: counter,
        },
      ],
      rule: clause.rule,
    };
  },
};
