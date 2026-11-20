/**
 * "The next instant or sorcery spell you cast this turn costs {X} less to cast" and "... has storm" (`nextSpellModifier`, issue 121: Kaza, Roil Chaser, Crackling Spellslinger,
 * Smoldering Stagecoach; CR 601.2f, 118.7a, 702.40a, 702.85a, 611.2a). The effect makes a `nextSpell` continuous effect that lasts until end of turn. The first spell its `seat` casts that
 * its `spells` filter describes is changed by it: the cost is reduced where it is determined (`reductionFor` in `rules/cast-cost.ts`) and, as the cast is completed (`finishCast`), the
 * effect is used up and the keyword it grants is given to the spell, before the triggers of the cast are found (CR 603.3b: Storm and Cascade trigger from the spell on the stack).
 */
import type { Effect } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import { allocateTimestamp } from '../state/ops';
import type { ContinuousEffect, GameObject, GameState, ResolutionContext } from '../state/types';
import { amountOf } from './amounts';
import { matchesFilter, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

type NextSpellEffect = ContinuousEffect & {
  readonly change: Extract<ContinuousEffect['change'], { kind: 'nextSpell' }>;
};

function isNextSpell(e: ContinuousEffect): e is NextSpellEffect {
  return e.change.kind === 'nextSpell';
}

/** `nextSpellModifier`: the controller's next spell that matches is changed. The amount is read now, as the effect resolves (CR 608.2c). */
export function runNextSpellModifier(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'nextSpellModifier' }>,
  ctx: SelectContext,
): StepOutcome {
  const less =
    effect.lessGeneric === undefined
      ? 0
      : Math.max(0, amountOf(state, effect.lessGeneric, ctx, []));
  const [timestamp, stamped] = allocateTimestamp(state);
  const created: ContinuousEffect = {
    id: `ce${timestamp}`,
    timestamp,
    objects: [],
    until: 'endOfTurn',
    change: {
      kind: 'nextSpell',
      seat: res.controller,
      spells: effect.spells,
      lessGeneric: less,
      ...(effect.grants === undefined ? {} : { grants: effect.grants }),
    },
  };
  return done({ ...stamped, continuousEffects: [...stamped.continuousEffects, created] });
}

/** The `nextSpell` effects of `seat` that apply to `spell` (a spell being cast: it is matched as on the stack, CR 601.2a). */
function appliesTo(state: GameState, seat: SeatId, spell: GameObject): NextSpellEffect[] {
  const ctx: SelectContext = { controller: seat, source: spell.id };
  return state.continuousEffects
    .filter(isNextSpell)
    .filter(
      (e) =>
        e.change.seat === seat &&
        matchesFilter(state, spell, { ...e.change.spells, zone: 'stack' }, ctx),
    );
}

/** CR 601.2f, 118.7a: how much generic mana the spell's cost goes down by, from the effects of `seat` that name it. */
export function nextSpellReduction(state: GameState, seat: SeatId, spell: GameObject): number {
  return appliesTo(state, seat, spell).reduce((n, e) => n + e.change.lessGeneric, 0);
}

/**
 * CR 601.2i, 702.40a, 702.85a: the spell `spellId` is cast. Each effect that names it is used up and the keywords they grant are given to the spell until end of turn (a layer 6 grant,
 * CR 613.1f), so Storm and Cascade, which work from the stack, trigger as it was cast.
 */
export function applyNextSpellEffects(
  state: GameState,
  seat: SeatId,
  spellId: ObjectId,
): GameState {
  const spell = state.objects[spellId];
  if (spell === undefined) return state;
  const used = appliesTo(state, seat, spell);
  if (used.length === 0) return state;
  let next = state;
  const granted: ContinuousEffect[] = [];
  for (const e of used) {
    if (e.change.grants === undefined) continue;
    const [timestamp, stamped] = allocateTimestamp(next);
    next = stamped;
    granted.push({
      id: `ce${timestamp}`,
      timestamp,
      objects: [spellId],
      until: 'endOfTurn',
      change: { kind: 'grantKeyword', keyword: { kind: e.change.grants } },
    });
  }
  const gone = new Set(used.map((e) => e.id));
  return {
    ...next,
    continuousEffects: [...next.continuousEffects.filter((e) => !gone.has(e.id)), ...granted],
  };
}
