/**
 * Lowerings of group 4 of the Troyan deck (issue 337): "reveal the top card of your library. You may cast it without paying its mana cost if it's a spell with lesser mana
 * value. If you don't cast it, put it into your hand."
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { FeatureRef } from './features';
import type { Lowering } from './types';

/**
 * The engine's `revealTopCast`. "Lesser mana value" is lesser than that of the spell that caused the ability to trigger (CR 202.3, 608.2h: as it last was on the stack once it
 * is gone), so the limit is the mana value of the `triggerSubject`; the engine's validation refuses it in an ability whose trigger names no spell, so a card with another trigger
 * is dropped as a whole, never half run.
 */
export const REVEAL_TOP_CAST: Lowering<IrClause, Effects> = {
  head: 'revealTopCast',
  id: 'lower.reveal-top-cast',
  needs: ['effect:revealTopCast', 'amount:manaValueOf', 'selector:triggerSubject'],
  lower: (clause) => ({
    ok: true,
    value: [
      {
        kind: 'revealTopCast',
        manaValueBelow: { kind: 'manaValueOf', of: { kind: 'triggerSubject' } },
      },
    ],
    rule: clause.rule,
  }),
};

export const TROYAN_G4_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [REVEAL_TOP_CAST];

/** Features the lowerings of this file can name, for the dimension test. */
export const TROYAN_G4_NEEDS: readonly FeatureRef[] = [
  'effect:revealTopCast',
  'amount:manaValueOf',
  'selector:triggerSubject',
];
