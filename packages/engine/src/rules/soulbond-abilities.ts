/**
 * The two triggered abilities soulbond stands for (CR 702.95a, D-286): the engine builds them for a creature with the keyword (`rules/derive-keywords.ts`);
 * no card carries them. Apart from `rules/soulbond.ts` so that `derive` can read them without a cycle (that file reads `derive`).
 */
import type { TriggeredAbility } from '../state/types';

/**
 * CR 702.95a: "When this creature enters, if you control both this creature and another creature and both are unpaired, you may pair this creature with
 * another unpaired creature you control for as long as both remain creatures on the battlefield under your control."
 */
export const SOULBOND_ENTERS_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  interveningIf: { kind: 'soulbondReady', with: 'another' },
  effect: { kind: 'pair', partner: 'choose' },
};

/**
 * CR 702.95a: "Whenever another creature you control enters, if you control both that creature and this one and both are unpaired, you may pair that
 * creature with this creature for as long as both remain creatures on the battlefield under your control."
 */
export const SOULBOND_OTHER_ENTERS_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: {
    kind: 'entersBattlefield',
    what: { types: ['creature'], controller: 'you', other: true },
  },
  interveningIf: { kind: 'soulbondReady', with: 'triggerSubject' },
  effect: { kind: 'pair', partner: 'triggerSubject' },
};

/** The text each soulbond ability shows on the stack: the words of CR 702.95a. */
export const SOULBOND_TEXT: Readonly<Record<'enters' | 'otherEnters', string>> = {
  enters:
    'When this creature enters, if you control both this creature and another creature and both are unpaired, you may pair this creature with another unpaired creature you control for as long as both remain creatures on the battlefield under your control.',
  otherEnters:
    'Whenever another creature you control enters, if you control both that creature and this one and both are unpaired, you may pair that creature with this creature for as long as both remain creatures on the battlefield under your control.',
};
