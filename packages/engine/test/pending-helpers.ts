// The decision a scenario game is waiting on, checked to be of one kind (shared by the scenario
// tests that answer a question: targets, cards, permanents, modes, X, an optional step).
import type {
  ChooseCardsDecision,
  ChooseModesDecision,
  ChooseOptionDecision,
  ChoosePermanentDecision,
  ChooseXDecision,
  ConfirmOptionalDecision,
  PendingDecision,
  TargetsDecision,
} from '../src/index';
import type { ScenarioGame } from '../src/testing/index';

/** The pending decision, which must be of `kind`: anything else fails the test. */
function pending<K extends PendingDecision['kind']>(
  g: ScenarioGame,
  kind: K,
): Extract<PendingDecision, { kind: K }> {
  const d = g.state.pending;
  if (d?.kind !== kind) throw new Error(`expected ${kind}, got ${d?.kind}`);
  return d as Extract<PendingDecision, { kind: K }>;
}

export const choosePermanentDecision = (g: ScenarioGame): ChoosePermanentDecision =>
  pending(g, 'choosePermanent');
export const chooseCardsDecision = (g: ScenarioGame): ChooseCardsDecision =>
  pending(g, 'chooseCards');
export const targetsDecision = (g: ScenarioGame): TargetsDecision => pending(g, 'targets');
export const chooseModesDecision = (g: ScenarioGame): ChooseModesDecision =>
  pending(g, 'chooseModes');
export const chooseXDecision = (g: ScenarioGame): ChooseXDecision => pending(g, 'chooseX');
export const confirmOptionalDecision = (g: ScenarioGame): ConfirmOptionalDecision =>
  pending(g, 'confirmOptional');
export const chooseOptionDecision = (g: ScenarioGame): ChooseOptionDecision =>
  pending(g, 'chooseOption');
