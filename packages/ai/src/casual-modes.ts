/**
 * CasualAgent and modal spells and abilities (D-114, CR 700.2): which modes to choose, whether a modal
 * spell is worth casting, and where the targets of the modes go.
 *
 * The engine offers every legal set of modes (`ChooseModesDecision.sets`: only modes whose targets can be
 * chosen). The view carries the text of each mode, so the agent scores a mode from that text, as it does
 * for X (`casual-x.ts`) and for helpful spells (`casual-helpful.ts`), against the board it can see:
 * - a mode that kills a creature of the opponent's (destroy or exile it, or damage that its toughness does not
 *   survive) or wins the game (life lost or damage that is lethal) is the best; drawing a card is next;
 *   life and a point of damage are small gains;
 * - a mode that needs a thing the board does not have in a worthwhile place (a creature of the opponent's to
 *   destroy, a creature of its own to help) scores below zero: it is avoided, and a set that holds one is
 *   worse than the same set without it.
 * A set is worth the sum of its modes, so the set with the most good modes is chosen when every mode is good
 * and a bad mode is left out when a set without it exists; the first of equal sets (the fewest modes, then
 * printed order) wins, so the answer does not depend on chance.
 */
import {
  type Action,
  baseSpecId,
  type ChooseModesDecision,
  type ChosenTarget,
  type GameView,
  type ObjectView,
  type TargetsDecision,
} from '@commander-arena/engine';
import { chooseSlot, HARM_BY_DEFAULT, planFor, type SlotPlan } from './casual-triggers';
import {
  findObject,
  opponentLife,
  opposingCreatures,
  ownCreatureCount,
  ownLife,
  toughnessOf,
} from './casual-view';

const DESTROY_CREATURE = /\b(destroy|exile) target (\w+ )*?creature/i;
const DAMAGE =
  /(\d+|X) damage to (target creature|any target|target opponent|target player|each opponent)/i;
const LOSE_LIFE = /(each opponent|target opponent|target player) loses (\d+) life/i;
const DRAW = /\bdraw (a|an|one|two|three|\d+|X) cards?/i;
const GAIN_LIFE = /\bgains? (\d+) life/i;
const OTHER_TARGET = /target (artifact|enchantment|planeswalker|battle|permanent|land)/i;
const HELP_OWN =
  /(\+\d+\/\+\d+ counter|gets? \+\d+\/\+\d+|gains? (flying|first strike|haste|hexproof|lifelink|trample|vigilance))/i;

/** The damage it takes to destroy the creature: what it can still take before lethal damage. */
const needed = (o: ObjectView): number => Math.max(1, toughnessOf(o) - o.damage);

/** Whether the text of a spell or ability is modal: "Choose one —" and the bulleted modes that follow. */
export const isModalText = (text: string): boolean =>
  /\bchoose (one|two|three|four|five|six|seven|eight|nine|ten|up to|one or both|one or more)\b/i.test(
    text,
  ) && text.includes('•');

/** The mode lines of a modal text, one for each "•". */
export const modeLines = (text: string): string[] =>
  text
    .split('•')
    .slice(1)
    .map((line) => line.replace(/\s+/g, ' ').trim());

/** What a mode is worth to the agent now: below 0 means avoid it (see the file comment). */
export function modeScore(view: GameView, text: string): number {
  const foes = opposingCreatures(view);
  if (DESTROY_CREATURE.test(text)) return foes.length > 0 ? 9 : -5;
  const damage = DAMAGE.exec(text);
  if (damage !== null) {
    // X is not known when the modes are chosen; three is a fair guess for what it will be.
    const amount = damage[1] === 'X' ? 3 : Number(damage[1]);
    const where = (damage[2] ?? '').toLowerCase();
    const kills = foes.some((f) => needed(f) <= amount);
    const lethal = opponentLife(view) <= amount;
    if (where === 'target creature') return kills ? 8 : foes.length > 0 ? 1 : -5;
    if (where === 'any target') return lethal ? 20 : kills ? 8 : 3;
    return lethal ? 20 : 3;
  }
  const lose = LOSE_LIFE.exec(text);
  if (lose !== null) return opponentLife(view) <= Number(lose[2]) ? 20 : 3;
  if (DRAW.test(text)) {
    const library = view.seats.find((s) => s.id === view.viewer)?.libraryCount ?? 0;
    return library >= 4 ? 6 : 0;
  }
  if (GAIN_LIFE.test(text)) return ownLife(view) <= 15 ? 4 : 2;
  const other = OTHER_TARGET.exec(text);
  if (other !== null) {
    const type = (other[1] ?? '').toLowerCase();
    const there = view.battlefield.some(
      (o) =>
        o.controller !== view.viewer && (type === 'permanent' || o.types.some((t) => t === type)),
    );
    return there ? 6 : -5;
  }
  if (HELP_OWN.test(text)) return ownCreatureCount(view) > 0 ? 3 : -5;
  return 1;
}

/** Whether a modal text has a mode worth choosing now (a spell is cast, an ability activated, only then). */
export function hasWorthwhileMode(view: GameView, text: string, atLeast = 1): boolean {
  return modeLines(text).some((line) => modeScore(view, line) >= atLeast);
}

