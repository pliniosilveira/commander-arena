/**
 * The pure parts of the "reselect which player or permanent the creature is attacking" question (CR 508.7, D-139): a
 * `chooseOption` decision of purpose `attackTarget`, whose options are `player:<seat>` and `permanent:<id>` with the
 * matching `attackTargets`. The dialog (`AttackTargetDialog.tsx`) draws what these return, so the words are unit tested
 * without a DOM. The creature's current target is one of the options: keeping it is choosing it again.
 */
import type { AttackTarget, ChooseOptionDecision, GameView } from '@commander-arena/engine';
import { attackTargetLabel, type Index, nameOf, sameAttackTarget } from './lookup';

/** "Choose what SYNTHETIC Myr attacks (SYNTHETIC Crooked Signpost)." */
export function attackTargetPrompt(
  d: Pick<ChooseOptionDecision, 'attacker' | 'sourceName'>,
  index: Index,
): string {
  const attacker = d.attacker === undefined ? 'the attacking creature' : nameOf(index, d.attacker);
  const source = d.sourceName === '' ? '' : ` (${d.sourceName})`;
  return `Choose what ${attacker} attacks${source}.`;
}

/** One button of the dialog: the option to send, its label, and whether the creature attacks it now. */
export interface AttackTargetRow {
  readonly option: string;
  readonly label: string;
  readonly current: boolean;
}

/** What a planeswalker or a battle is, after its name: "planeswalker", "battle". */
function permanentKind(target: AttackTarget, index: Index): string {
  if (target.kind !== 'permanent') return 'player';
  const types = index.get(target.object)?.types ?? [];
  if (types.includes('planeswalker')) return 'planeswalker';
  if (types.includes('battle')) return 'battle';
  return 'permanent';
}

/**
 * The rows of the dialog, in the engine's order: "Opponent (player)", "Jace (planeswalker)", with the target the
 * creature attacks now marked. Options without a matching `attackTargets` entry are left out (never guessed).
 */
export function attackTargetRows(
  d: Pick<ChooseOptionDecision, 'options' | 'attackTargets' | 'attacker'>,
  view: Pick<GameView, 'viewer' | 'combat'>,
  index: Index,
): readonly AttackTargetRow[] {
  const now = view.combat?.attackers.find((a) => a.object === d.attacker)?.target;
  return d.options.flatMap((option, i) => {
    const target = d.attackTargets?.[i];
    if (target === undefined) return [];
    const label = `${attackTargetLabel(target, index, view.viewer)} (${permanentKind(target, index)})`;
    return [{ option, label, current: now !== undefined && sameAttackTarget(now, target) }];
  });
}
