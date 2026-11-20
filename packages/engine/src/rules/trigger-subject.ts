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
  // CR 603.3d: so does a target filter that reads the triggering object ("with mana value less than or equal to that spell's mana value").
  const effects = JSON.stringify([ability.effect, ability.modes ?? [], ability.targets ?? []]);
  if (effects.includes('"triggerSubject"') || effects.includes('"triggerCard"')) return true;
  // CR 400.7, 603.10a (Puca's Covenant): "another target permanent card" leaves out the card the permanent that died became, read as the targets are chosen and checked again.
  if (effects.includes('"notTriggerCard"') || effects.includes('"otherThanTriggerSubject"'))
    return true;
  // CR 603.10a, 608.2h (Auntie Ool): "draw a card if you control that creature" reads the permanent the trigger is about, as the ability resolves.
  if (effects.includes('"subjectControlledByYou"') || effects.includes('"subjectStat"'))
    return true;
  // D-654 (CR 603.10a): "for each Aura you controlled that was attached to it" reads the Auras of the creature the trigger is about, from its last-known information.
  if (effects.includes('"aurasAttachedToTriggerSubject"')) return true;
  // CR 107.3, 113.7a (Quandrix Unlimited group E): "put X +1/+1 counters" of a cast trigger reads the X of the spell that was cast, as the ability resolves.
  if (effects.includes('"triggerSpellX"')) return true;
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
    // Massacre Girl: the toughness the creature that died had, read again as the ability resolves.
    condition.includes('"subjectStat"') ||
    condition.includes('"subjectControlledByYou"') ||
    // Galadriel group 1: the creature the Ring tempted its controller to choose, read again as the ability resolves.
    condition.includes('"ringBearerChosen"') ||
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
      // Issue 159: "each opponent attacking that player" reads the player the trigger is about.
      JSON.stringify(ability.effect).includes('"opponentsAttackingTriggerPlayer"') ||
      JSON.stringify(ability.interveningIf ?? null).includes('"triggerPlayerHasMore"'))
  );
}

/** Whether the triggered ability reads `triggerDamage` ("that much", D-133). */
export function readsTriggerDamage(ability: Ability): boolean {
  return (
    ability.kind === 'triggered' &&
    (JSON.stringify([ability.effect, ability.modes ?? [], ability.targets ?? []]).includes(
      '"triggerDamage"',
    ) ||
      // Issue 81 (Shark Typhoon): the X of the cycling cost travels with the trigger as the number of its event.
      JSON.stringify([ability.effect, ability.modes ?? []]).includes('"triggerCycleX"') ||
      JSON.stringify([ability.effect, ability.modes ?? []]).includes('"triggerAttackerCount"'))
  );
}

/** Whether the triggered ability reads the creatures its attack event declared (`attackersGreatestPower`, CR 508.1). */
export function readsTriggerAttackers(ability: Ability): boolean {
  return (
    ability.kind === 'triggered' &&
    JSON.stringify([ability.effect, ability.modes ?? [], ability.targets ?? []]).includes(
      '"attackersGreatestPower"',
    )
  );
}

/** Whether the triggered ability reads whom its attack event was declared at (`attackersAttackedYou`, D-149). */
export function readsTriggerAttacked(ability: Ability): boolean {
  return (
    ability.kind === 'triggered' &&
    (JSON.stringify([ability.effect, ability.modes ?? [], ability.interveningIf ?? null]).includes(
      '"attackersAttackedYou"',
    ) ||
      // D-648: "that opponent", the player the declaration attacked: kept with the trigger as it goes on the stack.
      JSON.stringify([ability.effect, ability.modes ?? [], ability.interveningIf ?? null]).includes(
        '"triggerAttackedPlayer"',
      ) ||
      // D-643: the intervening "if" reads whom each creature attacked, as the ability triggers and again as it resolves.
      JSON.stringify(ability.interveningIf ?? null).includes('"attackersAtYouAtLeast"') ||
      // D-648: the intervening "if" reads the player attacked, as the ability triggers and again as it resolves.
      JSON.stringify(ability.interveningIf ?? null).includes(
        '"attackedHasMoreLifeThanOtherOpponent"',
      ))
  );
}
