/**
 * Copying a spell (CR 707.10, D-129): the instruction `copySpell`, run for the `copySpell` effect ("Copy target
 * instant or sorcery spell. You may choose new targets for the copy.") and for Storm (CR 702.40a).
 *
 * To copy a spell is to put a copy of it onto the stack; the copy is a spell, not a card (`GameObject.copyOf`), and it is
 * not cast (CR 707.10: nothing that triggers on casting sees it, and it is not counted for Storm). It copies the
 * characteristics of the spell (its face) and every decision made for it: modes, targets, the value of X, whether it was
 * kicked and how many times, and the alternative cost it was cast for (CR 707.10). Choices normally made on resolution
 * are not copied (nothing of them is kept), and a copy is not cast from anywhere, so it has no commander tax, no flashback
 * and is not "free". It is owned and controlled by the player who put it on the stack (CR 707.10).
 *
 * The controller of the copy may choose new targets for it when the effect says so (CR 707.10c): the copy is on the stack
 * with the targets of the original, and they are asked a `targets` decision (`forCopy`) whose answer replaces them. The
 * player may leave any number of the targets unchanged even if they are illegal, and new ones must be legal: the
 * decision's `legal` lists both. Nothing is asked when there is only one answer (a spell with no targets, or none to
 * change them to). The copy ceases to exist if it leaves the stack (CR 707.10a, 704.5e: `rules/zones.ts`), and a copy of a
 * permanent spell that resolves becomes a token (CR 707.10f, 608.3f: the same file).
 *
 *   make     creates the next copy, emits `spellCopied`, and goes on to `targets` or, with nothing to choose, finishes it
 *   targets  asks the targets of the copy (the question is public: it changes nothing until it is answered)
 *
 * (The answer is `rules/copy-spell-answer.ts`: it goes on with the resolution, which this file cannot import.)
 * Both stages are one instruction (`Instruction` `copySpell`) so that a decision can be asked in the middle of a resolution
 * (CR 903.9b, 608.2d) and the resolution go on with the answer.
 */
