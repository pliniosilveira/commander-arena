/**
 * Escape that an effect gives to the cards of a graveyard until the end of the turn (CR 702.138a, 611.2a, 611.2c): "Until end of turn, each creature card in your graveyard gains
 * 'Escape, {3}{B}, exile four other cards from your graveyard'" (the effect `gainEscape`, which leaves a continuous effect that names the cards). A card cast for it is cast as one
 * with a printed escape cost is (`CastAlternative` `escape`): from its owner's graveyard, paying the granted cost and exiling the granted number of other cards.
 */
import type { AlternativeCost, Cost, Effect } from '../ast/types';
import type { CardFace } from '../cards/definition';
import { allocateTimestamp, definitionOf, getSeat } from '../state/ops';
import type { ContinuousEffect, GameObject, GameState, ResolutionContext } from '../state/types';
import { alternativeOf } from './alt-costs';
import { matchesFilter } from './select';
import { done, type StepOutcome } from './step-outcome';

type Escape = Extract<AlternativeCost, { kind: 'escape' }>;

/**
 * "Until end of turn, each creature card in your graveyard gains escape" (CR 702.138a, 611.2a, 611.2c): one continuous effect that names the cards of the controller's graveyard the
 * filter describes as the effect resolves, until the end of the turn. It does nothing when there are none.
 */
export function runGainEscape(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'gainEscape' }>,
): StepOutcome {
  const cards = getSeat(state, res.controller).graveyard.filter((id) => {
    const card = state.objects[id];
    return (
      card !== undefined &&
      card.card !== null &&
      matchesFilter(
        state,
        card,
        { ...effect.what, zone: 'graveyard' },
        { controller: res.controller, source: res.source },
      )
    );
  });
  if (cards.length === 0) return done(state);
  const [timestamp, stamped] = allocateTimestamp(state);
  const created: ContinuousEffect = {
    id: `ce${timestamp}`,
    timestamp,
    objects: cards,
    until: 'endOfTurn',
    change: { kind: 'escapeGrant', cost: effect.cost, exile: effect.exile },
  };
  return done({ ...stamped, continuousEffects: [...stamped.continuousEffects, created] });
}

/**
 * The escape cost an effect gave `obj`, a card in a graveyard or the same card as the spell it would be (`castAs` keeps its id; the effect names the objects of the graveyard, and a card
 * that left it is a new object, CR 400.7) (the latest of them decides, CR 613.7), or null.
 */
export function grantedEscapeOf(state: GameState, obj: GameObject): Escape | null {
  let found: { readonly timestamp: number; readonly escape: Escape } | null = null;
  for (const e of state.continuousEffects) {
    if (e.change.kind !== 'escapeGrant' || !e.objects.includes(obj.id)) continue;
    if (found === null || e.timestamp > found.timestamp) {
      found = {
        timestamp: e.timestamp,
        escape: { kind: 'escape', cost: e.change.cost, exile: e.change.exile },
      };
    }
  }
  return found?.escape ?? null;
}

/**
 * The escape cost `spell` is cast for (CR 702.138a): the face's own, else the one an effect gave the card in the graveyard (`spell` is the card before it is cast), else the one the spell
 * on the stack was cast with (`StackData.escapeGrant`). Null for a card with none.
 */
export function escapeOf(
  state: GameState,
  spell: GameObject,
  face: CardFace | null,
): Escape | null {
  const printed = alternativeOf(face, 'escape');
  if (printed !== null) return printed;
  const onStack = spell.stack?.escapeGrant;
  if (onStack !== undefined) return { kind: 'escape', cost: onStack.cost, exile: onStack.exile };
  return grantedEscapeOf(state, spell);
}

/** The `StackData.escapeGrant` of a card cast for an escape cost an effect gave it: nothing for a card with a printed escape cost or none at all. */
export function escapeGrantData(
  state: GameState,
  obj: GameObject,
):
  | { readonly escapeGrant: { readonly cost: readonly Cost[]; readonly exile: number } }
  | Record<never, never> {
  if (obj.card === null) return {};
  if (alternativeOf(definitionOf(state, obj.card).faces[0] ?? null, 'escape') !== null) return {};
  const granted = grantedEscapeOf(state, obj);
  return granted === null ? {} : { escapeGrant: { cost: granted.cost, exile: granted.exile } };
}
