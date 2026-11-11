/**
 * Clause lowerings of stage P5: the continuous effects of a resolving spell or ability (CR 611.2a,
 * 613) and the flicker sentence. Same contract as effects.ts: each declares the engine features it
 * needs and is checked before it runs. Every continuous effect here lasts until end of turn, the
 * one duration the engine runs (`duration:untilEndOfTurn`), and the clause must state it.
 */
import type { CardType, Color, Effect, ObjectSelector } from '@commander-arena/engine';
import type { IrClause, IrTypeList } from '../ir/types';
import { isGrantable, keywordKind, plainKeyword } from '../rules/keyword/vocabulary';
import { arg, type Effects, eachObject, failure, operand } from './clauses';
import { missingFeatures } from './features';
import { colorLetter, itemsOf, objectSelectorOf } from './nouns';
import type { Lowering, LowerResult } from './types';

const END = 'untilEndOfTurn' as const;

/** "It" may be the permanent whose event caused the trigger (D-133): the continuous effects read it. */
const TRIGGER_SUBJECT = { triggerSubject: true } as const;

const endsWithTurn = (clause: IrClause) => clause.duration?.scope === 'untilEndOfTurn';

/**
 * "Target creature gains flying until end of turn" (CR 613.1f): a keyword without parameters the
 * engine can grant. The rule reads only those words; the lowering checks them again, so a keyword
 * that cannot be granted is never lowered whatever read it.
 */
export const GRANT_KEYWORD: Lowering<IrClause, Effects> = {
  head: 'grantKeyword',
  id: 'lower.grant-keyword',
  needs: ['effect:grantKeyword', 'duration:untilEndOfTurn'],
  takesDuration: true,
  lower(clause, ctx) {
    const word = arg(clause, 'keyword');
    // "... for as long as ~ remains on the battlefield" (stage P50, D-207, CR 611.2b): the duration of an ability of a permanent.
    const whileRemains = clause.duration?.scope === 'whileSelfRemains';
    // "... for as long as you control ~" (stage P68, D-229, CR 611.2b): ends as the permanent leaves or another player controls it.
    const whileControlling = clause.duration?.scope === 'whileYouControlSelf';
    if (
      word?.kind !== 'keywordName' ||
      (!endsWithTurn(clause) && !whileRemains && !whileControlling)
    ) {
      return failure(clause);
    }
    if (whileRemains || whileControlling) {
      const blocked = missingFeatures([
        whileRemains ? 'duration:forAsLongAsThisRemains' : 'duration:forAsLongAsYouControlThis',
      ]);
      if (blocked.length > 0)
        return { ok: false, needs: blocked, at: clause.span, rule: clause.rule };
    }
    const kind = keywordKind(word.name);
    if (kind === undefined || !isGrantable(kind)) return failure(clause);
    return eachObject(
      clause,
      ctx,
      (objects) => ({
        kind: 'grantKeyword',
        objects,
        keyword: plainKeyword(kind),
        duration: whileRemains
          ? ('forAsLongAsThisRemains' as const)
          : whileControlling
            ? ('forAsLongAsYouControlThis' as const)
            : END,
      }),
      'objects',
      { ...TRIGGER_SUBJECT, token: true },
    );
  },
};

/**
 * "Target creature can't be blocked this turn" (CR 509.1b, 611.2a): the engine's `restrict` on the
 * one creature the clause names. "This turn" ends in the cleanup step like "until end of turn"
 * (CR 514.2). Only the restrictions an effect can give for a turn are lowered (the engine's
 * `RESTRICTABLE_BY_EFFECT`); the rule reads no others, and the lowering checks again.
 */
