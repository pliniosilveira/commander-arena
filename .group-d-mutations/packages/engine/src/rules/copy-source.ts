/**
 * What copying a spell starts from (CR 707.10, D-129): the spell to copy and the instruction that copies it. Apart from
 * `rules/copy-spell.ts` so that the interpreter (`rules/effects.ts`) can make the instruction without importing the
 * legality code that file needs (the interpreter cannot import the mana engine, which runs effects).
 */
import type { ObjectId } from '../ids';
import type { GameObject, GameState, Instruction } from '../state/types';
import { objectOrLki } from './source-info';

export type CopySpellInstruction = Extract<Instruction, { kind: 'copySpell' }>;

/** Whether `obj` is a spell (a card's or a copy of one) that can be copied. */
function isSpell(obj: GameObject | null): obj is GameObject {
  return obj !== null && obj.zone === 'stack' && obj.stack?.kind === 'spell';
}

/**
 * The spell to copy: the object on the stack, or what it last was when it has left (CR 113.7a, 707.10). Null when it is
 * not a spell.
 */
export function copiedSpell(state: GameState, id: ObjectId): GameObject | null {
  const found = objectOrLki(state, id);
  return isSpell(found) ? found : null;
}

/** The instructions that copy `spell` `count` times (nothing for a count of 0 or less). */
export function copyInstructions(
  spell: ObjectId,
  count: number,
  newTargets: 'may' | 'no',
): CopySpellInstruction[] {
  return count > 0
    ? [{ kind: 'copySpell', spell, count, newTargets, stage: 'make', copy: null }]
    : [];
}