import type { ObjectId } from '../ids';
import type { TargetsDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import {
  addToZone,
  allocateObjectId,
  allocateTimestamp,
  printedCard,
  setObject,
} from '../state/ops';
import type { GameObject, GameState, ResolutionContext } from '../state/types';
import { becameTargetEvents } from './becomes-target';
import { type CopySpellInstruction, copiedSpell } from './copy-source';
import { faceOf, targetSpecsOf } from './legality';
import { modalOfSpellText, specModes } from './modes';
import { type SelectContext, sameTarget } from './select';
import { done, type StepOutcome } from './step-outcome';
import { targetChoiceSpecs } from './target-choice';

/** Runs one stage of the copy instruction. */
export function runCopySpell(
  state: GameState,
  res: ResolutionContext,
  ins: CopySpellInstruction,
): StepOutcome {
  return ins.stage === 'make' ? makeCopy(state, res, ins) : askTargets(state, res, ins);
}

/** CR 707.10: the copy, a spell on the stack with the original's choices, controlled by `controller`. */
function copyObject(
  original: GameObject,
  id: ObjectId,
  timestamp: number,
  controller: GameObject['controller'],
): GameObject | null {
  const card = printedCard(original);
  const stack = original.stack;
  if (card === null || stack === null) return null;
  return {
    id,
    card: null,
    copyOf: card,
    zone: 'stack',
    zoneOwner: null,
    owner: controller,
    controller,
    face: original.face,
    tapped: false,
    counters: {},
    damage: 0,
    damagedByDeathtouch: false,
    timestamp,
    token: null,
    attachedTo: null,
    protector: null,
    stack: {
      kind: 'spell',
      source: null,
      abilityIndex: null,
      ability: null,
      chosenTargets: stack.chosenTargets,
      x: stack.x,
      chosenModes: stack.chosenModes,
      castFromCommandZone: false,
      kicked: stack.kicked,
      ...(stack.kicks === undefined ? {} : { kicks: stack.kicks }),
      // CR 707.10: the additional costs paid are copied too (the number of times a replicate cost was paid); only casting
      // triggers Replicate, so a copy never copies again.
      ...(stack.replicated === undefined ? {} : { replicated: stack.replicated }),
      // CR 702.174k, 707.10 (D-135): the opponent the gift was promised to is a choice of the spell, copied with it.
      ...(stack.giftTo === undefined ? {} : { giftTo: stack.giftTo }),
      flashback: false,
      // CR 707.10: the alternative cost the spell was cast for is copied (overload changes the text, evoke and dash what
      // the permanent does). Flashback, "free" and the suspend cast are about how it was cast, which a copy is not.
      ...(stack.alt === undefined ? {} : { alt: stack.alt }),
    },
  };
}

function makeCopy(
  state: GameState,
  res: ResolutionContext,
  ins: CopySpellInstruction,
): StepOutcome {
  const original = copiedSpell(state, ins.spell);
  if (ins.count <= 0 || original === null) return done(state);
  const [id, s1] = allocateObjectId(state);
  const [timestamp, s2] = allocateTimestamp(s1);
  const copy = copyObject(original, id, timestamp, res.controller);
  if (copy === null) return done(state);
  const next = addToZone(setObject(s2, copy), 'stack', null, id);
  const events: GameEvent[] = [
    { kind: 'spellCopied', seat: res.controller, original: ins.spell, copy: id },
  ];
  const after = { ...ins, count: ins.count - 1, stage: 'make' as const, copy: null };
  if (ins.newTargets === 'may' && hasChoice(next, res, copy)) {
    // The question comes with the copy already on the stack (CR 707.10c); the next copy is made after the answer.
    return done(next, events, [{ ...ins, stage: 'targets', copy: id }]);
  }
  // The copy keeps the targets of the original (CR 707.10), and it becomes a spell that targets them.
  events.push(...becameTargetEvents(next, id, res.controller));
  return done(next, events, [after]);
}

/** The context the targets of the copy are chosen in: its controller, with the copy as the source (CR 601.2c). */
function copyContext(res: ResolutionContext, copy: GameObject): SelectContext {
  return { controller: res.controller, source: copy.id };
}

/** The slots of the question for `copy`: every legal target, and the targets the copy has now (CR 707.10c). */
function copyDecision(
  state: GameState,
  res: ResolutionContext,
  copy: GameObject,
): Omit<TargetsDecision, 'id'> | null {
  const specs = targetSpecsOf(state, copy);
  if (specs.length === 0) return null;
  const modal = modalOfSpellText(faceOf(state, copy)?.spell);
  const current = copy.stack?.chosenTargets ?? [];
  const slots = targetChoiceSpecs(
    state,
    specs,
    copyContext(res, copy),
    modal === null ? undefined : specModes(modal, copy.stack?.chosenModes ?? []),
    // D-386 (CR 707.10): a copy has the X of the spell it copies, so a slot of "X target ..." keeps its number of targets.
    copy.stack?.x ?? 0,
  ).map((slot) => {
    const legal = [
      ...slot.legal,
      ...current.filter(
        (t) => t.specId === slot.specId && !slot.legal.some((l) => sameTarget(l, t)),
      ),
    ];
    if (slot.divide === undefined) return { ...slot, legal };
    // CR 707.10, 115.7f (D-149): a copy of a spell that divides something keeps the division: the same number of targets, each
    // with the share it has, and no division to announce.
    const kept = current.filter((t) => t.specId === slot.specId).length;
    const { divide: _divide, ...rest } = slot;
    return { ...rest, min: kept, max: kept, keepsDivision: true as const, legal };
  });
  return {
    kind: 'targets',
    seat: res.controller,
    source: copy.id,
    specs: slots,
    forCopy: true,
    current,
  };
}

/** How many ways a slot can be filled: the subsets of its legal targets between its bounds. */
function waysToFill(legal: number, min: number, max: number): number {
  let ways = 0;
  let choose = 1; // C(legal, 0)
  for (let n = 0; n <= Math.min(max, legal); n += 1) {
    if (n >= min) ways += choose;
    choose = (choose * (legal - n)) / (n + 1);
  }
  return ways;
}

/** Whether the controller has anything to choose: more than one answer to the question (CR 707.10c). */
function hasChoice(state: GameState, res: ResolutionContext, copy: GameObject): boolean {
  const decision = copyDecision(state, res, copy);
  if (decision === null) return false;
  return decision.specs.reduce((n, s) => n * waysToFill(s.legal.length, s.min, s.max), 1) > 1;
}

function askTargets(
  state: GameState,
  res: ResolutionContext,
  ins: CopySpellInstruction,
): StepOutcome {
  const copy = ins.copy === null ? undefined : state.objects[ins.copy];
  const decision = copy === undefined ? null : copyDecision(state, res, copy);
  if (decision === null) {
    // Cannot happen: `make` asks only for a copy with slots. The instruction is dropped rather than left pending.
    return done(state);
  }
  return { state, events: [], front: [], needs: decision };
}
