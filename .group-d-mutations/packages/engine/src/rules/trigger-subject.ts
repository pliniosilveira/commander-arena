/**
 * Triggered abilities that read the object whose event caused them (`triggerSubject`): Ward counts
 * the spell or ability that targeted its permanent, a copying trigger the permanent that entered, and
 * Evolve's intervening "if" the creature that entered (D-120). Only those abilities carry the subject on
 * the stack (`StackData.triggerSubject`) and take it into the identity of their triggers
 * (rules/trigger-stack.ts), so every other triggered ability looks and behaves exactly as before.
 */
import type { Ability } from '../ast/types';

/** Whether the triggered ability's effect names the `triggerSubject` object reference. */
export function readsTriggerSubject(ability: Ability): boolean {
  if (ability.kind !== 'triggered') return false;
  // A modal ability keeps its effects in the modes (D-114).
  const effects = JSON.stringify([ability.effect, ability.modes ?? []]);
  if (effects.includes('"triggerSubject"') || effects.includes('"triggerCard"')) return true;
  // CR 601.2h, 608.2c: "If five or more mana was spent to cast that spell, ... instead" is a condition of the effect, read as the effect resolves from the spell that
  // caused the trigger, so the subject stays on the stack as it does for the intervening "if" below.
  if (effects.includes('"manaSpentAtLeast"')) return true;
  // D-196: the Ring's sacrifice at end of combat is about the creature that blocked the Ring-bearer.
  if (ability.effect.kind === 'delayedSacrifice' && ability.effect.of !== 'this') return true;
  // CR 702.100a (D-120): the intervening "if" of Evolve compares the creature that entered with the source,
  // as it triggers and again as the ability resolves, so the subject stays on the stack.
  // CR 601.2h, 603.4 (D-206): the intervening "if" of Sahagin reads the mana spent on the spell that caused the trigger, again as the ability resolves.
  const condition = JSON.stringify(ability.interveningIf ?? null);
  // D-229: the intervening "if" of Archaeomancer's Map reads the controller of the land that entered, again as the ability resolves.
  return (
    condition.includes('"subjectGreaterPt"') ||
    condition.includes('"manaSpentAtLeast"') ||
    condition.includes('"subjectControllerHasMore"')
  );
}

/** Whether the triggered ability reads `triggerPlayer` ("that player", D-133). */
export function readsTriggerPlayer(ability: Ability): boolean {
  return (
    ability.kind === 'triggered' &&
    // The intervening "if" `triggerPlayerHasMore` reads the player as the ability triggers and again as it resolves, so the player stays on the stack.
    (JSON.stringify([ability.effect, ability.modes ?? [], ability.targets ?? []]).includes(
      '"triggerPlayer"',
    ) ||
      JSON.stringify(ability.interveningIf ?? null).includes('"triggerPlayerHasMore"'))
  );
}

/** Whether the triggered ability reads `triggerDamage` ("that much", D-133). */
export function readsTriggerDamage(ability: Ability): boolean {
  return (
    ability.kind === 'triggered' &&
    JSON.stringify([ability.effect, ability.modes ?? [], ability.targets ?? []]).includes(
      '"triggerDamage"',
    )
  );
}

/** Whether the triggered ability reads whom its attack event was declared at (`attackersAttackedYou`, D-149). */
export function readsTriggerAttacked(ability: Ability): boolean {
  return (
    ability.kind === 'triggered' &&
    JSON.stringify([ability.effect, ability.modes ?? [], ability.interveningIf ?? null]).includes(
      '"attackersAttackedYou"',
    )
  );
}
