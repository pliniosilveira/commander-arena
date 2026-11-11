/** The shapes the drag and drop model and its gesture files share. */
import type { Action, ObjectId, SeatId } from '@commander-arena/engine';
import type { UiState } from '../decisions/ui-state';

/** A place something can be dropped. Objects are opposing permanents (attack or block targets). */
export type DropTarget =
  | { readonly kind: 'battlefield' }
  | { readonly kind: 'stack' }
  | { readonly kind: 'seat'; readonly seat: SeatId }
  | { readonly kind: 'object'; readonly id: ObjectId };

/** `card`: a hand card or the commander in the command zone. `permanent`: a tile on the board. */
export type DragSource = 'card' | 'permanent';

export interface DropZone {
  readonly target: DropTarget;
  /** What the zone says while it is a valid drop: "Play Plains", "Attack Opponent". */
  readonly label: string;
}

export interface DragSpec {
  readonly zones: readonly DropZone[];
}

export type DropResult =
  | { readonly kind: 'none' }
  /** Do what a click on the dragged object does (cast it or play it). */
  | { readonly kind: 'click' }
  /** Send this action as it is (a flashback cast: the click would open a menu for some cards). */
  | { readonly kind: 'act'; readonly action: Action }
  /**
   * Start an Equip or an Aura cast with `start`, then answer the target question the engine asks
   * with `host` (`ui/dnd/attach-flow.ts`).
   */
  | { readonly kind: 'attach'; readonly start: Action; readonly host: ObjectId }
  | { readonly kind: 'ui'; readonly change: (ui: UiState) => UiState };
