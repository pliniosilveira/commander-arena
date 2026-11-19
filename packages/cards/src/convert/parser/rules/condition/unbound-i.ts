/**
 * Conditions of group I of the Quandrix Unlimited deck (Unbound Flourishing): "if that spell's mana cost or that ability's activation cost contains {X}" (CR 107.3, 603.4), the "if" that
 * follows "Whenever you cast an instant or sorcery spell or activate an ability". It is about the event itself (the cost of the spell or ability that caused the trigger), so the lowering of
 * the trigger turns it into a part of the engine's events (`xInManaCost` of the spell, `xCost` of the activation), which is read once as the event happens.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule } from '../registry';

/**
 * `condition.cost-contains-x`: "if that spell's mana cost or that ability's activation cost contains {X}". Not read: only one of the two costs, another symbol, "includes", a
 * count of {X}, a join with another condition.
 */
export const CONDITION_COST_CONTAINS_X = defineRule<IrCondition>({
  id: 'condition.cost-contains-x',
  family: 'condition',
  leading: ['that'],
  cites: [
    'CR 107.3 (Mana Cost)',
    'CR 603.4 (Handling Triggered Abilities)',
    'CR 602.2b (Activating Activated Abilities)',
  ],
  examples: ["that spell's mana cost or that ability's activation cost contains {X}"],
  rejects: [
    "that spell's mana cost contains {X}",
    "that ability's activation cost contains {X}",
    "that spell's mana cost or that ability's activation cost contains {Y}",
    "that spell's mana cost or that ability's activation cost includes {X}",
    "that spell's mana cost or that ability's activation cost contains {X} and",
    "that spell's mana cost or that ability's activation cost contains {X}{X}",
    "this spell's mana cost or that ability's activation cost contains {X}",
    "that spell's mana cost or that ability's mana cost contains {X}",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `that spell['’]s mana cost or that ability['’]s activation cost contains \\{X\\}(?!\\{)${BOUNDARY}(?! (?:and|or)\\b)`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'costContainsX' },
        span: { start: pos, end: r.pos },
        rule: 'condition.cost-contains-x',
      },
      pos: r.pos,
    };
  },
});

export const UNBOUND_I_CONDITION_RULES = [CONDITION_COST_CONTAINS_X];
