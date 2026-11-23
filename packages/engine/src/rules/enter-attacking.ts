/**
 * "Put it onto the battlefield tapped and attacking" (CR 508.4, 506.3, D-151): the creatures an earlier effect put onto the battlefield start
 * attacking. They were never declared as attackers (CR 508.4), so nothing that triggers on an attack sees them and the turn log does not count them.
 * Their controller chooses which player, planeswalker or battle each attacks (CR 508.4): they enter attacking the player the source attacks, then a `reselectAttack`
 * instruction (rules/reselect-attack.ts) asks for each one, unless it has no other target to attack.
 */
import type { Effect } from '../ast/types';
import { opponentsOf } from '../state/ops';
import type { AttackerState, ChosenTarget, GameState, ResolutionContext } from '../state/types';
import { attackedTarget, attackerDefender, defendingPlayerOf } from './defending';
import { derive } from './derive';
import { resolveObjects, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

type EnterAttacking = Extract<Effect, { kind: 'enterAttacking' }>;

export function runEnterAttacking(
  state: GameState,
  res: ResolutionContext,
  effect: EnterAttacking,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const combat = state.combat;
  if (combat === null) return done(state);
  if (effect.asReturned === true) return enterLikeReturned(state, res, effect, ctx, targets);
  // The player the source attacks; else, when the source is not attacking (an ability of "whenever you attack"), the player the first declared attacker attacks; else the first
  // opponent of the controller (CR 508.4: the controller chooses; with one choice there is none to make).
  const [firstAttacker] = combat.attackers;
  const target =
    defendingPlayerOf(state, res.source) ??
    (firstAttacker === undefined ? null : attackerDefender(state, firstAttacker)) ??
    opponentsOf(state, res.controller)[0] ??
    null;
  if (target === null) return done(state);
  const entering = resolveObjects(state, effect.objects, ctx, targets).filter((id) => {
    const obj = state.objects[id];
    return (
      obj !== undefined &&
      obj.zone === 'battlefield' &&
      derive(state, obj).types.includes('creature') &&
      !combat.attackers.some((a) => a.object === id)
    );
  });
  if (entering.length === 0) return done(state);
  const entered: GameState = {
    ...state,
    combat: {
      ...combat,
      attackers: [
        ...combat.attackers,
        ...entering.map((object) => ({
          object,
          target: { kind: 'player' as const, seat: target },
          blocked: false,
        })),
      ],
    },
  };
  // CR 508.4: the choice is the controller's, as each creature enters; `among` keeps it to what the effect names ("that player or a planeswalker they control").
  return done(
    entered,
    [],
    entering.map((object) => ({
      kind: 'reselectAttack' as const,
      object,
      chosen: null,
      ...(effect.thatPlayerOrTheirPlaneswalkers === true ? { among: target } : {}),
    })),
  );
}

/**
 * Ninjutsu (CR 702.49a, unverified: the CR text is not in the repository): the card enters attacking the player, planeswalker or battle the creature returned as the cost was
 * attacking (`ResolutionContext.costReturnedAttack`), so nobody chooses a target. It was never declared as an attacker. When nothing was recorded (the cost returned no attacker)
 * nothing enters attacking. A planeswalker or battle that has left the battlefield leaves the creature attacking nothing, as it does for the creature it replaces (CR 506.4).
 */
function enterLikeReturned(
  state: GameState,
  res: ResolutionContext,
  effect: EnterAttacking,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const combat = state.combat;
  const recorded = res.costReturnedAttack;
  if (combat === null || recorded === undefined) return done(state);
  const entering = resolveObjects(state, effect.objects, ctx, targets).filter((id) => {
    const obj = state.objects[id];
    return (
      obj !== undefined &&
      obj.zone === 'battlefield' &&
      derive(state, obj).types.includes('creature') &&
      !combat.attackers.some((a) => a.object === id)
    );
  });
  if (entering.length === 0) return done(state);
  const added: AttackerState[] = entering.map((object) => {
    const entry: AttackerState = {
      object,
      target: recorded.target,
      blocked: false,
      ...(recorded.defender === undefined ? {} : { defender: recorded.defender }),
      ...(recorded.targetGone === true ? { targetGone: true as const } : {}),
    };
    return attackedTarget(state, entry) === null ? { ...entry, targetGone: true as const } : entry;
  });
  return done({ ...state, combat: { ...combat, attackers: [...combat.attackers, ...added] } });
}
