// Shared by the restriction, requirement and evasion tests (D-094). Every card is SYNTHETIC
// (src/cards/fixtures/synthetic-restrictions.ts), Grizzly Bears or a basic land.
import { expect } from 'vitest';
import { type Action, applyAction, getLegalActions } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

export type Builder = ReturnType<typeof scenario>;

/**
 * Seat 0 attacks with `attackers` (all on the battlefield, able to attack); seat 1 has what `seat1`
 * puts on the battlefield. Returns the game where seat 1 declares blockers, or the declare blockers
 * step with priority when nothing can block.
 */
export function attackedGame(
  attackers: readonly string[],
  seat1: (b: Builder) => void,
  seat0: (b: Builder) => void = () => {},
): ScenarioGame {
  const b = scenario().seat(0).library('Island', { count: 4 });
  for (const a of attackers) b.battlefield(a);
  seat0(b);
  b.seat(1).library('Island', { count: 4 });
  seat1(b);
  const g = b.at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers');
  g.act(0).attack(attackers);
  g.advanceTo('declareBlockers');
  return g;
}

/**
 * Whether seat 1 may block `attacker` with `blocker` alone. The three views of the rule must agree:
 * what `applyAction` accepts, what the legal-action list offers, and what the decision's candidates
 * say (CR 509.1b).
 */
type Ref = Parameters<ScenarioGame['id']>[0];

export function canBlock(g: ScenarioGame, blocker: Ref, attacker: Ref): boolean {
  const action: Action = {
    kind: 'declareBlockers',
    blocks: [{ blocker: g.id(blocker), attacker: g.id(attacker) }],
  };
  const accepted = applyAction(g.state, 1, action).ok;
  const listed = getLegalActions(g.state, 1).some(
    (a) => JSON.stringify(a) === JSON.stringify(action),
  );
  const d = g.state.pending;
  const candidate =
    d?.kind === 'declareBlockers' &&
    d.candidates.some((c) => c.blocker === g.id(blocker) && c.canBlock.includes(g.id(attacker)));
  // A single block of an attacker that needs two blockers (menace) is accepted by neither list.
  expect(
    { accepted, listed, candidate },
    `${JSON.stringify(blocker)} blocks ${JSON.stringify(attacker)}`,
  ).toEqual({
    accepted,
    listed: accepted,
    candidate: accepted,
  });
  return accepted;
}