export const RESTRICT: Lowering<IrClause, Effects> = {
  head: 'restrict',
  id: 'lower.restrict',
  needs: ['effect:restrict', 'duration:untilEndOfTurn'],
  takesDuration: true,
  lower(clause, ctx) {
    const given = arg(clause, 'restriction');
    const scope = clause.duration?.scope;
    if (given?.kind !== 'restrictionKind') return failure(clause);
    // "for as long as you control ~" (stage P45, D-197, CR 611.2b): the duration of an ability of a permanent.
    const whileControlling = scope === 'whileYouControlSelf';
    if (scope !== 'thisTurn' && scope !== 'untilEndOfTurn' && !whileControlling) {
      return failure(clause);
    }
    if (whileControlling) {
      const blocked = missingFeatures(['duration:forAsLongAsYouControlThis']);
      if (blocked.length > 0)
        return { ok: false, needs: blocked, at: clause.span, rule: clause.rule };
    }
    const { restriction } = given;
    if (
      restriction !== 'cantBlock' &&
      restriction !== 'cantBeBlocked' &&
      restriction !== 'attacksEachCombat' &&
      restriction !== 'mustBeBlocked'
    ) {
      return failure(clause);
    }
    // One chosen creature (the engine's `restrict` of a target, as its fixtures write it), or every
    // creature of a group as the effect begins (`each`, CR 611.2c).
    const noun = operand(clause, 'objects');
    // Stage P53 (D-212): "~ and that creature each ... attack this turn if able": each of the nouns of a list is one of those.
    const named = noun === undefined ? [] : noun.kind === 'nounList' ? noun.items : [noun];
    if (
      named.length === 0 ||
      !named.every((n) => ['target', 'each', 'self', 'anaphor', 'triggerSubject'].includes(n.det))
    ) {
      return failure(clause);
    }
    return eachObject(
      clause,
      ctx,
      (objects) => ({
        kind: 'restrict',
        objects,
        restriction,
        duration: whileControlling ? 'forAsLongAsYouControlThis' : END,
      }),
      'objects',
      TRIGGER_SUBJECT,
    );
  },
};

/** "Target creature loses all abilities until end of turn" (CR 613.1f). */
export const LOSE_ALL_ABILITIES: Lowering<IrClause, Effects> = {
  head: 'loseAllAbilities',
  id: 'lower.lose-all-abilities',
  needs: ['effect:loseAllAbilities', 'duration:untilEndOfTurn'],
  takesDuration: true,
  lower(clause, ctx) {
    if (!endsWithTurn(clause)) return failure(clause);
    return eachObject(
      clause,
      ctx,
      (objects) => ({
        kind: 'loseAllAbilities',
        objects,
        duration: END,
      }),
      'objects',
      TRIGGER_SUBJECT,
    );
  },
};

/** "Target creature has base power and toughness 4/4 until end of turn" (CR 613.4b). */
export const SET_PT: Lowering<IrClause, Effects> = {
  head: 'setPt',
  id: 'lower.set-pt',
  needs: ['effect:setPt', 'duration:untilEndOfTurn'],
  takesDuration: true,
  lower(clause, ctx) {
    const base = arg(clause, 'basePt');
    if (base?.kind !== 'basePt' || !endsWithTurn(clause)) return failure(clause);
    return eachObject(
      clause,
      ctx,
      (objects) => ({
        kind: 'setPt',
        objects,
        power: base.power,
        toughness: base.toughness,
        duration: END,
      }),
      'objects',
      TRIGGER_SUBJECT,
    );
  },
};

/**
 * "Target creature becomes a blue Frog with base power and toughness 1/1 until end of turn": one
 * effect per layer it touches, in the order types (CR 613.1d), colors (CR 613.1e), then base power
 * and toughness (CR 613.4b), for the one object the subject names. The creature types replace the
 * creature types and keep the card types (CR 205.1a, 205.3d), which is `setTypes` with `subtypes`
 * only; the engine refuses a type that is not a creature type.
 */
export const BECOMES: Lowering<IrClause, Effects> = {
  head: 'becomes',
  id: 'lower.becomes',
  needs: ['effect:setTypes', 'effect:setColors', 'effect:setPt', 'duration:untilEndOfTurn'],
  takesDuration: true,
  lower(clause, ctx) {
    const subject = operand(clause, 'objects');
    const types = arg(clause, 'types');
    const colors = arg(clause, 'colors');
    const base = arg(clause, 'basePt');
    if (subject === undefined || !endsWithTurn(clause)) return failure(clause);
    if (types !== undefined && types.kind !== 'typeList') return failure(clause);
    if (colors !== undefined && colors.kind !== 'colorSpec') return failure(clause);
    if (base !== undefined && base.kind !== 'basePt') return failure(clause);
    const letters: Color[] = [];
    for (const word of colors?.colors ?? []) {
      const letter = colorLetter(word);
      if (letter === undefined) return failure(clause);
      letters.push(letter);
    }
    const effects: Effect[] = [];
    for (const item of itemsOf(subject)) {
      const objects = objectSelectorOf(item, ctx, TRIGGER_SUBJECT);
      if (!objects.ok) return objects;
      effects.push(...becoming(objects.value, types, colors && letters, base));
    }
    return { ok: true, value: effects, rule: clause.rule };
  },
};

