/**
 * Lowerings of the casting of a card an earlier sentence chose from your graveyard (Conduit of Worlds): "you may cast that card" and "you can't cast additional spells this turn".
 * The sentences that join them ("If you haven't cast a spell this turn, ... If you do, ...") are in `sentences.ts`.
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, eachObject, failure, operand } from './clauses';
import { graveyardCardTarget } from './danitha-g1b';
import { missingFeatures } from './features';
import type { Lowering } from './types';

/**
 * "You may cast that card" (CR 608.2g, 608.2c, 601.2): the engine's `castCard` on the target card of the controller's own graveyard that "that card" names, paying its mana cost.
 * The effect asks the controller whether to cast the card, so the "you may" is that question and no `may` of its own (`acceptsOptional`). A card that is not a target of your
 * own graveyard (the engine casts a card from a graveyard it is in) is not lowered.
 */
export const CAST_THAT_CARD: Lowering<IrClause, Effects> = {
  head: 'castThatCard',
  id: 'lower.cast-that-card',
  needs: ['effect:castCard', 'selector:target'],
  acceptsOptional: true,
  lower(clause, ctx) {
    const may = arg(clause, 'may');
    if (may?.kind !== 'flag' || !may.value) return failure(clause);
    const id = graveyardCardTarget(operand(clause, 'objects'), ctx, true);
    if (id === null) return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'castCard', object: { kind: 'target', id } }],
      rule: clause.rule,
    };
  },
};

/**
 * "You may cast ~ from your graveyard" (CR 113.6b, 608.2g, 601.2; Sproutback Trudge): the engine's `castCard` on the card with the triggered ability, in the graveyard it works from, paying
 * its mana cost. The effect asks the controller itself, so the "you may" is that question. Only in a trigger (`graveyardSource`), which then works from the graveyard.
 */
export const CAST_THIS_FROM_GRAVEYARD: Lowering<IrClause, Effects> = {
  head: 'castThisFromGraveyard',
  id: 'lower.cast-this-from-graveyard',
  needs: ['effect:castCard', 'selector:this', 'ability:functionsInGraveyard'],
  acceptsOptional: true,
  lower(clause, ctx) {
    const may = arg(clause, 'may');
    // The offer is the "you may" of the words (the flag) or one the sentence read before the clause (`optional`); a cast that is not a choice is not run.
    const offered = (may?.kind === 'flag' && may.value) || clause.optional;
    if (!offered || !ctx.graveyardSource) return failure(clause);
    const blocked = missingFeatures([
      'effect:castCard',
      'selector:this',
      'ability:functionsInGraveyard',
    ]);
    if (blocked.length > 0)
      return { ok: false, needs: blocked, at: clause.span, rule: clause.rule };
    ctx.usedGraveyardSource = true;
    return {
      ok: true,
      value: [{ kind: 'castCard', object: { kind: 'this' } }],
      rule: clause.rule,
    };
  },
};

/** "You can't cast additional spells this turn" (CR 101.2, 611.2a): the engine's `playerCantCastSpells` for the controller until end of turn. */
export const CANT_CAST_ADDITIONAL_SPELLS: Lowering<IrClause, Effects> = {
  head: 'cantCastAdditionalSpells',
  id: 'lower.cant-cast-additional-spells',
  needs: ['effect:playerCantCastSpells'],
  lower(clause) {
    const blocked = missingFeatures(['effect:playerCantCastSpells']);
    if (blocked.length > 0)
      return { ok: false, needs: blocked, at: clause.span, rule: clause.rule };
    return {
      ok: true,
      value: [
        { kind: 'playerCantCastSpells', player: { kind: 'you' }, duration: 'untilEndOfTurn' },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "You may cast it from your graveyard as an Adventure until the end of your next turn" (Hildibrand Manderville, issue 98; CR 601.2, 715.3, 611.2a, 400.7, 603.10a): the engine's
 * `mayCast` with `adventure` on the card the permanent with the dying trigger became (`thisCard`), until the end of the controller's next turn. The permission is the offer, so no
 * `may` of its own (`acceptsOptional`). "It" is read only as the card of a trigger about the permanent itself dying or leaving the battlefield (`ctx.itIsCard`).
 */
export const MAY_CAST_ADVENTURE: Lowering<IrClause, Effects> = {
  head: 'mayCastAdventure',
  id: 'lower.may-cast-adventure',
  needs: ['effect:mayCast', 'selector:thisCard', 'duration:untilEndOfNextTurn'],
  acceptsOptional: true,
  lower(clause, ctx) {
    const blocked = missingFeatures([
      'effect:mayCast',
      'selector:thisCard',
      'duration:untilEndOfNextTurn',
    ]);
    if (blocked.length > 0)
      return { ok: false, needs: blocked, at: clause.span, rule: clause.rule };
    if (!ctx.itIsCard) return failure(clause);
    const lowered = eachObject(
      clause,
      ctx,
      (objects) => ({
        kind: 'mayCast',
        objects,
        duration: 'untilEndOfNextTurn',
        adventure: true,
      }),
      'objects',
      { thisCard: true },
    );
    // Only the card the dying permanent became: another "it" (a target, an earlier object) is not read.
    if (
      lowered.ok &&
      lowered.value.some((e) => e.kind !== 'mayCast' || e.objects.kind !== 'thisCard')
    ) {
      return failure(clause);
    }
    return lowered;
  },
};

export const GRAVEYARD_CAST_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  CAST_THAT_CARD,
  CAST_THIS_FROM_GRAVEYARD,
  MAY_CAST_ADVENTURE,
  CANT_CAST_ADDITIONAL_SPELLS,
];
