/**
 * `playCombat`: a whole combat from the DSL verbs. It adds no engine access of its own, so what it
 * does is exactly what a test written verb by verb would do (CR 506-511).
 */
import type { StepId } from '../state/types';
import { attackSpecs } from './combat-refs';
import { describePending } from './describe';
import { type CombatPlan, type DamageSpec, ScenarioError, type ScenarioGame } from './types';

const MAX_STEPS = 200;

/** Steps of the combat phase in order, to tell whether a stop point has been passed. */
const COMBAT_ORDER: readonly StepId[] = [
  'beginningOfCombat',
  'declareAttackers',
  'declareBlockers',
  'firstStrikeDamage',
  'combatDamage',
  'endOfCombat',
  'postcombatMain',
];

export function playCombat(game: ScenarioGame, plan: CombatPlan): ScenarioGame {
  const until = plan.until ?? 'endOfCombat';
  const stop = COMBAT_ORDER.indexOf(until);
  const damage = Array.isArray(plan.damage)
    ? { regular: plan.damage as readonly DamageSpec[] }
    : ((plan.damage ?? {}) as {
        firstStrike?: readonly DamageSpec[];
        regular?: readonly DamageSpec[];
      });
  let blocksUsed = false;
  const damageUsed = { firstStrike: false, regular: false };

  // Walk to the declare attackers decision from the main phase or the beginning of combat.
  if (game.state.pending?.kind !== 'declareAttackers') {
    const step = game.state.turn.step;
    if (step !== 'precombatMain' && step !== 'beginningOfCombat') {
      throw new ScenarioError(
        `playCombat starts at the declareAttackers decision, in the precombat main phase or at the beginning of combat; the game is in ${step} (${describePending(game.state, game.state.pending)})`,
      );
    }
    game.advanceTo('declareAttackers', { attack: false });
  }
  const d0 = game.state.pending;
  if (d0?.kind !== 'declareAttackers') {
    throw new ScenarioError(
      `playCombat: no declareAttackers decision came up (${describePending(game.state, d0)}): nobody can attack`,
    );
  }
  game.act(d0.seat).declareAttackers(attackSpecs(plan.attack));

  for (let i = 0; i < MAX_STEPS; i += 1) {
    const state = game.state;
    const d = state.pending;
    if (state.result || d === null) break;
    switch (d.kind) {
      case 'priority': {
        const at = COMBAT_ORDER.indexOf(state.turn.step);
        if (at < 0 || at > stop) {
          throw new ScenarioError(
            `playCombat went past ${until}: the game is in ${state.turn.step} (a step was skipped, for example because nobody attacked)`,
          );
        }
        if (state.turn.step === until) {
          return finish(game, plan, blocksUsed, damage, damageUsed);
        }
        game.act(d.seat).pass();
        break;
      }
      case 'declareBlockers':
        blocksUsed = true;
        game.act(d.seat).declareBlockers(plan.block ?? []);
        break;
      case 'assignDamage': {
        damageUsed[d.step] = true;
        const given = damage[d.step];
        if (given === undefined) game.act(d.seat).defaultDamage();
        else game.act(d.seat).assignDamage(given);
        break;
      }
      default:
        throw new ScenarioError(
          `playCombat stopped: ${describePending(state, d)} is not a combat decision\n${game.dump()}`,
        );
    }
  }
  return finish(game, plan, blocksUsed, damage, damageUsed);
}

function finish(
  game: ScenarioGame,
  plan: CombatPlan,
  blocksUsed: boolean,
  damage: { firstStrike?: readonly DamageSpec[]; regular?: readonly DamageSpec[] },
  damageUsed: { firstStrike: boolean; regular: boolean },
): ScenarioGame {
  if ((plan.block?.length ?? 0) > 0 && !blocksUsed) {
    throw new ScenarioError(
      'playCombat: blocks were given but no declareBlockers decision came up',
    );
  }
  for (const step of ['firstStrike', 'regular'] as const) {
    if (damage[step] !== undefined && !damageUsed[step]) {
      throw new ScenarioError(
        `playCombat: damage for the ${step} step was given but the engine never asked for it`,
      );
    }
  }
  return game;
}
