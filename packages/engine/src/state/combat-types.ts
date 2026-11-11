/**
 * Combat vocabulary shared by decisions, actions and state (CR 506-511). In its own file so those
 * modules stay free of import cycles.
 */
import type { ObjectId, SeatId } from '../ids';

/** What an attacking creature attacks (CR 506.3): a player, or a planeswalker or battle. */
export type AttackTarget =
  | { readonly kind: 'player'; readonly seat: SeatId }
  | { readonly kind: 'permanent'; readonly object: ObjectId };

/** Who receives assigned combat damage. */
export type DamageRecipient =
  | { readonly kind: 'object'; readonly id: ObjectId }
  | { readonly kind: 'player'; readonly seat: SeatId };

export interface DamageAssignment {
  readonly source: ObjectId;
  readonly to: DamageRecipient;
  readonly amount: number;
}

/** One attacking creature that needs a choice about how to divide its damage (CR 510.1c, 702.19b). */
export interface DamageChoice {
  readonly source: ObjectId;
  readonly power: number;
  /** Any nonzero damage from a deathtouch source is lethal for assignment (CR 702.2c). */
  readonly deathtouch: boolean;
  readonly trample: boolean;
  /** The blockers, in declaration order, with the damage that counts as lethal to each (CR 702.19b). */
  readonly blockers: readonly { readonly object: ObjectId; readonly lethal: number }[];
  /** With trample, where excess damage may go: the player, planeswalker or battle attacked. */
  readonly tramplesOver: DamageRecipient | null;
}