/** A mode scoring at least this is good: it adds to a set. A mode below it adds nothing, one below 0 subtracts. */
const GOOD_MODE = 2;

/** What a mode adds to the set that holds it: its score when it is good or bad, nothing when it is merely mild. */
const contribution = (score: number): number => (score >= GOOD_MODE || score < 0 ? score : 0);

/**
 * How many times a mode that names a target is worth choosing: the places its target could go (D-1000, CR 700.2d: the same mode more than once
 * has a target for each time, and the same target again destroys nothing more). Read from the same words the score reads. A mode with no
 * target, a damage or a drain that can go to a player each time, and anything not read is worth choosing as often as it is offered.
 */
function worthRepeating(view: GameView, text: string): number {
  if (!/\btarget\b/i.test(text)) return Number.POSITIVE_INFINITY;
  if (DESTROY_CREATURE.test(text)) return opposingCreatures(view).length;
  const damage = DAMAGE.exec(text);
  if (damage !== null) {
    const where = (damage[2] ?? '').toLowerCase();
    return where === 'target creature' ? opposingCreatures(view).length : Number.POSITIVE_INFINITY;
  }
  const other = OTHER_TARGET.exec(text);
  if (other !== null) {
    const type = (other[1] ?? '').toLowerCase();
    return view.battlefield.filter(
      (o) =>
        o.controller !== view.viewer && (type === 'permanent' || o.types.some((t) => t === type)),
    ).length;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * The set of modes with the highest total score; the first of equal ones (fewest modes, then printed order). With a mode chosen more than
 * once (`ChooseModesDecision.repeatable`, D-1000) each time it is chosen scores as much as it has targets to go to, so three "destroy
 * target artifact" are not worth more than the artifacts there are.
 */
export function chooseModesAnswer(view: GameView, d: ChooseModesDecision): Action {
  let best: { modes: readonly number[]; total: number } | undefined;
  const worth = new Map<number, number>();
  for (const modes of d.sets) {
    const seen = new Map<number, number>();
    const total = modes.reduce((sum, i) => {
      const text = d.modes.find((m) => m.index === i)?.text ?? '';
      const nth = (seen.get(i) ?? 0) + 1;
      seen.set(i, nth);
      if (nth > 1) {
        if (!worth.has(i)) worth.set(i, worthRepeating(view, text));
        if (nth > (worth.get(i) ?? 0)) return sum;
      }
      return sum + contribution(modeScore(view, text));
    }, 0);
    if (best === undefined || total > best.total) best = { modes, total };
  }
  return { kind: 'chooseModes', modes: [...(best?.modes ?? d.sets[0] ?? [])] };
}

/** How a mode's text reads for the target it names: helping its target (life, a card, a counter) or harming it. */
function planFromText(text: string): SlotPlan {
  if (GAIN_LIFE.test(text) || DRAW.test(text) || HELP_OWN.test(text)) {
    return { stance: 'help', damage: null, untap: false };
  }
  const damage = DAMAGE.exec(text);
  const amount = damage === null || damage[1] === 'X' ? null : Number(damage[1]);
  return { ...HARM_BY_DEFAULT, damage: amount };
}

/**
 * The targets of the chosen modes of a modal spell or ability, or null when the decision is not for one.
 * Every slot belongs to a mode (`TargetChoiceSpec.mode`) whose text, or for an ability on the stack whose
 * effect, says whether the target is helped (life, a counter) or harmed (damage, destroy), so "target player
 * gains 3 life" goes on the agent and "2 damage to target creature" on the opponent's creature it kills.
 */
export function chooseModalTargets(view: GameView, d: TargetsDecision): ChosenTarget[] | null {
  if (!d.specs.some((s) => s.mode !== undefined)) return null;
  const source = findObject(view, d.source);
  if (source === undefined) return null;
  const effect = source.ability?.modes
    ? ({ kind: 'sequence', effects: source.ability.modes.map((m) => m.effect) } as const)
    : null;
  // D-1000: a mode chosen more than once has a slot for each time (`<id>#2`, ...): its plan is the one of the slot it repeats, and its targets
  // go to other targets than the earlier times' when there are others (the same target again does nothing more).
  const earlier = new Map<string, ChosenTarget[]>();
  return d.specs.flatMap((slot) => {
    const base = baseSpecId(slot.specId);
    const text = slot.mode === undefined ? undefined : source.modeTexts?.[slot.mode];
    const plan =
      (effect === null ? null : planFor(effect, base)) ??
      (text === undefined ? HARM_BY_DEFAULT : planFromText(text));
    const used = earlier.get(base) ?? [];
    const fresh = slot.legal.filter((t) => !used.some((u) => sameChosen(u, t)));
    const open =
      slot.instance !== undefined && fresh.length >= Math.max(1, slot.min)
        ? { ...slot, legal: fresh }
        : slot;
    const picked = chooseSlot(view, open, plan);
    earlier.set(base, [...used, ...picked]);
    return picked;
  });
}

/** The same object or the same player, whatever the slot it was chosen for. */
function sameChosen(a: ChosenTarget, b: ChosenTarget): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === 'object' ? a.id === (b as typeof a).id : a.seat === (b as typeof a).seat;
}
