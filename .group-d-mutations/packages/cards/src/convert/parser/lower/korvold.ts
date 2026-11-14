/**
 * Lowerings of stage P35 (D-176): "shuffle your graveyard into your library". The other lowerings of the stage extend the ones they belong with
 * (`createToken` for the tokens, `putFromZone` for the card chosen from a graveyard, `return` for "it", `dealDamage` for the controller).
 */
import type { Ability, Effect } from '@commander-arena/engine';
import type { IrAbility, IrClause, IrStaticEffect } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { lowerCondition } from './conditions';
import { type FeatureRef, missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { LowerContext, LowerFailure, Lowering, LowerResult } from './types';

/**
 * "Shuffle your graveyard into your library" (CR 701.24, 400.3): every card in the graveyard goes to its owner's library, then the library is
 * shuffled. The cards go in one move after another and the shuffle follows, so where each lands does not show. The engine's `moveToZone` of
 * `each` card of the graveyard to the library, then `shuffle`.
 */
export const SHUFFLE_GRAVEYARD_IN: Lowering<IrClause, Effects> = {
  head: 'shuffleGraveyardIn',
  id: 'lower.shuffle-graveyard-in',
  needs: ['effect:moveToZone', 'effect:shuffle', 'selector:each'],
  lower(clause) {
    const objects = arg(clause, 'objects');
    if (objects?.kind !== 'noun' || objects.det !== 'each') return failure(clause);
    const filter = lowerFilter(objects);
    if (!filter.ok) return filter;
    const effects: Effect[] = [
      { kind: 'moveToZone', objects: { kind: 'each', filter: filter.value }, to: 'library' },
      { kind: 'shuffle', player: { kind: 'you' } },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

type Static = Extract<IrAbility, { kind: 'static' }>;
type KorvoldStaticEffect = Extract<
  IrStaticEffect,
  { kind: 'groupEntersUntapped' | 'opponentsCantCast' | 'spellsCantBeCountered' }
>;

export function isKorvoldStatic(effect: IrStaticEffect): effect is KorvoldStaticEffect {
  return (
    effect.kind === 'groupEntersUntapped' ||
    effect.kind === 'opponentsCantCast' ||
    effect.kind === 'spellsCantBeCountered'
  );
}

function staticFailure(node: Static, needs: readonly FeatureRef[] = []): LowerFailure {
  return { ok: false, needs, at: node.span, rule: node.rule };
}

/**
 * "Lands you control enter untapped." (stage P37, D-180, CR 614.12): the engine's `groupEntersUntapped`, a replacement effect of the permanent for
 * the permanents that enter and that the subject's filter describes, as they would be on the battlefield. A permanent that would be one of the
 * group itself is not read (a land with it): the engine reads the effect from the permanents already on the battlefield, so it would not apply to
 * the permanent's own entering, which CR 614.12 says it does.
 * "Your opponents can't cast spells during your turn." (CR 101.2, 604.1): the engine's `opponentsCantCastOnYourTurn`, with the condition of
 * "As long as ~ is attached to a creature" when there is one.
 */
export function lowerKorvoldStatic(
  ability: Static,
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  const { statement } = ability;
  const [effect, ...more] = statement.effects;
  if (
    effect === undefined ||
    !isKorvoldStatic(effect) ||
    more.length > 0 ||
    statement.also !== undefined
  ) {
    return staticFailure(ability);
  }
  if (effect.kind === 'opponentsCantCast') {
    if (statement.subject.det !== 'you') return staticFailure(ability);
    const needs: FeatureRef[] = ['ability:static', 'static:opponentsCantCastOnYourTurn'];
    if (statement.condition !== undefined) needs.push('ability:staticCondition');
    const blocked = missingFeatures(needs);
    if (blocked.length > 0) return staticFailure(ability, blocked);
    let condition: LowerResult<import('@commander-arena/engine').Condition> | undefined;
    if (statement.condition !== undefined) {
      condition = lowerCondition(statement.condition, true, ctx);
      if (!condition.ok) return condition;
    }
    return {
      ok: true,
      value: [
        {
          kind: 'static',
          static: { kind: 'opponentsCantCastOnYourTurn' },
          ...(condition?.ok === true ? { condition: condition.value } : {}),
        },
      ],
      rule: ability.rule,
    };
  }
  if (statement.condition !== undefined) return staticFailure(ability);
  if (effect.kind === 'spellsCantBeCountered') {
    // "Creature spells you control can't be countered." (stage P40, D-186, CR 101.2): the engine's `spellsCantBeCountered`, with the filter of the
    // spells; the engine reads it against the spell on the stack, so the filter names no zone.
    const needed = missingFeatures(['ability:static', 'static:spellsCantBeCountered']);
    if (needed.length > 0) return staticFailure(ability, needed);
    if (statement.subject.det !== 'each') return staticFailure(ability);
    const { zone: _spellZone, ...spellFilter } = statement.subject.filter;
    void _spellZone;
    const spells = lowerFilter({ ...statement.subject, filter: spellFilter });
    if (!spells.ok) return spells;
    return {
      ok: true,
      value: [{ kind: 'static', static: { kind: 'spellsCantBeCountered', spells: spells.value } }],
      rule: ability.rule,
    };
  }
  const blocked = missingFeatures(['ability:replacement', 'replacement:groupEntersUntapped']);
  if (blocked.length > 0) return staticFailure(ability, blocked);
  const { subject } = statement;
  const { zone, ...rest } = subject.filter;
  void zone;
  const what = lowerFilter({ ...subject, filter: rest });
  if (!what.ok) return what;
  const { types = [], subtypes = [], anyOf } = what.value;
  const itself =
    anyOf !== undefined ||
    (types.length === 0 && subtypes.length === 0) ||
    types.some((t) => ctx.faceTypes.includes(t)) ||
    subtypes.some((t) => ctx.faceSubtypes.includes(t));
  if (itself) return staticFailure(ability);
  return {
    ok: true,
    value: [
      { kind: 'replacement', replacement: { kind: 'groupEntersUntapped', what: what.value } },
    ],
    rule: ability.rule,
  };
}

/**
 * "Until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able" (stage P37,
 * D-180, CR 508.1d, 611.2a): the engine's `requireAttack`, a requirement on the creatures the filter describes whenever attackers are declared.
 */
export const REQUIRE_ATTACK: Lowering<IrClause, Effects> = {
  head: 'requireAttack',
  id: 'lower.require-attack',
  needs: ['effect:requireAttack', 'duration:untilYourNextTurn'],
  takesDuration: true,
  lower(clause) {
    const objects = arg(clause, 'objects');
    const away = arg(clause, 'away');
    if (
      objects?.kind !== 'noun' ||
      objects.det !== 'each' ||
      away?.kind !== 'flag' ||
      clause.duration?.scope !== 'untilYourNextTurn'
    ) {
      return failure(clause);
    }
    // The group is read when attackers are declared, so the filter names no zone.
    const { zone, ...rest } = objects.filter;
    void zone;
    const creatures = lowerFilter({ ...objects, filter: rest });
    if (!creatures.ok) return creatures;
    const effect: Effect = {
      kind: 'requireAttack',
      creatures: creatures.value,
      duration: 'untilYourNextTurn',
      ...(away.value ? { awayFromYou: true as const } : {}),
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/**
 * "Starting with you, each player votes for profit or security." (stage P44, D-195, CR 701.38a, 701.38b): the engine's `vote`, with the options as the
 * card writes them. The grammar reads only the vote that starts with "you" (the controller), so that is what the engine's node says.
 */
export const VOTE: Lowering<IrClause, Effects> = {
  head: 'vote',
  id: 'lower.vote',
  needs: ['effect:vote'],
  lower(clause) {
    const options = arg(clause, 'options');
    if (
      options?.kind !== 'choiceKind' ||
      options.what !== 'option' ||
      options.options === undefined
    ) {
      return failure(clause);
    }
    const effect: Effect = { kind: 'vote', options: options.options, startingWith: 'you' };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "The Ring tempts you." (stage P45, D-197, CR 701.54a): the engine's `ringTempts`, which has no operand (the controller is tempted). */
export const RING_TEMPTS: Lowering<IrClause, Effects> = {
  head: 'ringTempts',
  id: 'lower.ring-tempts',
  needs: ['effect:ringTempts'],
  lower(clause) {
    return { ok: true, value: [{ kind: 'ringTempts' }], rule: clause.rule };
  },
};

/** Features the lowerings of this file can name, for the dimension test. */
export const KORVOLD_NEEDS: readonly FeatureRef[] = [
  'ability:static',
  'ability:staticCondition',
  'ability:replacement',
  'static:opponentsCantCastOnYourTurn',
  'static:spellsCantBeCountered',
  'replacement:groupEntersUntapped',
  'condition:objectMatches',
  'selector:attached',
  'effect:chooseOne',
  'effect:requireAttack',
  'duration:untilYourNextTurn',
  'effect:moveToZone',
  'effect:shuffle',
  'selector:each',
  'keyword:chooseBackground',
  'effect:vote',
  'effect:ringTempts',
  'duration:forAsLongAsYouControlThis',
];

export const KORVOLD_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  SHUFFLE_GRAVEYARD_IN,
  REQUIRE_ATTACK,
  VOTE,
  RING_TEMPTS,
];
