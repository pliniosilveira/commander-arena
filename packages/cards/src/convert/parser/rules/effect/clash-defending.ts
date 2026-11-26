/**
 * Effect rule of the Revenant Recon deck (Marvo, Deep Operative): "clash with defending player" (CR 701.30, 508.5). The engine's `clash` with `against` the defending player
 * (`lower/clash-defending.ts`); only in the ability of an attacking creature.
 */
import { pattern } from '../../combinators';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.clash-defending`: "clash with defending player" (CR 701.30b: you and that player each reveal the top card of their library and may put it on the bottom; CR 508.5: the defending
 * player is the player the creature is attacking). The player is named, not chosen. Not read: "the defending player", "an opponent", "target opponent", "each defending player", "clashes".
 */
export const EFFECT_CLASH_DEFENDING = defineRule<Clauses>({
  id: 'effect.clash-defending',
  family: 'effect',
  leading: ['clash'],
  cites: ['CR 701.30b (Clash)', 'CR 508.5 (Declare Attackers Step)'],
  examples: ['clash with defending player', 'Clash with defending player'],
  rejects: [
    'clash with the defending player',
    'clash with defending players',
    'clash with an opponent',
    'clash with target opponent',
    'clash with each defending player',
    'clashes with defending player',
    'clash with defending player twice',
    'clash with defending',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(new RegExp(`clash with defending player${BOUNDARY}`, 'iu')))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause('effect.clash-defending', 'clashDefending', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

export const CLASH_DEFENDING_EFFECT_RULES = [EFFECT_CLASH_DEFENDING].map(quietly);
