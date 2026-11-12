/**
 * Modal spells and abilities (stage P19, D-105, D-114; CR 700.2): "Choose one —" and its bullets. The
 * engine's `modes` are two to eight small spells in printed order, each with its own targets (their ids
 * unique across the modes, which the binding pass numbers) and its own effect, and `chooseModes` says how
 * many are chosen. A spell keeps no effect or targets of its own; a triggered or activated ability keeps
 * `effect` as the empty sequence and no targets (`ast/validate-modes.ts`). Each bullet is lowered with
 * the sentence rules of a spell, in a context of its own; everything one mode needs is checked as it is
 * lowered, so a mode the engine cannot run refuses the whole text, with the feature it needs.
 */
import type { Effect, ModeChoice, SpellMode } from '@commander-arena/engine';
import type { IrModes } from '../ir/types';
import { lowerCondition } from './conditions';
import { type FeatureRef, missingFeatures } from './features';
import { lowerSentences } from './sentences';
import { type LowerContext, type LowerFailure, type LowerResult, newContext } from './types';

/** The engine's own limits (`MAX_MODES` in `ast/validate-modes.ts`; fewer than two is not a choice). */
const MIN_MODES = 2;
const MAX_MODES = 8;

export interface LoweredModes {
  readonly modes: readonly SpellMode[];
  readonly chooseModes: ModeChoice;
  /** True when a mode read X: the spell or ability needs an X to read (CR 107.3a). */
  readonly usesX: boolean;
}

/** The ability-level feature a modal spell or ability needs, for the dimension test. */
export const MODAL_NEEDS: readonly FeatureRef[] = ['ability:modal'];

function refuse(modal: IrModes, needs: readonly FeatureRef[] = []): LowerFailure {
  return { ok: false, needs, at: modal.span, rule: modal.rule };
}

/** The mode's text for the player: the bullet as written, with `~` replaced by the card's name. */
function textOf(text: string, ctx: LowerContext): string {
  return ctx.cardName === '' ? text : text.split('~').join(ctx.cardName);
}

/**
 * Lowers the modes of a modal text. `ctx` is the context of the spell or ability: what it already
 * knows (`selfGone`, `itIsSelf`, `thatPlayer`) is shared by every mode, while targets, the removed
 * objects and X are tracked per mode (the mode's own context), and X is reported in `usesX`.
 */
export function lowerModes(modal: IrModes, ctx: LowerContext): LowerResult<LoweredModes> {
  const count = modal.modes.length;
  const { choose } = modal;
  if (count < MIN_MODES || count > MAX_MODES) return refuse(modal);
  // "One or both" and "may choose both instead" are about two modes (CR 700.2).
  if (choose.exactly !== undefined && choose.exactly !== count) return refuse(modal);
  const max = choose.max === 'all' ? count : choose.max;
  // CR 700.2d (D-1000): a repeatable choice may be for more modes than there are, and "up to" has a minimum of 0.
  const repeatable = choose.repeatable === true;
  if (choose.min < (repeatable ? 0 : 1) || choose.min > max || (!repeatable && max > count)) {
    return refuse(modal);
  }
  // "You may choose two instead" (D-297): the widened maximum is more than the usual one and no more than the number of modes.
  const widened = choose.widenTo ?? count;
  if (choose.widenTo !== undefined && (widened <= max || widened > count)) return refuse(modal);
  const blocked = missingFeatures(MODAL_NEEDS);
  if (blocked.length > 0) return refuse(modal, blocked);

  let maxIf: ModeChoice['maxIf'];
  if (choose.widen !== undefined) {
    // "If you control a commander as you cast ~, you may choose both instead": all the modes (two); "you may choose two instead" (D-297): that many.
    const condition = lowerCondition(choose.widen);
    if (!condition.ok) return condition;
    if (count <= max) return refuse(modal);
    maxIf = { condition: condition.value, max: widened };
  }

  const modes: SpellMode[] = [];
  let usesX = false;
  for (const [i, body] of modal.modes.entries()) {
    const mode = newContext(ctx.owner, ctx.faceTypes, ctx.faceSubtypes, ctx.cardName);
    mode.text = ctx.text;
    mode.selfGone = ctx.selfGone;
    mode.itIsSelf = ctx.itIsSelf;
    mode.selfCast = ctx.selfCast;
    mode.thatPlayer = ctx.thatPlayer;
    const lowered = lowerSentences(body.sentences, mode);
    if (!lowered.ok) return lowered;
    const [only] = lowered.value;
    if (only === undefined) return refuse(modal);
    const effect: Effect =
      lowered.value.length === 1 ? only : { kind: 'sequence', effects: [...lowered.value] };
    usesX = usesX || mode.usesX;
    modes.push({
      text: textOf(modal.texts[i] ?? '', ctx),
      ...(mode.targets.length > 0 ? { targets: [...mode.targets] } : {}),
      effect,
    });
  }
  const chooseModes: ModeChoice = {
    min: choose.min,
    max,
    ...(maxIf === undefined ? {} : { maxIf }),
    // "Choose one that hasn't been chosen this turn" (stage P34, D-152): only a triggered ability may say it (`validateCard`).
    ...(choose.notRepeatedThisTurn === true ? { notRepeatedThisTurn: true as const } : {}),
    // "You may choose the same mode more than once" (D-1000, CR 700.2d): the modes chosen are a multiset.
    ...(repeatable ? { repeatable: true as const } : {}),
  };
  return { ok: true, value: { modes, chooseModes, usesX }, rule: modal.rule };
}

/** The empty `effect` of a modal triggered or activated ability (D-114): its effects are in the modes. */
export const NO_EFFECT: Effect = { kind: 'sequence', effects: [] };
