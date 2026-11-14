/**
 * The types of the effects that modify one damage event (CR 616.1, D-191), apart from `damage-order.ts` so that the words of an effect
 * (`damage-order-text.ts`) can name them without a cycle.
 */
import type { ObjectId } from '../ids';
import type { DamageRecipient } from '../state/combat-types';
import type { Redirect } from './damage-redirect';
import type { Shield, StaticPrevention } from './prevention';

/** One damage event as it would be dealt: `amount` is what is left of it at this point of the process. */
export interface DamageEvent {
  readonly source: ObjectId;
  readonly to: DamageRecipient;
  readonly amount: number;
  readonly combat: boolean;
}

/** An effect that applies to a damage event and can be chosen as the next one to apply (CR 616.1). */
export type DamageModifier =
  | {
      readonly kind: 'prevent';
      readonly key: string;
      /** A static ability of the recipient (D-149): prevents all damage, is never used up. */
      readonly origin: { readonly kind: 'static'; readonly prevention: StaticPrevention };
    }
  | {
      readonly kind: 'prevent';
      readonly key: string;
      /** A shield (CR 615): `all` for "prevent all", else the number it prevents at most. */
      readonly origin: { readonly kind: 'shield'; readonly shield: Shield };
    }
  | {
      readonly kind: 'redirect';
      readonly key: string;
      /** A redirection effect of a creature (CR 614.9, D-192): the damage is dealt to that creature instead. Used once for an event (CR 614.5). */
      readonly origin: { readonly kind: 'redirect'; readonly redirect: Redirect };
    };
