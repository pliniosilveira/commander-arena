// Shared builders for the mana tests (SYNTHETIC fixtures, not real card data).
import type { ObjectId } from '../src/ids';
import type { PaymentSource } from '../src/mana/payment';
import type { ManaColor, ManaObject, ManaRestriction } from '../src/mana/types';

export const oid = (n: number): ObjectId => `o${n}`;

export function source(
  n: number,
  produces: readonly (readonly ManaColor[])[],
  opts: Partial<Omit<PaymentSource, 'object' | 'produces'>> = {},
): PaymentSource {
  return {
    object: oid(n),
    abilityIndex: 0,
    produces,
    tier: 'land',
    snow: false,
    restriction: null,
    ...opts,
  };
}

export const land = (n: number, color: ManaColor): PaymentSource => source(n, [[color]]);

export function mana(
  color: ManaColor,
  opts: { snow?: boolean; restriction?: ManaRestriction | null; src?: number } = {},
): ManaObject {
  return {
    color,
    snow: opts.snow ?? false,
    source: oid(opts.src ?? 900),
    restriction: opts.restriction ?? null,
  };
}

export const CREATURE_ONLY: ManaRestriction = { kind: 'spellTypes', types: ['creature'] };
export const ABILITIES_ONLY: ManaRestriction = { kind: 'abilitiesOnly' };

/** A tiny seeded generator of numbers in [0, 1), independent of the engine's RNG. */
export function unitLcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
