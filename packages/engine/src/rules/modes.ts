/**
 * Modal spells and abilities (CR 700.2, D-114): "Choose one —", "Choose two —", "Choose one or both —",
 * "Choose one or more —". The controller chooses the modes as the spell is cast (CR 601.2b, 700.2a), the
 * ability is activated (CR 602.2b) or the triggered ability is put on the stack (CR 603.3c, 700.2b). A mode
 * that would be illegal (its targets cannot all be chosen) cannot be chosen (CR 700.2a), and no mode is
 * chosen more than once (CR 700.2d: "You may choose the same mode more than once" is not built). The
 * targets of a chosen mode are chosen with the rest (CR 601.2c, 700.2c: a mode that was not chosen has no
 * targets), and the effects of the chosen modes run in the order they are printed (CR 608.2c).
 *
 * This file holds the questions the three paths share: which modes the text has, how many may be chosen,
 * which sets are legal, and what the chosen set means for targets and effects.
 */
import type { Effect, ModeChoice, SpellMode, SpellText, TargetSpec } from '../ast/types';
import type { ObjectId } from '../ids';
import type { ChooseModesDecision, NewDecision } from '../state/decisions';
import type { GameObject, GameState, StackAbility } from '../state/types';
import { evaluateCondition } from './conditions';
import { legalTargets, type SelectContext, targetBounds } from './select';
import { sourceInfo } from './source-info';

/** The modes of a modal spell or ability and how many to choose. */
export interface ModalText {
  readonly modes: readonly SpellMode[];
  readonly choose: ModeChoice;
}

/** The modes `source` chose this turn plus these (D-151): what "that hasn't been chosen this turn" reads. */
export function withModesChosen(
  state: GameState,
  source: ObjectId,
  modes: readonly number[],
): GameState {
  if (modes.length === 0) return state;
  return {
    ...state,
    turnLog: {
      ...state.turnLog,
      modesChosen: [...state.turnLog.modesChosen, ...modes.map((mode) => ({ source, mode }))],
    },
  };
}

/** The modal text of a spell's face, or null when the spell is not modal. */
export function modalOfSpellText(spell: SpellText | null | undefined): ModalText | null {
  if (spell?.modes === undefined || spell.chooseModes === undefined) return null;
  return { modes: spell.modes, choose: spell.chooseModes };
}

/** The modal text of an activated or triggered ability, or null when it is not modal. */
export function modalOfAbility(ability: StackAbility | null | undefined): ModalText | null {
  if (ability?.modes === undefined || ability.chooseModes === undefined) return null;
  return { modes: ability.modes, choose: ability.chooseModes };
}

/**
 * How many modes may be chosen at most: the ordinary maximum, or the larger one while the `maxIf`
 * condition holds for the controller ("If you control a commander as you cast ~, you may choose both
 * instead"), read now with the spell or ability as the source.
 */
export function modeLimit(state: GameState, modal: ModalText, ctx: SelectContext): number {
  const { max, maxIf } = modal.choose;
  if (maxIf !== undefined && maxIf.max > max && evaluateCondition(state, maxIf.condition, ctx)) {
    return Math.min(maxIf.max, modal.modes.length);
  }
  return max;
}

/** Every slot of the mode could be filled with at least its minimum number of legal targets (CR 700.2a). */
function modePossible(state: GameState, mode: SpellMode, ctx: SelectContext): boolean {
  return (mode.targets ?? []).every(
    (spec) => legalTargets(state, spec, ctx).length >= targetBounds(spec).min,
  );
}

/**
 * Every legal choice of modes (CR 700.2, 700.2a, 700.2d): sets of distinct modes, each in printed order,
 * between `min` and the limit of them, built only of modes whose targets can be chosen. Fewest modes first,
 * then in printed order, so "choose one" lists the modes one by one.
 */