function becoming(
  objects: ObjectSelector,
  types: IrTypeList | undefined,
  colors: readonly Color[] | undefined,
  base: { power: number; toughness: number } | undefined,
): Effect[] {
  const out: Effect[] = [];
  // "Each noncreature artifact you control becomes a 4/4 artifact creature" (stage P64, D-217, CR 611.2c, 613.4b): a group is fixed once, as the effect begins, so its
  // types and its base power and toughness are one effect (a second one would read "noncreature" again, after the first made them creatures).
  if (
    types?.cardTypes?.includes('creature') === true &&
    base !== undefined &&
    objects.kind === 'each' &&
    colors === undefined
  ) {
    return [
      {
        kind: 'setTypes',
        objects,
        types: types.cardTypes as CardType[],
        ...(types.additive === true ? { additive: true as const } : {}),
        basePt: { power: base.power, toughness: base.toughness },
        duration: END,
      },
    ];
  }
  if (types !== undefined) {
    // "an artifact creature" adds to the types the object has (CR 205.1b); creature types alone
    // replace the creature types and keep the card types (CR 205.1a, 205.3d).
    out.push({
      kind: 'setTypes',
      objects,
      ...(types.cardTypes === undefined ? {} : { types: types.cardTypes as CardType[] }),
      ...(types.subtypes.length === 0 ? {} : { subtypes: types.subtypes }),
      ...(types.additive === true ? { additive: true as const } : {}),
      duration: END,
    });
  }
  if (colors !== undefined) out.push({ kind: 'setColors', objects, colors, duration: END });
  if (base !== undefined) {
    out.push({
      kind: 'setPt',
      objects,
      power: base.power,
      toughness: base.toughness,
      duration: END,
    });
  }
  return out;
}

/**
 * "Exile target creature, then return it to the battlefield under its owner's control": an `exile`
 * and a `moveToZone` of `moved`, the new object the exile made (CR 400.7, 400.7j), onto the
 * battlefield under the owner's or your control (CR 110.2), tapped when the text says so. The
 * engine refuses it when the target could be an Aura (CR 303.4f).
 */
export const FLICKER: Lowering<IrClause, Effects> = {
  head: 'flicker',
  id: 'lower.flicker',
  needs: ['effect:exile', 'effect:moveToZone', 'selector:moved'],
  lower(clause, ctx): LowerResult<Effects> {
    const what = operand(clause, 'objects');
    const to = arg(clause, 'to');
    if (what?.kind !== 'noun' || to?.kind !== 'zoneSpec') return failure(clause);
    if (to.zone !== 'battlefield' || to.whose === undefined) return failure(clause);
    const objects = objectSelectorOf(what, ctx);
    if (!objects.ok) return objects;
    const back: Effect = {
      kind: 'moveToZone',
      objects: { kind: 'moved' },
      to: 'battlefield',
      ...(to.tapped === true ? { tapped: true } : {}),
      controller: to.whose,
    };
    return {
      ok: true,
      value: [{ kind: 'exile', objects: objects.value }, back],
      rule: clause.rule,
    };
  },
};

/**
 * "Exile up to one target creature or land you control. If you do, return it to the battlefield under its owner's control at the beginning of the next
 * end step." (stage P48, D-205, CR 603.7, 603.7c, 400.7j): the engine's `delayedTrigger` at the end step of each turn whose effect moves what the
 * exile before it moved (`moved`). "It" must be a target an `exile` of the same text sent away; after anything else (a destroy, a sacrifice, a
 * graveyard card) the return is not lowered. The engine refuses a target that could be an Aura (CR 303.4f), as for the flicker.
 */
export const DELAYED_RETURN: Lowering<IrClause, Effects> = {
  head: 'delayedReturn',
  id: 'lower.delayed-return',
  needs: ['effect:delayedTrigger', 'effect:moveToZone', 'selector:moved'],
  lower(clause, ctx): LowerResult<Effects> {
    const what = operand(clause, 'objects');
    const to = arg(clause, 'to');
    if (what?.kind !== 'noun' || to?.kind !== 'zoneSpec') return failure(clause);
    if (to.zone !== 'battlefield' || to.whose === undefined) return failure(clause);
    if (what.det !== 'anaphor' || what.ref === undefined || what.ref !== ctx.exiledRef) {
      return failure(clause);
    }
    const back: Effect = {
      kind: 'moveToZone',
      objects: { kind: 'moved' },
      to: 'battlefield',
      ...(to.tapped === true ? { tapped: true } : {}),
      controller: to.whose,
    };
    return {
      ok: true,
      value: [{ kind: 'delayedTrigger', at: { step: 'endStep', whose: 'each' }, effect: back }],
      rule: clause.rule,
    };
  },
};
