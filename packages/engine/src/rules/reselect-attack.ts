/**
 * "You may reselect which player or permanent target attacking creature is attacking" as an instruction of a resolving effect
 * (CR 508.7, D-139). The controller of the effect chooses among the players, planeswalkers and battles the creature's controller
 * could attack (CR 508.7c), the current target included, with a `chooseOption` decision (purpose 'attackTarget'); the creature then
 * attacks the chosen one. It stays in combat and is not declared again (CR 508.7a), and nothing that restricts declaring attackers
 * applies (CR 508.7b), so the candidates are all the opponents' players and permanents, as `attackTargets` lists them.
 */

import type { SeatId } from '../ids';
import type { AttackTarget } from '../state/combat-types';
import type { GameEvent } from '../state/events';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { attackTargets } from './attack-targets';
import { controllerOf } from './control';
import { defenderRecord } from './defending';
import { derive } from './derive';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type ReselectInstruction = Extract<Instruction, { kind: 'reselectAttack' }>;

/** The option a decision lists for an attack target. */
export function attackTargetOption(target: AttackTarget): string {
  return target.kind === 'player' ? `player:${target.seat}` : `permanent:${target.object}`;
}

const sameTarget = (a: AttackTarget, b: AttackTarget): boolean =>
  attackTargetOption(a) === attackTargetOption(b);

/** CR 508.4 ("that player or a planeswalker they control"): the player `seat` or a planeswalker that player controls. */
function allowedBy(state: GameState, target: AttackTarget, seat: SeatId): boolean {
  if (target.kind === 'player') return target.seat === seat;
  const obj = state.objects[target.object];
  return (
    obj !== undefined &&
    derive(state, obj).types.includes('planeswalker') &&
    controllerOf(state, obj) === seat
  );
}

export function runReselectAttack(
  state: GameState,
  res: ResolutionContext,
  instruction: ReselectInstruction,
): StepOutcome {
  const attacker = state.combat?.attackers.find((a) => a.object === instruction.object);
  const obj = state.objects[instruction.object];
  if (attacker === undefined || obj?.zone !== 'battlefield') return done(state);
  const targets = attackTargets(state, controllerOf(state, obj)).filter(
    (t) => instruction.among === undefined || allowedBy(state, t, instruction.among),
  );
  if (instruction.chosen !== null) {
    const picked = targets.find((t) => attackTargetOption(t) === instruction.chosen);
    if (picked === undefined) return done(state);
    const event: GameEvent = {
      kind: 'optionChosen',
      seat: res.controller,
      source: res.object,
      purpose: 'attackTarget',
      option: instruction.chosen,
    };
    if (sameTarget(picked, attacker.target)) return done(state, [event]);
    const combat = state.combat;
    if (combat === null) return done(state);
    return done(
      {
        ...state,
        combat: {
          ...combat,
          attackers: combat.attackers.map((a) =>
            a.object === instruction.object
              ? {
                  object: a.object,
                  target: picked,
                  blocked: a.blocked,
                  ...(picked.kind === 'permanent' ? defenderRecord(state, picked) : {}),
                }
              : a,
          ),
        },
      },
      [event],
    );
  }
  // Nothing to choose when the creature can attack no one else.
  if (targets.length <= 1) return done(state);
  const info = sourceInfo(state, res.source);
  return {
    state,
    events: [],
    front: [],
    needs: {
      kind: 'chooseOption',
      seat: res.controller,
      purpose: 'attackTarget',
      options: targets.map(attackTargetOption),
      attacker: instruction.object,
      attackTargets: targets,
      source: res.object,
      sourceName: info?.name ?? '',
      sourceOracleText: info?.oracleText ?? '',
    },
  };
}
