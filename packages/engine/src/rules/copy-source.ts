/**
 * What copying a spell starts from (CR 707.10, D-129): the spell to copy and the instruction that copies it. Apart from
 * `rules/copy-spell.ts` so that the interpreter (`rules/effects.ts`) can make the instruction without importing the
 * legality code that file needs (the interpreter cannot import the mana engine, which runs effects).
 */
import type { Ability } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameObject, GameState, Instruction } from '../state/types';
import { objectOrLki } from './source-info';

export type CopySpellInstruction = Extract<Instruction, { kind: 'copySpell' }>;

/**
 * Whether `obj` is a spell (a card's or a copy of one) or an activated ability (CR 707.10: "copy that spell or ability", Unbound Flourishing) that can be copied. An ability of the
 * monarch or the Ring has no source and no text of a card, and is copied like any other.
 */
function isSpell(obj: GameObject | null): obj is GameObject {
  return obj !== null && obj.zone === 'stack' && obj.stack !== null;
}

/**
 * The spell or ability to copy: the object on the stack, or what it last was when it has left (CR 113.7a, 707.10). Null when it is
 * neither.
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
  /** D-665: the player the copies belong to, when it is not the controller of the effect ("That player copies the spell", Demonstrate). */
  controller?: SeatId,
  /** Nalfeshnee: what the permanent a copy becomes has. */
  gains?: readonly Ability[],
): CopySpellInstruction[] {
  return count > 0
    ? [
        {
          kind: 'copySpell',
          spell,
          count,
          newTargets,
          stage: 'make',
          copy: null,
          ...(controller === undefined ? {} : { controller }),
          ...(gains === undefined ? {} : { gains }),
        },
      ]
    : [];
}
