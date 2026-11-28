/**
 * "The next instant or sorcery spell you cast this turn costs {X} less to cast" and "... has storm" (issue 121, CR 601.2f, 702.40a, 702.85a): the engine's `nextSpellModifier`. The spell
 * types are the card types the clause names; a reduction is an amount read as the effect resolves; the keyword is storm or cascade.
 */
import type { CardType, Effect, ObjectFilter } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects } from './clauses';
import type { Lowering } from './types';

const NEXT_SPELL_MODIFIER: Lowering<IrClause, Effects> = {
  head: 'nextSpellModifier',
  id: 'lower.next-spell-modifier',
  needs: ['effect:nextSpellModifier'],
  lower(clause, ctx) {
    const types = arg(clause, 'spells');
    if (types?.kind !== 'typeList' || types.cardTypes === undefined) {
      return { ok: false, needs: [], at: clause.span, rule: clause.rule };
    }
    const cardTypes = types.cardTypes as readonly CardType[];
    const spells: ObjectFilter =
      cardTypes.length === 1
        ? { types: [...cardTypes] }
        : { anyOf: cardTypes.map((t) => ({ types: [t] })) };
    const keyword = arg(clause, 'keyword');
    let effect: Extract<Effect, { kind: 'nextSpellModifier' }>;
    if (keyword?.kind === 'keywordName') {
      if (keyword.name !== 'storm' && keyword.name !== 'cascade') {
        return { ok: false, needs: [], at: clause.span, rule: clause.rule };
      }
      effect = { kind: 'nextSpellModifier', spells, grants: keyword.name };
    } else {
      const less = amountArg(clause, 'amount', ctx);
      if (!less.ok) return less;
      effect = { kind: 'nextSpellModifier', spells, lessGeneric: less.value };
    }
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "Rather than pay the mana cost of the next spell you cast this turn, you may pay life equal to that spell's mana value" (CR 118.9, 601.2b): the engine's `nextSpellPayLife`. */
const NEXT_SPELL_PAY_LIFE: Lowering<IrClause, Effects> = {
  head: 'nextSpellPayLife',
  id: 'lower.next-spell-pay-life',
  needs: ['effect:nextSpellPayLife'],
  lower(clause) {
    return { ok: true, value: [{ kind: 'nextSpellPayLife' }], rule: clause.rule };
  },
};

/** "That creature enters with two additional +1/+1 counters on it" (Yuna, Grand Summoner, CR 614.1c, 122.6): the engine's `spellEntersWithCounters`, read only in a delayed cast trigger. */
const SPELL_ENTERS_WITH_COUNTERS: Lowering<IrClause, Effects> = {
  head: 'spellEntersWithCounters',
  id: 'lower.spell-enters-with-counters',
  needs: ['effect:spellEntersWithCounters'],
  lower(clause, ctx) {
    const counter = arg(clause, 'counter');
    if (counter?.kind !== 'counterSpec' || counter.name !== '+1/+1') {
      return { ok: false, needs: [], at: clause.span, rule: clause.rule };
    }
    // Communal Brewing (CR 107.3c, 608.2h): "X additional +1/+1 counters on it, where X is ...": the amount the sentence defines.
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return {
      ok: true,
      value: [{ kind: 'spellEntersWithCounters', counter: counter.name, count: count.value }],
      rule: clause.rule,
    };
  },
};

export const NEXT_SPELL_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  NEXT_SPELL_MODIFIER,
  NEXT_SPELL_PAY_LIFE,
  SPELL_ENTERS_WITH_COUNTERS,
];
