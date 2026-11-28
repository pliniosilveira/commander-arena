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
import { amountArg, arg, type Effects, failure, operand } from './clauses';
import { missingFeatures } from './features';
import { lateLowerers } from './late';
import { objectSelectorOf, playerSelectorOf } from './nouns';
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

/**
 * "Target creature becomes a Treasure artifact with \"{T}, Sacrifice ~: Add one mana of any color\" and loses all other card types and abilities." (CR 205.1a, 205.3d, 613.1d,
 * 613.1f, 611.2a; Vraska, Betrayal's Sting): three effects of one target, all for good, in the order of the layers and of the timestamps: the types are replaced (layer 4: the
 * object is only an artifact, its creature types go with the creature type, the new subtype is added), it loses all abilities (layer 6), and then it is given the quoted mana
 * ability (layer 6, a later timestamp, so the loss does not take it away, CR 613.7).
 */
export const BECOMES_LOSES_ALL: Lowering<IrClause, Effects> = {
  head: 'becomesLosesAll',
  id: 'lower.becomes-loses-all',
  needs: ['effect:setTypes', 'effect:loseAllAbilities', 'effect:grantAbility'],
  lower(clause, ctx) {
    const subject = operand(clause, 'objects');
    const types = arg(clause, 'types');
    const quoted = arg(clause, 'ability');
    if (
      subject?.kind !== 'noun' ||
      subject.det !== 'target' ||
      types?.kind !== 'typeList' ||
      quoted?.kind !== 'quoted'
    ) {
      return failure(clause);
    }
    const objects = objectSelectorOf(subject, ctx);
    if (!objects.ok) return objects;
    if (objects.value.kind !== 'target') return failure(clause);
    // The permanent the ability names as `~` is the artifact itself: not a group, not a card named inside the quotes.
    if (ctx.namedInQuotes) return failure(clause);
    const bound = bind(quoted.ability, {});
    if (!bound.ok || bound.ability.kind !== 'activated') return failure(clause);
    // The ability of the artifact is lowered like any activated ability (a mana ability, CR 605.1a), for an object that is only an artifact.
    const general = lateLowerers();
    if (general === null) return failure(clause);
    const lowered = general.activated(
      bound.ability,
      newContext('ability', ['artifact'], [], ctx.cardName),
    );
    if (!lowered.ok) return failure(clause, lowered.needs);
    const [mana, ...more] = lowered.value;
    if (mana?.kind !== 'mana' || more.length > 0) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'setTypes',
          objects: objects.value,
          types: ['artifact'],
          subtypes: [...types.subtypes],
          duration: 'permanent',
        },
        { kind: 'loseAllAbilities', objects: objects.value, duration: 'permanent' },
        {
          kind: 'grantAbility',
          objects: objects.value,
          abilities: [mana],
          duration: 'permanent',
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "If target player has fewer than nine poison counters, they get a number of poison counters equal to the difference." (CR 122.1, 107.1b; Vraska, Betrayal's Sting): the engine's
 * `givePoison` of the player the text names, the amount the number less the poison counters the player has as the instruction runs (nothing when they have that many or more).
 * Without a `limit`, "that player gets two poison counters" (Bloodroot Apothecary): the amount the text states.
 */
export const GIVE_POISON: Lowering<IrClause, Effects> = {
  head: 'givePoison',
  id: 'lower.give-poison',
  needs: ['effect:givePoison'],
  lower(clause, ctx) {
    const who = arg(clause, 'player');
    const limit = arg(clause, 'limit');
    if (who?.kind !== 'noun') return failure(clause);
    const player = playerSelectorOf(who, ctx);
    if (!player.ok) return player;
    // Bloodroot Apothecary (CR 122.1, 704.5c): "that player gets two poison counters": a number of poison counters the text states.
    if (limit === undefined) {
      const amount = amountArg(clause, 'amount', ctx);
      if (!amount.ok) return amount;
      return {
        ok: true,
        value: [{ kind: 'givePoison', player: player.value, amount: amount.value }],
        rule: clause.rule,
      };
    }
    if (limit.kind !== 'number') return failure(clause);
    const blocked = missingFeatures(['amount:poisonShortfall']);
    if (blocked.length > 0) return failure(clause, blocked);
    return {
      ok: true,
      value: [
        {
          kind: 'givePoison',
          player: player.value,
          amount: { kind: 'poisonShortfall', limit: limit.value, player: player.value },
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "For as long as that creature has a shadow counter on it, it's a Wraith in addition to its other types" (Minas Morgul, Dark Fortress; CR 611.2b, 122.1, 205.3d, 613.1d): the
 * engine's additive `setTypes` of the creature the sentence before named, with `whileHasCounter`. Only creature types are added.
 */
export const BECOMES_WHILE_COUNTER: Lowering<IrClause, Effects> = {
  head: 'becomesWhileCounter',
  id: 'lower.becomes-while-counter',
  needs: ['effect:setTypes', 'duration:whileHasCounter'],
  lower(clause, ctx) {
    const subject = operand(clause, 'objects');
    const types = arg(clause, 'types');
    const counter = arg(clause, 'counter');
    if (subject?.kind !== 'noun' || types?.kind !== 'typeList' || counter?.kind !== 'name') {
      return failure(clause);
    }
    if (types.additive !== true || types.cardTypes !== undefined) return failure(clause);
    if (!types.subtypes.every((t) => CREATURE_TYPES.has(t))) return failure(clause);
    const objects = objectSelectorOf(subject, ctx);
    if (!objects.ok) return objects;
    if (objects.value.kind !== 'target') return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'setTypes',
          objects: objects.value,
          subtypes: [...types.subtypes],
          additive: true,
          whileHasCounter: counter.name,
          duration: 'permanent',
        },
      ],
      rule: clause.rule,
    };
  },
};
