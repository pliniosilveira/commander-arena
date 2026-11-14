/**
 * A target chosen for a spell or ability (CR 601.2c). Lives in its own file to keep imports acyclic. `share` is the part of a divided effect
 * this target gets ("3 damage divided as you choose among up to three targets"): announced as the spell is cast, at least 1 (CR 601.2d, D-145).
 * Present only for a slot whose `TargetSpec` has `divide`.
 */
import type { ObjectId, SeatId } from '../ids';

export type ChosenTarget =
  | {
      readonly kind: 'object';
      readonly id: ObjectId;
      readonly specId: string;
      readonly share?: number;
      /** For a target of a slot that takes one for each opponent (`TargetSpec.onePerOpponent`, D-149): the player who controls it. */
      readonly group?: SeatId;
    }
  | {
      readonly kind: 'player';
      readonly seat: SeatId;
      readonly specId: string;
      readonly share?: number;
    };
