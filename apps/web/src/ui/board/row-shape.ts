/** What the battlefield rows share: the room around and between tiles, and the props of a row. */
import type { ObjectId, ObjectView } from '@commander-arena/engine';
import type { CombatRole, RowKind } from './resolve';

export const GAP = 6;
export const PAD_Y = 6;

export interface RowProps {
  readonly kind: RowKind;
  /** Drawn inside the shared back line: it measures and scrolls within its own box. */
  readonly inline?: boolean;
  readonly objects: readonly ObjectView[];
  readonly roles: ReadonlyMap<string, CombatRole>;
  /** Auras and Equipment by the host they hang under (`splitAttachments`). */
  readonly attachments: ReadonlyMap<ObjectId, readonly ObjectView[]>;
}
