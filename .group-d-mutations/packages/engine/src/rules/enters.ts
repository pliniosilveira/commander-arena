/**
 * Replacement effects of a permanent that modify how it enters the battlefield (CR 614.1c,
 * 614.12): "enters tapped" (possibly "unless ..."), "enters with counters", and the shock land's
 * "As this enters, you may pay 2 life. If you don't, it enters tapped". The zone-change pipeline
 * (zones.ts) and token creation (tokens.ts) both read them here, so they cannot disagree. The choice
 * "As this enters, choose a creature type" (CR 614.12a, D-100) is asked by those two too, before the
 * permanent enters; `entersChoice` says which question a face asks.
 *
 * CR 614.12: the permanent's own replacement effects are applied as it enters, looking at the game
 * as it would be with the permanent not yet on the battlefield. That is how the state is when
 * `moveObject` calls these: the object has left its old zone and is not yet on the battlefield.
 */
import type { Ability, Cost, CountAmount, Replacement } from '../ast/types';
import type { GameState } from '../state/types';
import type { ChoiceKind } from './chosen';
import { type ConditionContext, evaluateCondition } from './conditions';
import { finalChapterOf, hasReadAhead, isSaga, LORE } from './saga';

function replacementsOf(abilities: readonly Ability[]): Replacement[] {
  return abilities.flatMap((a) => (a.kind === 'replacement' ? [a.replacement] : []));
}

/**
 * Whether an "enters tapped" replacement applies: one with no condition always does; one with an
 * `unless` applies when the condition does not hold (CR 614.1c).
 */
export function entersTapped(
  state: GameState,
  abilities: readonly Ability[],
  ctx: ConditionContext,
): boolean {
  return replacementsOf(abilities).some(
    (r) =>
      r.kind === 'entersTapped' &&
      (r.unless === undefined || !evaluateCondition(state, r.unless, ctx)),
  );
}

/** The cost of "you may pay ... if you don't, it enters tapped" on these abilities, if any. */
export function entersPayment(abilities: readonly Ability[]): readonly Cost[] | null {
  for (const r of replacementsOf(abilities)) {
    if (r.kind === 'entersTappedUnlessPays') return r.cost;
  }
  return null;
}

/** The "you may reveal / behold ... If you don't, it enters tapped" of these abilities (D-208), or null. A face has at most one question. */
export function entersReveal(
  abilities: readonly Ability[],
): Extract<Replacement, { kind: 'entersTappedUnlessReveals' }> | null {
  for (const r of replacementsOf(abilities)) {
    if (r.kind === 'entersTappedUnlessReveals') return r;
  }
  return null;
}

/**
 * The question "As this enters, choose a creature type / a color" these abilities ask as the permanent
 * enters (CR 614.12a, D-100), or null. `validateCard` allows one question per face, so the first is it.
 */
export function entersChoice(abilities: readonly Ability[]): ChoiceKind | null {
  for (const r of replacementsOf(abilities)) {
    if (r.kind === 'asEntersChoose') return r.what;
  }
  // CR 702.155b, 714.3b (D-151): a Saga with read ahead chooses a number as it enters, a choice among "1" to its final chapter.
  return hasReadAhead(abilities) ? 'option' : null;
}

/** The ability "As this enters, you may have it become a copy of ..." these abilities have (D-151), or null. A face has at most one. */
export function entersCopyOf(
  abilities: readonly Ability[],
): Extract<Replacement, { kind: 'entersAsCopy' }> | null {
  for (const r of replacementsOf(abilities)) {
    if (r.kind === 'entersAsCopy') return r;
  }
  return null;
}

/** The names "As this enters, choose Khans or Dragons" offers (D-151), or none when the abilities ask no such question. */
export function entersOptions(abilities: readonly Ability[]): readonly string[] {
  for (const r of replacementsOf(abilities)) {
    if (r.kind === 'asEntersChoose' && r.what === 'option') return r.options ?? [];
  }
  // CR 702.155b (D-151): "choose a number between one and this Saga's final chapter number".
  if (hasReadAhead(abilities)) {
    return Array.from({ length: finalChapterOf(abilities) }, (_, i) => String(i + 1));
  }
  return [];
}

/** The life a payment asks for. Only `payLife` costs exist in an `entersTappedUnlessPays`. */
export function lifeOf(cost: readonly Cost[]): number {
  return cost.reduce(
    (n, c) => n + (c.kind === 'payLife' && typeof c.amount === 'number' ? c.amount : 0),
    0,
  );
}

/**
 * The counters the permanent enters with (CR 122.6, 614.1c), added to `base`. `x` is the X of the spell
 * the permanent came from, which "enters with X counters" reads (CR 107.3m); 0 for a permanent that was
 * not cast: put onto the battlefield by an effect, or a token (CR 107.3g). `escaped` says the permanent escaped
 * (CR 702.138b: its spell was cast from a graveyard for its escape cost), which "escapes with" counters need
 * (CR 702.138c, D-124); without it those are not put on it.
 */
export function entersWithCounters(
  abilities: readonly Ability[],
  base: Readonly<Record<string, number>> = {},
  x = 0,
  escaped = false,
  /** Reads a `countOf` as the permanent enters (D-131): "for each Zombie card in your graveyard". */
  counted: (count: CountAmount) => number = () => 0,
  /** The times the spell the permanent came from was kicked (D-254, CR 702.33c): "for each time it was kicked". 0 for a permanent that was not cast. */
  kicks = 0,
): Record<string, number> {
  let counters: Record<string, number> = { ...base };
  for (const r of replacementsOf(abilities)) {
    if (r.kind === 'entersWithCounters') {
      if (r.ifEscaped === true && !escaped) continue;
      const count =
        typeof r.count === 'number'
          ? r.count
          : r.count.kind === 'countOf'
            ? counted(r.count)
            : r.count.kind === 'timesKicked'
              ? kicks
              : x;
      if (count > 0) counters = { ...counters, [r.counter]: (counters[r.counter] ?? 0) + count };
    }
  }
  return counters;
}

/**
 * CR 714.3a: a Saga enters with a lore counter on it, added to `base`. CR 714.3b (D-151): a Saga with read ahead enters with the number of
 * lore counters it chose instead (`abilities` and the `chosen` answer say), added to `base` too.
 */
export function entersAsSaga(
  subtypes: readonly string[],
  base: Readonly<Record<string, number>> = {},
  abilities: readonly Ability[] = [],
  chosen: { readonly option?: string } | null = null,
): Record<string, number> {
  if (!isSaga(subtypes)) return { ...base };
  const picked = hasReadAhead(abilities) ? Number(chosen?.option) : Number.NaN;
  const lore = Number.isInteger(picked) && picked >= 1 ? picked : 1;
  return { ...base, [LORE]: (base[LORE] ?? 0) + lore };
}