export function legalModeSets(
  state: GameState,
  modal: ModalText,
  ctx: SelectContext,
): readonly (readonly number[])[] {
  // D-151: "choose one that hasn't been chosen this turn": the modes this source chose earlier this turn are out.
  const used =
    modal.choose.notRepeatedThisTurn === true && ctx.source !== null
      ? state.turnLog.modesChosen.filter((m) => m.source === ctx.source).map((m) => m.mode)
      : [];
  const available = modal.modes.flatMap((mode, i) =>
    !used.includes(i) && modePossible(state, mode, ctx) ? [i] : [],
  );
  const max = Math.min(modeLimit(state, modal, ctx), available.length);
  const out: number[][] = [];
  const build = (from: number, picked: number[], size: number): void => {
    if (picked.length === size) {
      out.push([...picked]);
      return;
    }
    for (let k = from; k < available.length; k += 1) {
      picked.push(available[k] as number);
      build(k + 1, picked, size);
      picked.pop();
    }
  };
  for (let size = modal.choose.min; size <= max; size += 1) build(0, [], size);
  return out;
}

/** Whether `chosen` is one of the legal sets, in any order (the answer to the question). */
export function isLegalModeSet(
  sets: readonly (readonly number[])[],
  chosen: readonly number[],
): boolean {
  const sorted = [...chosen].sort((a, b) => a - b);
  return (
    new Set(chosen).size === chosen.length &&
    sets.some((s) => s.length === sorted.length && s.every((m, i) => m === sorted[i]))
  );
}

/** The chosen modes in printed order (CR 608.2c: they run in the order printed). */
export function printedOrder(chosen: readonly number[]): number[] {
  return [...chosen].sort((a, b) => a - b);
}

/** The target slots of the chosen modes, with the mode each belongs to, in printed order (CR 601.2c). */
export function chosenModeSpecs(
  modal: ModalText,
  chosen: readonly number[],
): { readonly spec: TargetSpec; readonly mode: number }[] {
  return printedOrder(chosen).flatMap((mode) =>
    (modal.modes[mode]?.targets ?? []).map((spec) => ({ spec, mode })),
  );
}

/** The modal text of a spell or ability object, or null: a card face's spell text, or the ability on the stack. */
export function modalOfObject(
  obj: GameObject,
  spell: SpellText | null | undefined,
): ModalText | null {
  const ability = obj.stack?.ability;
  if (ability) return modalOfAbility(ability);
  return modalOfSpellText(spell);
}

/** The effect of the chosen modes, run in printed order as one sequence (CR 608.2c, 700.2). */
export function chosenEffect(modal: ModalText, chosen: readonly number[]): Effect {
  return {
    kind: 'sequence',
    effects: printedOrder(chosen).flatMap((i) => {
      const mode = modal.modes[i];
      return mode === undefined ? [] : [mode.effect];
    }),
  };
}

/** The slot-to-mode map of a chosen set, for the `mode` of each `TargetChoiceSpec`. */
export function specModes(
  modal: ModalText,
  chosen: readonly number[],
): ReadonlyMap<string, number> {
  return new Map(chosenModeSpecs(modal, chosen).map(({ spec, mode }) => [spec.id, mode] as const));
}

/**
 * The `chooseModes` decision for `source` on the stack (a spell being cast, an ability being activated or a
 * triggered ability being put on the stack): every mode with whether it is legal, the bounds and the legal sets.
 * `named` is the object whose name and text the dialog shows: the spell itself, or the permanent an ability
 * belongs to.
 */
export function modesDecision(
  state: GameState,
  seat: ChooseModesDecision['seat'],
  source: ObjectId,
  named: ObjectId,
  purpose: ChooseModesDecision['purpose'],
  modal: ModalText,
  sets: readonly (readonly number[])[],
  ctx: SelectContext,
): NewDecision {
  const info = sourceInfo(state, named);
  return {
    kind: 'chooseModes',
    seat,
    source,
    sourceName: info?.name ?? '',
    sourceOracleText: info?.oracleText ?? '',
    purpose,
    modes: modal.modes.map((mode, index) => ({
      index,
      text: mode.text,
      legal: sets.some((s) => s.includes(index)),
    })),
    min: modal.choose.min,
    max: modeLimit(state, modal, ctx),
    sets,
    ...(purpose === 'trigger' ? { forTrigger: true as const } : {}),
  };
}
