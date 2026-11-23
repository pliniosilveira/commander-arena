/**
 * Evoke that a static ability of a permanent gives to the spells its controller casts from the hand (`grantAlternativeCostToSpells`, CR 702.74a, 118.9, 613.1f, 601.2b): "Elemental
 * permanent spells you cast from your hand gain evoke {4} as you cast them." The grant is read as the spell is cast (the card is in the hand, `castAs` is the spell it would be) and
 * kept on the spell (`StackData.evokeGrant`), so that the permanent it becomes still has the evoke sacrifice trigger after the permanent that gave the cost has left the battlefield
 * (`rules/derive-alt.ts`). A spell cast for it is cast as one with a printed evoke cost is (`CastAlternative` `evoke`).
 */
import type { Cost } from '../ast/types';
import { isPermanentType } from '../characteristics';
import type { SeatId } from '../ids';
import { definitionOf } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { alternativeOf } from './alt-costs';
import { controllerOf } from './control';
import { derive } from './derive';
import { altCostGrantSources } from './derive-statics';
import { matchesFilter } from './select';
import { staticConditionHolds } from './static-conditions';

/** An evoke cost a static ability gives a spell: a mana cost. */
export interface GrantedEvoke {
  readonly kind: 'evoke';
  readonly cost: readonly Cost[];
}

/**
 * The evoke cost a static ability gives `spell` (the stack object, or the card as the spell it would be, `castAs`) when `seat` casts it from `zone`, or null. A spell on the stack has the
 * one it was cast with (`StackData.evokeGrant`) and nothing else: a copy is not cast (CR 707.10) and a spell cast another way was not given one. The first permanent, in battlefield
 * order, that gives one decides (the cost of each is given as the spell is cast: there is no choice between them to make here).
 */
export function grantedEvokeOf(
  state: GameState,
  seat: SeatId,
  spell: GameObject,
  zone: GameObject['zone'] | undefined,
): GrantedEvoke | null {
  if (spell.stack !== null) {
    const kept = spell.stack.evokeGrant;
    return kept === undefined ? null : { kind: 'evoke', cost: kept.cost };
  }
  if (zone !== 'hand' || spell.copyOf !== undefined) return null;
  const sources = altCostGrantSources(state);
  if (sources.length === 0) return null;
  // An evoke cost is for a permanent spell (CR 702.74a: the permanent is sacrificed when it enters).
  if (!derive(state, spell).types.some(isPermanentType)) return null;
  for (const source of sources) {
    if (source.alt.kind !== 'evoke') continue;
    if (controllerOf(state, source.object) !== seat) continue;
    if (
      source.condition !== undefined &&
      !staticConditionHolds(state, source.condition, source.object)
    ) {
      continue;
    }
    if (
      matchesFilter(
        state,
        spell,
        { ...source.what, zone: 'stack' },
        { controller: seat, source: source.object.id },
      )
    ) {
      return { kind: 'evoke', cost: source.alt.cost };
    }
  }
  return null;
}

/**
 * The energy counters a static ability of a permanent lets `seat` pay rather than the mana cost of `spell` (`grantEnergyAlternative`, issue 105, CR 118.9, 107.14), or null. Only for a
 * permanent spell cast from the hand; the permanent that gives the least decides when several do. The caster must also have the counters (`canPaySpellCost`).
 */
export function grantedEnergyOf(
  state: GameState,
  seat: SeatId,
  spell: GameObject,
  zone: GameObject['zone'] | undefined,
): number | null {
  if (spell.stack !== null) return spell.stack.energyGrant ?? null;
  if (zone !== 'hand' || spell.copyOf !== undefined) return null;
  const sources = altCostGrantSources(state);
  if (sources.length === 0) return null;
  if (!derive(state, spell).types.some(isPermanentType)) return null;
  let least: number | null = null;
  for (const source of sources) {
    if (source.alt.kind !== 'energy') continue;
    if (controllerOf(state, source.object) !== seat) continue;
    if (
      source.condition !== undefined &&
      !staticConditionHolds(state, source.condition, source.object)
    ) {
      continue;
    }
    if (
      matchesFilter(
        state,
        spell,
        { ...source.what, zone: 'stack' },
        { controller: seat, source: source.object.id },
      )
    ) {
      least = least === null ? source.alt.count : Math.min(least, source.alt.count);
    }
  }
  return least;
}

/** The `StackData.evokeGrant` of a card cast for an evoke cost a static ability gave its spell: nothing for a card with a printed evoke cost. */
export function evokeGrantData(
  state: GameState,
  seat: SeatId,
  spell: GameObject,
  zone: GameObject['zone'] | undefined,
): { readonly evokeGrant: { readonly cost: readonly Cost[] } } | Record<never, never> {
  if (spell.card === null) return {};
  const face = definitionOf(state, spell.card).faces[spell.face] ?? null;
  if (alternativeOf(face, 'evoke') !== null) return {};
  const granted = grantedEvokeOf(state, seat, spell, zone);
  return granted === null ? {} : { evokeGrant: { cost: granted.cost } };
}
