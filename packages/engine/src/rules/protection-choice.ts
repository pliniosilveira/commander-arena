/**
 * "Target creature you control gains protection from the color of your choice until end of turn" (CR 702.16 Protection, CR 608.2d; D-1301): a `grantKeyword` effect whose
 * keyword is `protection` from `colorOfChoice`. The controller of the resolving spell or ability chooses one of the five colors as the effect is applied, with a
 * `chooseOption` decision (purpose `protectionColor`); nothing is chosen when the spell is cast, so nobody can respond knowing the color. The grant then runs as an ordinary
 * `grantKeyword` of protection from that color, so targeting, damage, blocking and attaching read it where they read any protection (`rules/protection.ts`).
 *
 * Nothing is asked when no permanent is left for the effect to affect (a target that is gone, CR 608.2b): there is nothing to protect.
 */
import type { Effect } from '../ast/types';
import { COLORS, type Color } from '../characteristics';
import type { ChosenTarget } from '../state/chosen';
import type { GameEvent } from '../state/events';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { resolveObjects, type SelectContext } from './select';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type ProtectionColorInstruction = Extract<Instruction, { kind: 'protectionColor' }>;

/** Whether the effect gives protection from the color of the controller's choice: the one `grantKeyword` this module runs. */
export function givesProtectionOfChoice(
  effect: Effect,
): effect is ProtectionColorInstruction['effect'] {
  return (
    effect.kind === 'grantKeyword' &&
    effect.keyword.kind === 'protection' &&
    effect.keyword.from === 'colorOfChoice'
  );
}

export function runProtectionColor(
  state: GameState,
  res: ResolutionContext,
  instruction: ProtectionColorInstruction,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const { effect, chosen } = instruction;
  // CR 611.2c, 608.2b: the permanents the grant would affect, as they are now; a target that left the battlefield is skipped.
  const protects = resolveObjects(state, effect.objects, ctx, targets).filter(
    (id) => state.objects[id]?.zone === 'battlefield',
  );
  if (protects.length === 0) return done(state);
  if (chosen !== null) {
    const event: GameEvent = {
      kind: 'optionChosen',
      seat: res.controller,
      source: res.object,
      purpose: 'protectionColor',
      option: chosen,
    };
    return done(
      state,
      [event],
      [
        {
          kind: 'effect',
          effect: { ...effect, keyword: { kind: 'protection', from: 'color', colors: [chosen] } },
        },
      ],
    );
  }
  const info = sourceInfo(state, res.source);
  return {
    state,
    events: [],
    front: [],
    needs: {
      kind: 'chooseOption',
      seat: res.controller,
      purpose: 'protectionColor',
      options: [...COLORS],
      protects,
      source: res.object,
      sourceName: info?.name ?? '',
      sourceOracleText: info?.oracleText ?? '',
    },
  };
}

/** The color a `chooseOption` answer names, or null when it is not one of the five. */
export function colorOfAnswer(option: string): Color | null {
  return COLORS.find((c) => c === option) ?? null;
}
