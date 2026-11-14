/**
 * CasualAgent and spells that help their target: "Target creature gets +3/+3 until end of turn",
 * "Target creature gains flying until end of turn". The target scoring in `casual-choices.ts` favours
 * the opponent's things, which suits burn and removal and would put a pump on the opponent's best
 * creature. The view carries only rules text, so "helps" is read from it, like "hurts" is for Auras
 * (`casual-attachments.ts`): a plus-sign pump or a keyword gain, and none of the words that hurt
 * ("loses", "becomes", "-N", "can't", damage, destroy, exile, return, tap). A text the agent cannot
 * read is treated as hostile, the old behaviour. Turn to Frog ("loses all abilities and becomes a
 * blue Frog with base power and toughness 1/1") reads as hostile and goes on the opponent's creature.
 */
import type { ChosenTarget, GameView, ObjectView, TargetsDecision } from '@commander-arena/engine';
import { findObject, isCreature, powerOf } from './casual-view';

const HELPS = new RegExp(
  [
    String.raw`gets? \+\d+/\+\d+`,
    // D-103: "Put X +1/+1 counters on target creature" (a number of counters stays hostile, as before).
    String.raw`put X \+\d+/\+\d+ counters? on target creature`,
    `gains? (flying|first strike|double strike|deathtouch|haste|hexproof|indestructible|lifelink|menace|reach|shroud|trample|vigilance)`,
    // D-1301: "gains protection from the color of your choice", "gains protection from red".
    String.raw`gains? protection from`,
  ].join('|'),
  'i',
);
const HURTS = /loses |becomes |gets? [+-]\d+\/-|gets? -|can't|damage|destroy|exile|return|\btap/i;

/**
 * Wording that carries a word of HURTS and is not hurting (D-1303, the Feather deck): "Prevent all combat damage that would be dealt to it" protects the creature the
 * spell gave a counter or a keyword, and "becomes red and gains haste" changes a color and gives haste (the color is no harm to the creature).
 */
const NOT_HURTING: readonly RegExp[] = [
  /prevent all combat damage that would be dealt to it/gi,
  /becomes (?:white|blue|black|red|green) and (?=gains haste)/gi,
];

/** Whether the rules text of a spell reads as helping the creature it targets. */
export function helpsItsTarget(oracleText: string): boolean {
  const text = NOT_HURTING.reduce((t, words) => t.replace(words, ''), oracleText);
  return HELPS.test(text) && !HURTS.test(text);
}

/** An instant or sorcery whose text helps its target. */
export const isHelpfulSpell = (o: ObjectView): boolean =>
  (o.types.includes('instant') || o.types.includes('sorcery')) && helpsItsTarget(o.oracleText);

/** The helpful spell this targets decision is for, when it is one. */
export function helpfulSpellBeingCast(view: GameView, d: TargetsDecision): ObjectView | undefined {
  const source = findObject(view, d.source);
  return source !== undefined && isHelpfulSpell(source) ? source : undefined;
}

/**
 * The creature to help: the agent's own with the most power, else the first legal creature, else the
 * first legal target (the cast cannot be undone once it has started).
 */
export function chooseCreatureToHelp(view: GameView, d: TargetsDecision): ChosenTarget[] {
  const [slot] = d.specs;
  if (slot === undefined) return [];
  let best: { target: ChosenTarget; power: number } | undefined;
  for (const target of slot.legal) {
    const o = target.kind === 'object' ? findObject(view, target.id) : undefined;
    if (o === undefined || o.controller !== view.viewer || !isCreature(o)) continue;
    if (best === undefined || powerOf(o) > best.power) best = { target, power: powerOf(o) };
  }
  const chosen = best?.target ?? slot.legal[0];
  return chosen === undefined ? [] : [chosen];
}
