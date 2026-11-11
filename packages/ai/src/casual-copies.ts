/**
 * CasualAgent and copies of spells (D-129): the spells that copy a spell, the copies a trigger or Storm makes, and Storm
 * itself (CR 702.40a).
 *
 * - A spell or ability that says "Copy target instant or sorcery spell" is worth casting only when the object on top of
 *   the stack is a spell of the agent's own: a copy of the opponent's burn that has no new targets would burn the
 *   agent too, and copying a spell of one's own (burn, a draw, a pump) is a gain. It targets that spell, the topmost
 *   of its own.
 * - The question "choose new targets for the copy" is the ordinary question of a spell being cast (the copy's
 *   rules text is the original's, so a hostile spell goes on the opponent's best thing and a helpful one on the agent's
 *   best creature, `casual-choices.ts`); nothing else is needed for it.
 * - A Storm spell is cast late in the turn: it copies itself once for each spell cast before it, by every player, so
 *   every other spell worth casting is cast first, and the Storm spell goes when nothing else is left. (A turn
 *   in which the other spells use up the mana leaves the Storm spell for a later turn: `docs/ROADMAP.md`.)
 * The view carries rules text, so what a spell does is read from it, like everywhere in the heuristics.
 */
import type { Action, GameView, ObjectView, TargetsDecision } from '@commander-arena/engine';
import { findObject } from './casual-view';

/** "Copy target instant or sorcery spell." / "Copy target spell you control." */
const COPIES_SPELL = /\bcopy target (\w+ or \w+ |\w+ )?spells?\b/i;

/** Whether the rules text copies a target spell. */
export const copiesTargetSpell = (text: string): boolean => COPIES_SPELL.test(text);

/** A spell (not an ability) on the stack the agent controls. */
const isOwnSpell = (view: GameView, o: ObjectView): boolean =>
  o.controller === view.viewer && o.ability === undefined && o.abilitySource === undefined;

/**
 * Whether a spell that copies a target spell is worth casting: the object on top of the stack is a spell of the
 * agent's own that can be copied (an instant or sorcery).
 */
export function copyWorthCasting(view: GameView): boolean {
  const top = view.stack[view.stack.length - 1];
  return (
    top !== undefined &&
    isOwnSpell(view, top) &&
    (top.types.includes('instant') || top.types.includes('sorcery'))
  );
}

/**
 * The target of a spell that copies a spell: the topmost spell of the agent's own that the engine lists, else (the
 * cast cannot be taken back) the first it lists. Null when the decision is not for such a spell.
 */
export function chooseSpellToCopy(view: GameView, d: TargetsDecision): Action | null {
  if (d.forCopy === true || d.forTrigger === true) return null;
  const source = findObject(view, d.source);
  if (source === undefined || !copiesTargetSpell(source.oracleText)) return null;
  const [slot] = d.specs;
  if (slot === undefined) return null;
  const own = [...view.stack].reverse().filter((o) => isOwnSpell(view, o));
  for (const o of own) {
    const found = slot.legal.find((t) => t.kind === 'object' && t.id === o.id);
    if (found !== undefined) return { kind: 'chooseTargets', targets: [found] };
  }
  const first = slot.legal[0];
  return { kind: 'chooseTargets', targets: first === undefined ? [] : [first] };
}

/** Whether the object is a spell with Storm (CR 702.40a). */
export const hasStorm = (o: ObjectView): boolean => o.keywords.includes('storm');
