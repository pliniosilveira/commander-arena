/**
 * Modal spells and abilities (CR 700.2, D-114): "Choose one —", "Choose two —", "Choose one or both —",
 * "Choose one or more —". The controller chooses the modes as the spell is cast (CR 601.2b, 700.2a), the
 * ability is activated (CR 602.2b) or the triggered ability is put on the stack (CR 603.3c, 700.2b). A mode
 * that would be illegal (its targets cannot all be chosen) cannot be chosen (CR 700.2a), and no mode is
 * chosen more than once (CR 700.2d) unless the text says "You may choose the same mode more than once"
 * (`ModeChoice.repeatable`, D-344): then the modes chosen are a multiset, and each instance of a mode is
 * treated as if the mode appeared that many times in sequence, with a target slot of its own (the same
 * target may be chosen for each, or different ones). The targets of a chosen mode are chosen with the rest
 * (CR 601.2c, 700.2c: a mode that was not chosen has no targets), and the effects of the chosen modes run in
 * the order they are printed (CR 608.2c), the instances of a mode one after the other.
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
  // D-344: a repeatable choice has no widening, and its `max` may be more than the number of modes.
  if (modal.choose.repeatable === true) return max;
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
 * then in printed order, so "choose one" lists the modes one by one. A `repeatable` choice (D-344) lists
 * multisets instead: the same mode may appear more than once, so every size from `min` to `max` is listed
 * even when it is more than the number of modes that can be chosen.
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
  const repeatable = modal.choose.repeatable === true;
  // With no mode to choose a repeatable choice can only be empty ("up to"); otherwise every size up to `max` is possible.
  const max = repeatable
    ? available.length === 0
      ? 0
      : modeLimit(state, modal, ctx)
    : Math.min(modeLimit(state, modal, ctx), available.length);
  const out: number[][] = [];
  const build = (from: number, picked: number[], size: number): void => {
    if (picked.length === size) {
      out.push([...picked]);
      return;
    }
    for (let k = from; k < available.length; k += 1) {
      picked.push(available[k] as number);
      // CR 700.2d: a repeatable choice may take the same mode again; any other takes only later modes.
      build(repeatable ? k : k + 1, picked, size);
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
  // The legal sets say whether a mode may be chosen twice: only a repeatable choice lists a set with a repeat (CR 700.2d).
  return sets.some((s) => s.length === sorted.length && s.every((m, i) => m === sorted[i]));
}

/** The chosen modes in printed order (CR 608.2c: they run in the order printed). */
export function printedOrder(chosen: readonly number[]): number[] {
  return [...chosen].sort((a, b) => a - b);
}

/**
 * The id of the target slot `id` for the `occurrence`th time (0 is the first) its mode is chosen (CR 700.2d, D-344): the first
 * instance keeps the slot's own id, so a mode chosen once is exactly what it was; the later ones are `<id>#2`, `<id>#3`, ...
 */
export function instanceId(id: string, occurrence: number): string {
  return occurrence === 0 ? id : `${id}#${occurrence + 1}`;
}

/** The id the slot `id` has in the text of the mode: `<id>#2` is the slot `<id>` of the second instance (D-344). */
export function baseSpecId(id: string): string {
  return id.replace(/#\d+$/, '');
}

/** Every instance of the chosen modes in printed order, with how many times its mode came before it (CR 608.2c, 700.2d). */
export function modeInstances(
  chosen: readonly number[],
): readonly { readonly mode: number; readonly occurrence: number }[] {
  const seen = new Map<number, number>();
  return printedOrder(chosen).map((mode) => {
    const occurrence = seen.get(mode) ?? 0;
    seen.set(mode, occurrence + 1);
    return { mode, occurrence };
  });
}

/** A target slot of one instance of a mode: its own id, and `differentFrom` read within the same instance. */
function instanceSpec(mode: SpellMode, spec: TargetSpec, occurrence: number): TargetSpec {
  if (occurrence === 0) return spec;
  const sameMode = new Set((mode.targets ?? []).map((t) => t.id));
  return {
    ...spec,
    id: instanceId(spec.id, occurrence),
    ...(spec.differentFrom !== undefined && sameMode.has(spec.differentFrom)
      ? { differentFrom: instanceId(spec.differentFrom, occurrence) }
      : {}),
  };
}

/**
 * The target slots of the chosen modes, with the mode each belongs to and which instance of it (0 the first), in
 * printed order (CR 601.2c). Every instance of a mode has slots of its own (CR 700.2d, D-344).
 */
export function chosenModeSpecs(
  modal: ModalText,
  chosen: readonly number[],
): { readonly spec: TargetSpec; readonly mode: number; readonly occurrence: number }[] {
  return modeInstances(chosen).flatMap(({ mode, occurrence }) => {
    const text = modal.modes[mode];
    return (text?.targets ?? []).map((spec) => ({
      spec: text === undefined ? spec : instanceSpec(text, spec, occurrence),
      mode,
      occurrence,
    }));
  });
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

/**
 * The effect of one instance of a mode: the mode's own effect for the first, and for a later one the same effect reading the
 * slots of that instance (the `target` ids renamed, D-344).
 */
function instanceEffect(mode: SpellMode, occurrence: number): Effect {
  if (occurrence === 0) return mode.effect;
  const ids = new Set((mode.targets ?? []).map((t) => t.id));
  const rename = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(rename);
    if (typeof node !== 'object' || node === null) return node;
    const record = node as Record<string, unknown>;
    if (record.kind === 'target' && typeof record.id === 'string' && ids.has(record.id)) {
      return { ...record, id: instanceId(record.id, occurrence) };
    }
    return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, rename(v)]));
  };
  return rename(mode.effect) as Effect;
}

/**
 * The effect of the chosen modes, run in printed order as one sequence (CR 608.2c, 700.2): a mode chosen more than once is
 * treated as if it appeared that many times in sequence (CR 700.2d, D-344), each time reading the targets of its own instance.
 */
export function chosenEffect(modal: ModalText, chosen: readonly number[]): Effect {
  return {
    kind: 'sequence',
    effects: modeInstances(chosen).flatMap(({ mode, occurrence }) => {
      const text = modal.modes[mode];
      return text === undefined ? [] : [instanceEffect(text, occurrence)];
    }),
  };
}

/** Where a target slot of a chosen mode comes from: the mode, and which instance of it (D-344, 0 the first). */
export interface SlotMode {
  readonly mode: number;
  readonly instance: number;
}

/** The slot-to-mode map of a chosen set, for the `mode` and `instance` of each `TargetChoiceSpec`. */
export function specModes(
  modal: ModalText,
  chosen: readonly number[],
): ReadonlyMap<string, SlotMode> {
  return new Map(
    chosenModeSpecs(modal, chosen).map(
      ({ spec, mode, occurrence }) => [spec.id, { mode, instance: occurrence }] as const,
    ),
  );
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
    ...(modal.choose.repeatable === true ? { repeatable: true as const } : {}),
    sets,
    ...(purpose === 'trigger' ? { forTrigger: true as const } : {}),
  };
}
