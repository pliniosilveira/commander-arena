/**
 * The effects that deal damage as a spell or ability resolves (CR 120, 608.2): `dealDamage` (to players and permanents, with "excess damage
 * is dealt to that creature's controller instead"), `dealDividedDamage` (the shares of a divided spell) and the question that any damage
 * event may ask (CR 616.1, D-191).
 *
 * The damage of one instruction is simulated from the state the instruction began with, event after event, with the answers given so far
 * (`ResolutionContext.damageAnswers`). When an event needs one more answer the instruction returns the question and stays at the head of the
 * queue, with nothing dealt and no trigger collected, so a pause is invisible to the rest of the engine; the answer is added and the same
 * instruction runs again, to the next question or to the end.
 */
import type { Effect, ObjectSelector, PlayerSelector } from '../ast/types';
import type { DamageRecipient } from '../state/combat-types';
import type { GameEvent } from '../state/events';
import type { ChosenTarget, GameObject, GameState, ResolutionContext } from '../state/types';
import { dealDamageAsking, dealDamageWithExcess } from './damage';
import type { Asked, OrderFlow } from './damage-order';
import { attackedTarget } from './defending';
import { derive } from './derive';
import type { DestroyAsked } from './destroy-replacement';
import { amountOf, PLAYER_ONLY_KINDS } from './effect-support';
import { abilitiesHaveKeyword } from './keywords';
import { resolveObjects, resolvePlayers, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';
import type { TokensAsked } from './token-replacement';

/** The instruction asks: nothing it did so far is kept (it will run again from the same state with the answer). */
export const asking = (
  state: GameState,
  question: Asked | TokensAsked | DestroyAsked,
): StepOutcome => ({
  state,
  events: [],
  front: [],
  needs: question.decision,
});

/** "Deals N damage to ..." (CR 120.3, 701.14): the effect `dealDamage` as the instruction runs. */
export function runDealDamage(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'dealDamage' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
  flow: OrderFlow,
): StepOutcome {
  const amount = amountOf(state, effect.amount, ctx, targets);
  if (amount <= 0) return done(state);
  // CR 120.3, 701.14 (D-131): the damage is dealt by the spell or ability, or by the creature `from` names ("Target
  // creature you control deals damage equal to its power ..."). A creature that is no longer a legal target, or no
  // longer known, deals none (CR 608.2b); one that left since is read from last-known information (CR 113.7a).
  const damageSource =
    effect.from === undefined ? res.source : resolveObjects(state, effect.from, ctx, targets)[0];
  if (damageSource === undefined) return done(state);
  // CR 115.4: "any target" can be a player or an object, so a `target` selector resolves both
  // ways; only the kind the player chose matches.
  if (effect.to.kind === 'attackedBy') {
    // CR 508.1b (D-139): "the player or planeswalker it's attacking": the attack target of the creature the reference names.
    const attacker = resolveObjects(state, effect.to.of, ctx, targets)[0];
    const entry = state.combat?.attackers.find((a) => a.object === attacker);
    // CR 506.4c (D-200): a creature whose planeswalker was removed from combat attacks no player or planeswalker.
    const target = entry === undefined ? null : attackedTarget(state, entry);
    if (target === null) return done(state);
    const to: DamageRecipient =
      target.kind === 'player'
        ? { kind: 'player', seat: target.seat }
        : { kind: 'object', id: target.object };
    const r = dealDamageAsking(state, damageSource, to, amount, false, flow);
    return r.kind === 'asked' ? asking(state, r) : done(r.state, r.events);
  }
  const kind = effect.to.kind;
  const playerOnly = PLAYER_ONLY_KINDS.includes(kind);
  // The selector kinds are shared between object and player selectors only for `target`.
  const seats =
    playerOnly || kind === 'target'
      ? resolvePlayers(state, effect.to as PlayerSelector, ctx, targets)
      : [];
  const objects = playerOnly
    ? []
    : resolveObjects(state, effect.to as ObjectSelector, ctx, targets);
  let next = state;
  const events: GameEvent[] = [];
  for (const seat of seats) {
    const r = dealDamageAsking(next, damageSource, { kind: 'player', seat }, amount, false, flow);
    if (r.kind === 'asked') return asking(state, r);
    next = r.state;
    events.push(...r.events);
  }
  // CR 702.19b, 120.3 (D-145): "If the creature you control has trample, excess damage is dealt to that creature's controller
  // instead", read as the damage is dealt (a creature that left is read as it last was, CR 113.7a).
  const tramples =
    effect.trampleExcess === true &&
    abilitiesHaveKeyword(
      state.objects[damageSource] === undefined
        ? (state.lki[damageSource]?.abilities ?? [])
        : derive(state, state.objects[damageSource] as GameObject).abilities,
      'trample',
    );
  for (const id of objects) {
    const recipient = next.objects[id];
    const isCreature =
      recipient !== undefined && derive(next, recipient).types.includes('creature');
    const r =
      tramples && recipient !== undefined && isCreature
        ? dealDamageWithExcess(next, damageSource, recipient, amount, flow)
        : dealDamageAsking(next, damageSource, { kind: 'object', id }, amount, false, flow);
    if (r.kind === 'asked') return asking(state, r);
    next = r.state;
    events.push(...r.events);
  }
  return done(next, events);
}

/** The shares of a divided spell (CR 601.2d, 608.2b, D-145): each target still legal is dealt the share the caster gave it, by the spell. */
export function runDealDividedDamage(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'dealDividedDamage' }>,
  targets: readonly ChosenTarget[],
  flow: OrderFlow,
): StepOutcome {
  // A target that became illegal gets nothing, and its share goes to nobody else.
  let after = state;
  const events: GameEvent[] = [];
  for (const t of targets) {
    if (t.specId !== effect.to.id || t.share === undefined) continue;
    const r = dealDamageAsking(
      after,
      res.source,
      t.kind === 'player' ? { kind: 'player', seat: t.seat } : { kind: 'object', id: t.id },
      t.share,
      false,
      flow,
    );
    if (r.kind === 'asked') return asking(state, r);
    after = r.state;
    events.push(...r.events);
  }
  return done(after, events);
}
