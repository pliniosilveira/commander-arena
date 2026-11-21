/**
 * The words that name the players an effect or a condition is about (D-131): "you", "each player", "you and
 * target opponent each", "its controller". Read from the `PlayerSelector`, never from a card name. Pure.
 */
import type { PlayerSelector } from '@commander-arena/engine';

/** A subject as a sentence says it: lower case, and whether the verb after it stays in the plural form. */
export interface Subject {
  readonly text: string;
  /** True when the verb keeps its base form ("you draw", "you and target opponent each draw"). */
  readonly base: boolean;
}

/**
 * "you", "each player", "its controller", "target opponent", "you and target opponent each". `target` words
 * a target slot by its id ("target opponent"); a condition has none and passes a function that says so.
 */
export function playerSubject(
  player: PlayerSelector,
  target: (id: string) => string = () => 'target player',
): Subject {
  switch (player.kind) {
    case 'you':
      return { text: 'you', base: true };
    case 'eachPlayer':
      return { text: 'each player', base: false };
    case 'eachOpponent':
      return { text: 'each opponent', base: false };
    case 'eachOtherOpponent':
      // D-151: the opponents besides the player of the event.
      return { text: 'each other opponent', base: false };
    case 'eachPlayerExcept':
      // CR 102.1: every player but the ones `except` names ("its owner draws ... and each other player loses ...").
      return { text: 'each other player', base: false };
    case 'eachPlayerControlling':
      // CR 102.1: the players with a battlefield permanent of a kind ("each player who controls a creature with power 4 or greater").
      return { text: 'each player who controls one', base: false };
    case 'controllerOf':
      return { text: 'its controller', base: false };
    case 'ownerOf':
      return { text: 'its owner', base: false };
    case 'target': {
      // D-486: "any number of target players each lose 2 life": the slot says "any number of", the verb keeps its base form.
      const text = target(player.id);
      return text.startsWith('any number of target players')
        ? { text: `${text} each`, base: true }
        : { text, base: false };
    }
    case 'defendingPlayer':
      // CR 508.5, 702.86a (Annihilator): "defending player sacrifices two permanents".
      return { text: 'the defending player', base: false };
    case 'playerToYourRight':
      // Hithlain Rope: the previous player in turn order.
      return { text: 'the player to your right', base: false };
    case 'chosenPlayer':
      // The Black Gate: the player "Choose a player with the most life or tied for most life" chose.
      return { text: 'that player', base: false };
    case 'triggerPlayer':
      // D-133: the player the event that caused the trigger is about.
      return { text: 'that player', base: false };
    case 'triggerAttackedPlayer':
      // D-648 (CR 508.6): the player attacked, "that opponent" of "whenever a player attacks one of your opponents".
      return { text: 'that opponent', base: false };
    case 'opponentsAttackingTriggerPlayer':
      // Issue 159 (CR 508.6): "each opponent attacking that player".
      return { text: 'each opponent attacking that player', base: false };
    case 'triggerDamagedPlayers':
      // CR 603.2c: the opponents a batch of sources damaged.
      return { text: 'each of those opponents', base: false };
    case 'declinedPlayer':
      // D-576: a player who declined a choice, named in its `otherwise` effect.
      return { text: 'the player who declined', base: false };
    case 'giftRecipient':
      // CR 702.174a (D-135): the opponent the gift was promised to.
      return { text: 'the chosen player', base: false };
    case 'discardedThisWay':
      // D-210 (CR 701.9): "each player who discarded a card this way draws a card".
      return { text: 'each player who discarded a card this way', base: false };
    case 'couldntSacrificeThisWay':
      // CR 701.21a: "each player who can't discards a card" after a sacrifice.
      return { text: "each player who can't", base: false };
    case 'attackedPlayers':
      // D-269 (CR 508.6): "each player this creature attacked this turn loses the game".
      return { text: 'each player this creature attacked this turn', base: false };
    case 'combatDamagedByNamed':
      // CR 120.2a: "each opponent dealt combat damage this game by a creature named X loses life".
      return {
        text: `each opponent dealt combat damage this game by a creature named ${player.name}`,
        base: false,
      };
    case 'all':
      // "You and target opponent each draw": every member named once, then "each".
      return {
        text: `${player.of.map((member) => playerSubject(member, target).text).join(' and ')} each`,
        base: true,
      };
  }
}

const capital = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** "You draw", "Each player sacrifices", "You and target opponent each draw": the subject and its verb, capitalised. */
export function subjectVerb(
  player: PlayerSelector,
  verb: string,
  target?: (id: string) => string,
): string {
  const subject = playerSubject(player, target);
  return capital(`${subject.text} ${subject.base ? verb : `${verb}s`}`);
}

/** True when the selector names more than one player at a time, whose choices come in turn order (CR 101.4). */
export function namesSeveral(player: PlayerSelector): boolean {
  return player.kind === 'eachPlayer' || player.kind === 'eachOpponent' || player.kind === 'all';
}
