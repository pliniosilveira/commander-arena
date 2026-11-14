/**
 * Lowerings of stage P43 (D-193): "All damage that would be dealt to you and other permanents you control is dealt to ~ instead." (the engine's
 * replacement `redirectDamage`, CR 614.9) and "Damage isn't removed from ~ during cleanup steps." (the engine's static `keepsDamage`, CR 514.2).
 */
import type { Ability, ObjectFilter } from '@commander-arena/engine';
import type { IrAbility, IrStaticEffect } from '../ir/types';
import { type FeatureRef, missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { LowerContext, LowerFailure, LowerResult } from './types';

type Static = Extract<IrAbility, { kind: 'static' }>;
type Replacement = Extract<IrAbility, { kind: 'replacement' }>;

export const isKeepsDamage = (effect: IrStaticEffect): boolean => effect.kind === 'keepsDamage';

function failed(node: Static | Replacement, needs: readonly FeatureRef[] = []): LowerFailure {
  return { ok: false, needs, at: node.span, rule: node.rule };
}

/**
 * "Damage isn't removed from ~ during cleanup steps." (CR 514.2): the statement is about the permanent itself (`~`), has one effect and no
 * condition or second part: the engine runs it with none, which would be half of the ability.
 */
export function lowerKeepsDamage(ability: Static): LowerResult<readonly Ability[]> {
  const { statement } = ability;
  const [effect, ...more] = statement.effects;
  if (
    effect === undefined ||
    effect.kind !== 'keepsDamage' ||
    more.length > 0 ||
    statement.also !== undefined ||
    statement.condition !== undefined ||
    statement.subject.det !== 'self'
  ) {
    return failed(ability);
  }
  const needed = missingFeatures(['ability:static', 'static:keepsDamage']);
  if (needed.length > 0) return failed(ability, needed);
  return {
    ok: true,
    value: [{ kind: 'static', static: { kind: 'keepsDamage', subject: { kind: 'this' } } }],
    rule: ability.rule,
  };
}

/**
 * "All damage that would be dealt to you and other permanents you control is dealt to ~ instead." (CR 614.9): a replacement effect of a creature.
 * The recipients are "you" and a plural group of the controller's own, read as they are on the battlefield (no zone), with "other" implied by the
 * engine (a redirection never applies to damage dealt to its own creature). The damage is dealt to the permanent with the ability, which must be a
 * creature: the engine refuses the ability on another face, so it is not lowered there.
 */
export function lowerRedirectDamage(
  ability: Replacement,
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  const { event } = ability;
  const you = event.args.you;
  const group = event.args.permanents;
  if (
    you?.kind !== 'flag' ||
    (group !== undefined && group.kind !== 'noun') ||
    event.condition !== undefined ||
    ability.instead !== undefined
  ) {
    return failed(ability);
  }
  const needed = missingFeatures(['ability:replacement', 'replacement:redirectDamage']);
  if (needed.length > 0) return failed(ability, needed);
  if (!ctx.faceTypes.includes('creature')) return failed(ability);
  const built = (permanents?: ObjectFilter): LowerResult<readonly Ability[]> => ({
    ok: true,
    value: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'redirectDamage',
          you: you.value,
          ...(permanents === undefined ? {} : { permanents }),
        },
      },
    ],
    rule: ability.rule,
  });
  if (group === undefined) return built();
  const { zone: _zone, ...rest } = group.filter;
  void _zone;
  const permanents = lowerFilter({ ...group, filter: rest });
  if (!permanents.ok) return permanents;
  return built(permanents.value);
}

/** Features the lowerings of this file can name, for the dimension test. */
export const ADAMANTOISE_NEEDS: readonly FeatureRef[] = [
  'ability:static',
  'ability:replacement',
  'static:keepsDamage',
  'replacement:redirectDamage',
];
