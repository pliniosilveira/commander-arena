/**
 * Lowering of stage P69 (D-276): "It gains \"You can't lose the game and your opponents can't win the game.\"" with no duration (CR 611.2a, 613.1f).
 *
 * The quoted text was read as a static ability of its own (`rules/static/quoted.ts`) and is lowered like one of a card (`lowerAngelStatic`); the engine's
 * `grantAbility` effect lasts for the rest of the game (`duration: 'permanent'`) and gives only `cantLoseGame` and `opponentsCantWin`, so any other
 * static ability, and one with a condition, is not lowered. The object must be a target an earlier instruction of the same spell or ability chose,
 * or this clause's own, still on the battlefield as far as the text says: "it" with nothing before it, the source ("~ gains"), the object of a
 * trigger, a token the text made (also after a target: "it" is then the token, CR 111.1) and a target the text destroyed, exiled, sacrificed or returned before are not read.
 */
import type { Ability } from '@commander-arena/engine';
import { bind } from '../ir/bind';
import type { IrClause } from '../ir/types';
import { CREATURE_TYPES } from '../rules/noun/creature-types';
import { lowerAngelStatic } from './angels';
import { arg, type Effects, failure, operand } from './clauses';
import { lateLowerers } from './late';
import { objectSelectorOf } from './nouns';
import { type Lowering, newContext } from './types';

/** The static abilities an effect may give for good: the ones the engine reads from an object's abilities after the layers. */
const GRANTED = ['cantLoseGame', 'opponentsCantWin'];
/** Issue 345 (Beorn's Hospitality): the permanent itself may also be given a characteristic-defining ability of power and toughness. */
const GRANTED_TO_SELF = [...GRANTED, 'characteristicPt'];

export const GAIN_STATIC_ABILITY: Lowering<IrClause, Effects> = {
  head: 'gainStaticAbility',
  id: 'lower.gain-static-ability',
  needs: ['effect:grantAbility'],
  lower(clause, ctx) {
    const subject = operand(clause, 'objects');
    const quoted = arg(clause, 'ability');
    if (subject?.kind !== 'noun' || quoted?.kind !== 'quoted' || quoted.ability.kind !== 'static') {
      return failure(clause);
    }
    // Only a target (the engine fixes the object as the effect begins, CR 611.2c, from the target of the ability) or, since issue 345, the permanent itself ("~ gains").
    const itself = subject.det === 'self';
    if (!itself && subject.det !== 'target' && subject.det !== 'anaphor') return failure(clause);
    const objects = itself
      ? ({ ok: true, value: { kind: 'this' } } as const)
      : objectSelectorOf(subject, ctx);
    if (!objects.ok) return objects;
    if (!itself && objects.value.kind !== 'target') return failure(clause);
    // "Return target Angel card from your graveyard to the battlefield. It gains ...", "Exile target Angel, then return it ...": after the instruction
    // that destroyed, exiled, sacrificed or returned the target, "it" is a new object or a card somewhere else (CR 400.7), not what the grant would find.
    if (objects.value.kind === 'target' && ctx.removed.has(objects.value.id)) {
      return failure(clause);
    }
    // "Put a +1/+1 counter on target Angel. Create a 3/3 ... token. It gains ...": once a token was made, "it" and "that creature" name the new token
    // (CR 111.1) or are ambiguous, never the earlier target, so the grant would go to another object than the text says.
    if (subject.det === 'anaphor' && ctx.madeAToken) return failure(clause);
    const bound = bind(quoted.ability, {});
    if (!bound.ok || bound.ability.kind !== 'static') return failure(clause);
    const own = newContext('ability', [], [], ctx.cardName);
    // The permanent itself may be given a characteristic-defining ability (issue 345), which the general static lowering reads.
    const general = itself ? lateLowerers() : null;
    if (itself && general === null) return failure(clause);
    const lowered =
      itself && general !== null
        ? general.static(bound.ability, own)
        : lowerAngelStatic(bound.ability, own);
    if (!lowered.ok) return failure(clause, lowered.needs);
    if (own.usesX || lowered.value.length === 0) return failure(clause);
    const abilities: Ability[] = [];
    for (const ability of lowered.value) {
      if (
        ability.kind !== 'static' ||
        ability.condition !== undefined ||
        !(itself ? GRANTED_TO_SELF : GRANTED).includes(ability.static.kind)
      ) {
        return failure(clause);
      }
      abilities.push(ability);
    }
    return {
      ok: true,
      value: [{ kind: 'grantAbility', objects: objects.value, abilities, duration: 'permanent' }],
      rule: clause.rule,
    };
  },
};

/**
 * "~ becomes a Bear creature in addition to its other types" with no duration (issue 345, Beorn's Hospitality; CR 205.1b, 613.1d, 611.2a): the permanent itself is a creature of the
 * type besides its types for good, the engine's additive `setTypes` with `permanent`. Only the permanent itself.
 */
export const BECOMES_FOR_GOOD: Lowering<IrClause, Effects> = {
  head: 'becomesForGood',
  id: 'lower.becomes-for-good',
  needs: ['effect:setTypes'],
  lower(clause) {
    const subject = operand(clause, 'objects');
    const types = arg(clause, 'types');
    if (subject?.kind !== 'noun' || subject.det !== 'self' || types?.kind !== 'typeList') {
      return failure(clause);
    }
    if (types.additive !== true || types.cardTypes?.join() !== 'creature') return failure(clause);
    if (!types.subtypes.every((t) => CREATURE_TYPES.has(t))) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'setTypes',
          objects: { kind: 'this' },
          types: ['creature'],
          subtypes: [...types.subtypes],
          additive: true,
          duration: 'permanent',
        },
      ],
      rule: clause.rule,
    };
  },
};
