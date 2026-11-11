/**
 * Lowering (D-063, proposal 3.6): bound IR in, engine AST out, gated by what the engine runs.
 * `lower` is the only place IR becomes an `Ability` or spell text, and `validateCard` stays the
 * last gate (D-007), so a lowering bug still cannot mark a card supported.
 */
import type { Ability, Effect, SpellText } from '@commander-arena/engine';
import type { IrAbility } from '../ir/types';
import {
  ABILITY_NEEDS,
  lowerKeyword,
  lowerModalSpell,
  lowerReplacement,
  lowerSpell,
} from './abilities';
import { ACTIVATED_NEEDS, lowerActivated } from './activated';
import { ADAMANTOISE_NEEDS, lowerRedirectDamage } from './adamantoise';
import { AMOUNT_NEEDS } from './amounts';
import { ANGEL_NEEDS } from './angels';
import { ATTACHMENT_NEEDS } from './attachments';
import { CONDITION_NEEDS } from './conditions';
import { COST_NEEDS } from './costs';
import { DRAGON_NEEDS } from './dragons';
import { EFFECT_LOWERINGS } from './effects';
import { SEARCH_NEEDS } from './effects-more';
import type { FeatureRef } from './features';
import { KORVOLD_NEEDS } from './korvold';
import { registerLateLowerers } from './late';
import { MODAL_NEEDS } from './modal';
import { NOUN_EXTRA_NEEDS, SELECTOR_NEEDS } from './nouns';
import { PLANESWALKER_NEEDS } from './planeswalker';
import { SENTENCE_NEEDS } from './sentences';
import { ALTERNATIVE_COST_NEEDS, lowerAlternativeKeyword, lowerSpellCosts } from './spell-costs';
import { lowerStatic, STATIC_NEEDS } from './statics';
import { lowerTriggered, TRIGGER_NEEDS } from './triggers';
import type { FaceCosts, LowerContext, LowerResult, SpellParts } from './types';

// The clause that creates a token with an ability in quotes lowers that ability with these two (stage P35, D-176; `late.ts`).
registerLateLowerers({ triggered: lowerTriggered, activated: lowerActivated, static: lowerStatic });

export type { FeatureRef } from './features';
export { isRunnable, missingFeatures } from './features';
export type {
  FaceCosts,
  LowerContext,
  LowerFailure,
  Lowering,
  LowerResult,
  SpellParts,
} from './types';
export { newContext } from './types';

/**
 * What one ability lowers to: engine abilities, the pieces of a spell's text, or what a line says
 * about the cost of casting its card (the face's additional and alternative costs, stage P13).
 */
export type Lowered =
  | { readonly kind: 'abilities'; readonly abilities: readonly Ability[] }
  | { readonly kind: 'spell'; readonly parts: SpellParts }
  | { readonly kind: 'faceCosts'; readonly costs: FaceCosts };

export function lower(ability: IrAbility, ctx: LowerContext): LowerResult<Lowered> {
  const wrap = <T>(r: LowerResult<T>, make: (value: T) => Lowered): LowerResult<Lowered> =>
    r.ok ? { ok: true, value: make(r.value), rule: r.rule } : r;
  // CR 107.3j: a triggered or static ability has no X announced for it, so a text that reads X
  // there (not defined by "where X is ...", which no rule reads) is refused, as `validateCard` does.
  const withoutX = <T>(r: LowerResult<T>): LowerResult<T> =>
    r.ok && ctx.usesX ? { ok: false, needs: [], at: ability.span, rule: ability.rule } : r;
  switch (ability.kind) {
    case 'keyword': {
      // Overload, Evoke, Dash and the other named alternatives (Madness and Foretell: stage P26) are
      // alternative costs of the face, not abilities (stage P22).
      const alternative = lowerAlternativeKeyword(ability);
      if (alternative !== null) {
        return wrap(alternative, (costs) => ({ kind: 'faceCosts', costs }));
      }
      return wrap(lowerKeyword(ability, ctx), (abilities) => ({ kind: 'abilities', abilities }));
    }
    case 'replacement':
      return wrap(
        // Stage P43 (D-193): a redirection of damage is the ability of a creature face.
        ability.event.verb === 'redirectDamage'
          ? lowerRedirectDamage(ability, ctx)
          : lowerReplacement(ability),
        (abilities) => ({ kind: 'abilities', abilities }),
      );
    case 'activated':
      return wrap(lowerActivated(ability, ctx), (abilities) => ({ kind: 'abilities', abilities }));
    case 'spell':
      return wrap(lowerSpell(ability, ctx), (parts) => ({ kind: 'spell', parts }));
    case 'triggered':
      return wrap(withoutX(lowerTriggered(ability, ctx)), (abilities) => ({
        kind: 'abilities',
        abilities,
      }));
    case 'static': {
      const costs = lowerSpellCosts(ability);
      if (costs !== null) return wrap(costs, (value) => ({ kind: 'faceCosts', costs: value }));
      return wrap(withoutX(lowerStatic(ability, ctx)), (abilities) => ({
        kind: 'abilities',
        abilities,
      }));
    }
    case 'modal':
      return wrap(lowerModalSpell(ability, ctx), (parts) => ({ kind: 'spell', parts }));
  }
}

/** The text of a spell from the pieces of its lines, in order: one effect stays a bare effect. */
export function finishSpell(parts: readonly SpellParts[]): SpellText {
  const targets = parts.flatMap((p) => p.targets);
  const effects = parts.flatMap((p) => p.effects);
  const x = parts.some((p) => p.x);
  // A modal spell (stage P19) is the whole text: `parseFaceText` refuses a face with other spell lines.
  const modal = parts.find((p) => p.modal !== undefined)?.modal;
  if (modal !== undefined) {
    return { modes: [...modal.modes], chooseModes: modal.chooseModes, ...(x ? { x: true } : {}) };
  }
  const [only] = effects;
  const effect: Effect =
    effects.length === 1 && only !== undefined ? only : { kind: 'sequence', effects: [...effects] };
  return {
    ...(targets.length > 0 ? { targets: [...targets] } : {}),
    effect,
    ...(x ? { x: true } : {}),
  };
}

/** Every feature reference a lowering can name: what the dimension test checks against the engine. */
export const DECLARED_NEEDS: readonly FeatureRef[] = [
  ...new Set<FeatureRef>([
    ...EFFECT_LOWERINGS.flatMap((l) => l.needs),
    ...ABILITY_NEEDS,
    ...ALTERNATIVE_COST_NEEDS,
    ...MODAL_NEEDS,
    ...ACTIVATED_NEEDS,
    ...COST_NEEDS,
    ...SEARCH_NEEDS,
    ...TRIGGER_NEEDS,
    ...STATIC_NEEDS,
    ...ATTACHMENT_NEEDS,
    ...ANGEL_NEEDS,
    ...DRAGON_NEEDS,
    ...KORVOLD_NEEDS,
    ...PLANESWALKER_NEEDS,
    ...ADAMANTOISE_NEEDS,
    ...CONDITION_NEEDS,
    ...SENTENCE_NEEDS,
    ...AMOUNT_NEEDS,
    ...(Object.values(SELECTOR_NEEDS) as FeatureRef[]),
    'token:Treasure',
    'token:Food',
    'token:Clue',
    'token:Map',
    'token:Blood',
    'token:custom',
    'token:copyOf',
    'token:tapped',
    ...NOUN_EXTRA_NEEDS,
    'selector:colorChoice',
  ]),
];
