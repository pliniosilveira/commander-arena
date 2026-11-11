/**
 * The lowerings that the lowering of a clause needs and cannot import (stage P35, D-176): the lowering of a triggered ability and of an activated
 * one read their bodies with the clause lowerings (`effects.ts`), and the clause that creates a token with an ability in quotes lowers that ability
 * with them. The boundary rules forbid the cycle, so `index.ts`, which sits above all of them, registers the two as the module is loaded.
 */
import type { Ability } from '@commander-arena/engine';
import type { IrAbility } from '../ir/types';
import type { LowerContext, LowerResult } from './types';

export interface LateLowerers {
  readonly triggered: (
    ability: Extract<IrAbility, { kind: 'triggered' }>,
    ctx: LowerContext,
  ) => LowerResult<readonly Ability[]>;
  readonly activated: (
    ability: Extract<IrAbility, { kind: 'activated' }>,
    ctx: LowerContext,
  ) => LowerResult<readonly Ability[]>;
  /** The static ability of an emblem (stage P47, D-201). */
  readonly static: (
    ability: Extract<IrAbility, { kind: 'static' }>,
    ctx: LowerContext,
  ) => LowerResult<readonly Ability[]>;
}

let registered: LateLowerers | null = null;

export function registerLateLowerers(lowerers: LateLowerers): void {
  registered = lowerers;
}

/** The registered lowerings, or null when the lowering has not been loaded (nothing then can be lowered into a token). */
export function lateLowerers(): LateLowerers | null {
  return registered;
}
