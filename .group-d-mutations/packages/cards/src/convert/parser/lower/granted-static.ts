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
import { lowerAngelStatic } from './angels';
import { arg, type Effects, failure, operand } from './clauses';
import { objectSelectorOf } from './nouns';
import { type Lowering, newContext } from './types';

/** The static abilities an effect may give for good: the ones the engine reads from an object's abilities after the layers. */
const GRANTED = ['cantLoseGame', 'opponentsCantWin'];

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
    // Only a target: the engine fixes the object as the effect begins (CR 611.2c) from the target of the ability.
    if (subject.det !== 'target' && subject.det !== 'anaphor') return failure(clause);
    const objects = objectSelectorOf(subject, ctx);
    if (!objects.ok) return objects;
    if (objects.value.kind !== 'target') return failure(clause);
    // "Return target Angel card from your graveyard to the battlefield. It gains ...", "Exile target Angel, then return it ...": after the instruction
    // that destroyed, exiled, sacrificed or returned the target, "it" is a new object or a card somewhere else (CR 400.7), not what the grant would find.
    if (ctx.removed.has(objects.value.id)) return failure(clause);
    // "Put a +1/+1 counter on target Angel. Create a 3/3 ... token. It gains ...": once a token was made, "it" and "that creature" name the new token
    // (CR 111.1) or are ambiguous, never the earlier target, so the grant would go to another object than the text says.
    if (subject.det === 'anaphor' && ctx.madeAToken) return failure(clause);
    const bound = bind(quoted.ability, {});
    if (!bound.ok || bound.ability.kind !== 'static') return failure(clause);
    const own = newContext('ability', [], [], ctx.cardName);
    const lowered = lowerAngelStatic(bound.ability, own);
    if (!lowered.ok) return failure(clause, lowered.needs);
    if (own.usesX || lowered.value.length === 0) return failure(clause);
    const abilities: Ability[] = [];
    for (const ability of lowered.value) {
      if (
        ability.kind !== 'static' ||
        ability.condition !== undefined ||
        !GRANTED.includes(ability.static.kind)
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
