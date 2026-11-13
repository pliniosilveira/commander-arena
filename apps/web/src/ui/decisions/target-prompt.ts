/**
 * The prompt line of the targets decision (CR 601.2c). Most casts and abilities read "Choose a
 * target for X."; an Aura spell (its `enchant` slot, CR 303.4a) and Equip (CR 702.6a) say what the
 * player is choosing in their own words. Kept out of `model.ts`, which is large already.
 */
import type { TargetChoiceSpec, TargetsDecision } from '@commander-arena/engine';
import { isEquip, triggerCondition, triggerGist } from './ability-label';
import { type Index, nameOf, stackName } from './lookup';
import { modeText } from './modes-picker';
import { modeTime, type SlotStatus } from './targeting';

const WORDS: readonly string[] = ['zero', 'one', 'two', 'three', 'four', 'five'];

/** The slot id the engine gives an Aura spell's host (rules/legality.ts, `targetSpecsOf`). */
export const ENCHANT_SPEC = 'enchant';

/** True when the ability on the stack is an Equipment's Equip ability (the host has one). */
function isEquipActivation(decision: TargetsDecision, index: Index): boolean {
  const source = index.get(decision.source)?.abilitySource;
  const host = source === undefined ? undefined : index.get(source);
  return host?.activated?.some((a) => isEquip(a.ability)) === true;
}

/**
 * A triggered ability being put on the stack (CR 603.3d): "Choose a target for Pyre Hound's
 * ability: Destroy target creature." The ability is on the stack already, so its view names it
 * (and the Saga chapter) and carries the AST the gist is read from.
 */
function triggerPrompt(decision: TargetsDecision, index: Index, slot: SlotStatus): string {
  const obj = index.get(decision.source);
  const ability = obj?.ability;
  const host = obj?.abilitySource === undefined ? undefined : index.get(obj.abilitySource);
  const gist = ability === undefined ? '' : triggerGist(ability, host);
  // "(whenever you draw a card)": what set the ability off, when the words know it (D-111).
  const when = triggerCondition(ability, host?.name ?? obj?.name ?? '', host ?? obj, true);
  const head = `Choose ${targetsWord(slot.spec)} for ${stackName(index, decision.source)}${when === null ? '' : ` (${when})`}`;
  return gist === '' ? `${head}.` : `${head}: ${gist}.`;
}

/**
 * "a target", "targets", "up to one target for each opponent": what a slot asks for (D-149, `TargetChoiceSpec.onePerGroup`: at most one
 * target for each player who controls the permanents; `min` 0 is "up to").
 */
export function targetsWord(spec: TargetChoiceSpec): string {
  if (spec.onePerGroup === true) {
    return `${spec.min === 0 ? 'up to one target' : 'one target'} for each opponent`;
  }
  // D-151 (CR 115.3): "each of up to two other targets": the slot that has to differ from an earlier one says "other".
  if (spec.differentFrom !== undefined) {
    if (spec.max === 1) return spec.min === 0 ? 'up to one other target' : 'another target';
    const most = WORDS[spec.max] ?? String(spec.max);
    return spec.min === 0 ? `up to ${most} other targets` : `${most} other targets`;
  }
  return spec.max === 1 ? 'a target' : 'targets';
}

/** "Mode 2" for a slot of a modal spell or ability; with several slots in one mode, "Mode 2, target 2"; the second time a mode is chosen, "Mode 2, time 2". */
export function slotLabel(specs: readonly TargetChoiceSpec[], at: number): string {
  const spec = specs[at];
  if (spec?.mode === undefined) return `Slot ${at + 1}`;
  const time = modeTime(specs, spec);
  const same = specs.filter(
    (s) => s.mode === spec.mode && (s.instance ?? 0) === (spec.instance ?? 0),
  );
  const head = `Mode ${spec.mode + 1}${time === null ? '' : `, time ${time}`}`;
  return same.length > 1 ? `${head}, target ${same.indexOf(spec) + 1}` : head;
}

/**
 * The heading of a mode in the target prompt and the dock: "Mode 2: Destroy target artifact". The
 * text is the mode's as the stack object carries it (`ObjectView.modeTexts`); when the object is not
 * in the view the heading is the number alone.
 */
export function modeHeading(
  index: Index,
  source: TargetsDecision['source'],
  mode: number,
  /** Which time the mode is chosen (D-344): "Mode 3, time 2: Destroy target artifact"; null for a mode chosen once. */
  time: number | null = null,
): string {
  const text = index.get(source)?.modeTexts?.[mode];
  const head = `Mode ${mode + 1}${time === null ? '' : `, time ${time}`}`;
  return text === undefined ? head : `${head}: ${modeText(text)}`;
}

export function targetsPrompt(
  decision: TargetsDecision,
  index: Index,
  slot: SlotStatus | null,
): string {
  const source = nameOf(index, decision.source);
  // CR 707.10c (D-129): the controller of a copy may choose new targets for it; there is nothing to cancel.
  if (decision.forCopy === true) {
    // D-149 (CR 707.10, 115.7f): a copy of a divided spell keeps the division: new targets only.
    return decision.specs.some((s) => s.keepsDivision === true)
      ? `Choose new targets for the copy of ${source}. The division stays the same.`
      : `Choose new targets for the copy of ${source}.`;
  }
  // CR 115.7a (D-181): the new target of a spell or ability a resolving effect changes the target of; there is nothing to cancel.
  if (decision.forChange === true) {
    const subject = decision.subject === undefined ? 'it' : stackName(index, decision.subject);
    return `Choose a new target for ${subject}.`;
  }
  if (slot === null) {
    return `Targets chosen for ${decision.forTrigger === true ? stackName(index, decision.source) : source}.`;
  }
  // A modal spell or ability: the slot's mode comes first, "Mode 2: Destroy target artifact. Choose a
  // target for X." (CR 601.2c, 700.2c).
  if (slot.spec.mode !== undefined) {
    const head = modeHeading(
      index,
      decision.source,
      slot.spec.mode,
      modeTime(decision.specs, slot.spec),
    );
    const choose = `Choose ${targetsWord(slot.spec)} for ${
      decision.forTrigger === true ? stackName(index, decision.source) : source
    }.`;
    return `${head}. ${choose}`;
  }
  if (decision.forTrigger === true) return triggerPrompt(decision, index, slot);
  if (slot.spec.specId === ENCHANT_SPEC) return 'Choose what to enchant.';
  if (isEquipActivation(decision, index)) return 'Choose a creature you control to equip.';
  // D-145 (CR 601.2d): the targets and the division are announced together.
  if (slot.spec.divide !== undefined) {
    return `Choose targets for ${source}, then divide ${slot.spec.divide} damage among them.`;
  }
  return `Choose ${targetsWord(slot.spec)} for ${source}.`;
}
