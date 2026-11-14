/**
 * The words of the conditions that read the game (D-131), composed from the `Condition` AST: "if you're the
 * monarch", "if an opponent is the monarch", "if the total power of creatures you control is 8 or greater",
 * "if the number of creature cards in your graveyard is 3 or greater". A condition the words do not cover
 * gives `null` and the caller leaves the sentence out, never guessing at it (AGENTS.md "Honesty"). Pure.
 */
import type {
  CombatStep,
  Condition,
  NumberComparison,
  PlayerSelector,
  PlayerStat,
} from '@commander-arena/engine';
import { type AmountContext, amountPhrase, UNKNOWN_AMOUNT } from './amount-text';
import { angelsConditionWords } from './angels-conditions';
import { otherAttachedWords, thisEnteredWords } from './attachment-text';
import { dragonsConditionWords } from './dragons-conditions';
import { thingsPhrase } from './filter-text';
import { playerSubject } from './player-text';
import { filterPhrase } from './trigger-text';

/** "8 or greater", "3 or less", "5": the right-hand side of a comparison. */
function comparisonWords(compare: NumberComparison, negate: boolean): string {
  if (!negate) {
    const tail =
      compare.cmp === 'atLeast' ? ' or greater' : compare.cmp === 'atMost' ? ' or less' : '';
    return `${compare.value}${tail}`;
  }
  // "is not 8 or greater" reads "is less than 8".
  switch (compare.cmp) {
    case 'atLeast':
      return `less than ${compare.value}`;
    case 'atMost':
      return `greater than ${compare.value}`;
    case 'equal':
      return `not ${compare.value}`;
  }
}

/** "you're the monarch", "an opponent is the monarch", "you're not the monarch": a player holding a designation. */
function designationWords(
  player: PlayerSelector,
  designation: string,
  negate: boolean,
): string | null {
  // Several selectors at once ("you or an opponent") have no sentence of their own here: left out, not guessed.
  if (player.kind === 'all') return null;
  // The city's blessing (CR 702.131c, D-264) is had, not "been": "you have the city's blessing".
  const blessing = designation === 'citysBlessing';
  if (player.kind === 'you') {
    return blessing
      ? `you ${negate ? "don't have" : 'have'} the city's blessing`
      : `you're ${negate ? 'not ' : ''}the ${designation}`;
  }
  // "if an opponent is the monarch": a condition about the opponents asks whether any of them is.
  const who =
    player.kind === 'eachOpponent'
      ? 'an opponent'
      : player.kind === 'eachPlayer'
        ? 'a player'
        : playerSubject(player).text;
  return blessing
    ? `${who} ${negate ? "doesn't have" : 'has'} the city's blessing`
    : `${who} ${negate ? 'is not' : 'is'} the ${designation}`;
}

const OPPONENT_AHEAD: Readonly<Record<PlayerStat, string>> = {
  life: 'an opponent has more life than you',
  cardsInHand: 'an opponent has more cards in hand than you',
  creatures: 'an opponent controls more creatures than you',
  lands: 'an opponent controls more lands than you',
};

/** "you control a Zombie", "you control 3 or more artifacts", "you don't control a Zombie" (D-133). */
function controlsWords(
  condition: Extract<Condition, { kind: 'controlsAtLeast' }>,
  negate: boolean,
): string | null {
  const { filter, count } = condition;
  if (filter.controller !== 'you' && filter.controller !== undefined) return null;
  const things = thingsPhrase({ ...filter, controller: 'you' }, count !== 1);
  // D-145: what the permanents have comes after "you control" ("another creature with power 4 or greater").
  const at = things === null ? -1 : things.indexOf(' you control');
  if (things === null || at < 0) return null;
  const what = things.slice(0, at);
  const tail = things.slice(at + ' you control'.length);
  if (count === 1) {
    const noun = what.startsWith('other ')
      ? `another ${what.slice('other '.length)}`
      : /^[aeiou]/i.test(what)
        ? `an ${what}`
        : `a ${what}`;
    return `you ${negate ? "don't control" : 'control'} ${noun}${tail}`;
  }
  return negate
    ? `you control fewer than ${count} ${what}${tail}`
    : `you control ${count} or more ${what}${tail}`;
}

/**
 * "an opponent controls 4 or more nonbasic lands", "an opponent controls a creature" (D-135): some one opponent
 * controls that many matching permanents.
 */
function opponentControlsWords(
  condition: Extract<Condition, { kind: 'opponentControlsAtLeast' }>,
  negate: boolean,
): string | null {
  const { filter, count } = condition;
  if (filter.controller !== undefined && filter.controller !== 'opponent') return null;
  const things = thingsPhrase({ ...filter, controller: 'opponent' }, count !== 1);
  const tail = ' an opponent controls';
  if (things === null || !things.endsWith(tail)) return null;
  const what = things.slice(0, -tail.length);
  if (count === 1) {
    const noun = /^[aeiou]/i.test(what) ? `an ${what}` : `a ${what}`;
    return negate ? `no opponent controls ${noun}` : `an opponent controls ${noun}`;
  }
  return negate
    ? `no opponent controls ${count} or more ${what}`
    : `an opponent controls ${count} or more ${what}`;
}

/**
 * "it's a Zombie card", "it isn't a creature card" (D-135, CR 608.2c): the card an earlier instruction moved, or the
 * target, against a filter that describes the object and not where it is.
 */
function matchesWords(
  condition: Extract<Condition, { kind: 'objectMatches' }>,
  negate: boolean,
): string | null {
  const { filter } = condition;
  // D-179: "as long as this Equipment is attached to a creature": the permanent the ability belongs to.
  if (condition.of.kind === 'attached') {
    const host = filterPhrase(filter, 'permanent');
    return host === null ? null : `this permanent ${negate ? "isn't" : 'is'} attached to ${host}`;
  }
  const phrase = filterPhrase(filter, 'card');
  if (phrase === null) return null;
  const card = filter.types !== undefined && !phrase.endsWith(' card') ? `${phrase} card` : phrase;
  // D-149: "if that land is a Plains": the permanent that triggered the ability, not a card an instruction moved.
  if (condition.of.kind === 'triggerSubject') {
    const named = filterPhrase(filter, 'permanent')?.replace(/ permanent$/, '') ?? null;
    return named === null ? null : `that permanent ${negate ? "isn't" : 'is'} ${named}`;
  }
  // D-412 (CR 608.2c): "If you put a Town card into your hand this way": the card an earlier instruction put into the hand.
  if (condition.inZone === 'hand') {
    return `you ${negate ? "don't put" : 'put'} ${card} into your hand this way`;
  }
  if (condition.inZone === 'exile') {
    return `${negate ? `no ${card.replace(/^an? /, '')}` : card} is exiled this way`;
  }
  return `it ${negate ? "isn't" : 'is'} ${card}`.replace(/^it is /, "it's ");
}

/** "you have 30 or more life", "you have at least 7 life more than your starting life total" (CR 119.1, D-133). */
function lifeWords(condition: Extract<Condition, { kind: 'lifeTotal' }>, negate: boolean): string {
  const { compare, aboveStarting } = condition;
  if (condition.player === 'opponent' && negate) {
    return lifeWords(condition, false).replace(/^an opponent has /, 'no opponent has ');
  }
  const who = condition.player === 'opponent' ? 'an opponent has' : 'you have';
  const bound = {
    atLeast: negate ? 'less than' : 'at least',
    atMost: negate ? 'more than' : 'at most',
    equal: negate ? 'other than' : 'exactly',
  }[compare.cmp];
  if (aboveStarting === true) {
    return `${who} ${bound} ${compare.value} life more than your starting life total`;
  }
  // "30 or more life" reads better than "at least 30 life" when the life total itself is compared.
  if (!negate && compare.cmp !== 'equal') {
    return `${who} ${compare.value} or ${compare.cmp === 'atLeast' ? 'more' : 'less'} life`;
  }
  return `${who} ${bound} ${compare.value} life`;
}

/** "it's untapped", "it's a Zombie creature": the permanent the condition belongs to against a filter (D-133). */
function thisWords(
  condition: Extract<Condition, { kind: 'thisMatches' }>,
  negate: boolean,
): string | null {
  const { tapped, ...rest } = condition.filter;
  if (tapped !== undefined && Object.keys(rest).length === 0) {
    const state = tapped !== negate ? 'tapped' : 'untapped';
    return `it's ${state}`;
  }
  const phrase = filterPhrase(condition.filter);
  return phrase === null ? null : `it ${negate ? "isn't" : 'is'} ${phrase}`;
}

/** The steps of the combat phase (CR 506.1) as the cards name them: "the declare attackers step". */
export const COMBAT_STEP_WORDS: Readonly<Record<CombatStep, string>> = {
  beginningOfCombat: 'beginning of combat step',
  declareAttackers: 'declare attackers step',
  declareBlockers: 'declare blockers step',
  firstStrikeDamage: 'first-strike combat damage step',
  combatDamage: 'combat damage step',
  endOfCombat: 'end of combat step',
};

const STAT_NAMES = { power: 'power', toughness: 'toughness', manaValue: 'mana value' } as const;

/**
 * "you control the artifact with the greatest mana value or tied for the greatest mana value" (D-139): the
 * filter names one permanent of a kind, whoever controls it, so it is read without a controller.
 */
function greatestWords(
  condition: Extract<Condition, { kind: 'controlsGreatest' }>,
  negate: boolean,
): string | null {
  const thing = filterPhrase(condition.filter);
  if (thing === null || condition.filter.controller !== undefined) return null;
  const noun = thing.replace(/^an? /, '');
  const stat = STAT_NAMES[condition.stat];
  return `you ${negate ? "don't control" : 'control'} the ${noun} with the greatest ${stat} or tied for the greatest ${stat}`;
}

/** The words of "one or more" of what a `thisWay` count counts (D-358): "if you discarded an instant or sorcery card this way". */
const THIS_WAY_WORDS: Readonly<Record<string, { readonly yes: string; readonly not: string }>> = {
  discardedInstantOrSorcery: {
    yes: 'you discarded an instant or sorcery card this way',
    not: "you didn't discard an instant or sorcery card this way",
  },
  discardedCreature: {
    yes: 'a creature card was discarded this way',
    not: 'no creature card was discarded this way',
  },
  discardedNoncreature: {
    yes: 'a noncreature card was discarded this way',
    not: 'no noncreature card was discarded this way',
  },
  sacrificed: {
    yes: 'a permanent was sacrificed this way',
    not: 'no permanent was sacrificed this way',
  },
  sacrificedOwn: {
    yes: 'you sacrificed a permanent this way',
    not: "you didn't sacrifice a permanent this way",
  },
};

function wordsOf(condition: Condition, negate: boolean, ctx: AmountContext): string | null {
  switch (condition.kind) {
    case 'controlsAtLeast':
      return controlsWords(condition, negate);
    case 'controlCommander': {
      const commander = condition.yours === true ? 'your commander' : 'a commander';
      return `you ${negate ? "don't control" : 'control'} ${commander}`;
    }
    case 'lifeTotal':
      return lifeWords(condition, negate);
    case 'thisMatches':
      return thisWords(condition, negate);
    case 'opponentControlsAtLeast':
      return opponentControlsWords(condition, negate);
    case 'objectMatches':
      return matchesWords(condition, negate);
    case 'didPrevious':
      // CR 608.2c (D-135): "you may discard a card. If you do, draw a card."
      return negate ? "you don't" : 'you do';
    case 'thisWayAtLeast': {
      // CR 608.2c (D-210, D-358): what the instructions before this one did. Only one or more of the kinds the cards say are worded; any other count is left out.
      if (condition.count !== 1) return null;
      const words = THIS_WAY_WORDS[condition.what];
      if (words === undefined) return null;
      return negate ? words.not : words.yes;
    }
    case 'sacrificedAsCost':
      // CR 118.8, 603.4 (D-491): the intervening "if" of the cast trigger of a spell whose additional cost may sacrifice any number of creatures.
      return negate
        ? "you didn't sacrifice a permanent to cast it"
        : 'you sacrificed one or more permanents to cast it';
    case 'giftPromised':
      // CR 702.174k (D-135): "if the gift was promised".
      return negate ? "the gift wasn't promised" : 'the gift was promised';
    case 'thisEnteredThisTurn':
      // D-427 (CR 400.7): "as long as this permanent entered this turn".
      return thisEnteredWords(negate);
    case 'amountIs': {
      // D-427 (CR 303.4, 301.5): "another Aura is attached to the permanent this is attached to".
      const other = otherAttachedWords(condition, negate);
      if (other !== null) return other;
      // "if an opponent has more life than you": at least one opponent is ahead (D-131).
      if (
        !negate &&
        typeof condition.amount === 'object' &&
        condition.amount.kind === 'opponentsWithMore' &&
        condition.compare.cmp === 'atLeast' &&
        condition.compare.value === 1
      ) {
        return OPPONENT_AHEAD[condition.amount.stat];
      }
      const amount = amountPhrase(condition.amount, ctx);
      return amount === UNKNOWN_AMOUNT
        ? null
        : `${amount} is ${comparisonWords(condition.compare, negate)}`;
    }
    case 'playerHasDesignation':
      return designationWords(condition.player, condition.designation, negate);
    case 'controlsGreatest':
      return greatestWords(condition, negate);
    case 'ownTurnNumber':
    case 'sameNameAtLeast':
    case 'attackersAttackedYou':
      // D-149: "it's your fourth turn or later", "you control 3 or more lands with the same name", "none of those creatures attacked you".
      return angelsConditionWords(condition, negate);
    case 'enteredThisTurn':
    case 'playerDealtDamage':
    case 'combatDamagedBy':
    case 'chosenOption':
    case 'attackingMostLife':
    case 'attackersTotalPower':
      // D-151: "two or more nonland permanents entered the battlefield under your control this turn", "Khans was chosen".
      return dragonsConditionWords(condition, negate);
    case 'spellsCastThisTurn':
      // D-318 (CR 601.2i): "you've cast three or more spells this turn".
      // D-444: "you've cast an instant or sorcery spell this turn", "you've cast two or more creature spells this turn".
      if (condition.ofTypes !== undefined) {
        const kinds = condition.ofTypes.join(' or ');
        const have = negate ? "haven't" : 'have';
        return condition.atLeast === 1
          ? `you ${have} cast ${/^[aeiou]/u.test(kinds) ? 'an' : 'a'} ${kinds} spell this turn`
          : `you ${have} cast ${condition.atLeast} or more ${kinds} spells this turn`;
      }
      return `you ${negate ? "haven't" : 'have'} cast ${condition.atLeast} or more spells this turn`;
    case 'lifeGainedThisTurn':
      // D-252, D-363 (CR 119.3, 603.4): "if you gained life this turn" (at least 1), "if you gained 3 or more life this turn".
      if (condition.atLeast <= 1) return `you ${negate ? "didn't gain" : 'gained'} life this turn`;
      return negate
        ? `you haven't gained ${condition.atLeast} or more life this turn`
        : `you gained ${condition.atLeast} or more life this turn`;
    case 'duringStep':
      // D-139 (CR 506.1): "if it's the declare attackers step".
      return `it's ${negate ? 'not ' : ''}the ${COMBAT_STEP_WORDS[condition.step]}`;
    case 'paired':
      // D-286 (CR 702.95b): "as long as this creature is paired with another creature".
      return `this creature ${negate ? "isn't" : 'is'} paired with another creature`;
    case 'soulbondReady':
      // D-286 (CR 702.95a, 603.4): the intervening "if" of the two abilities soulbond stands for.
      // One statement is negated as a whole ("it's not the case that ..."): "you don't control both ... and both aren't unpaired" would say something else.
      return `${negate ? "it's not the case that " : ''}you control both ${
        condition.with === 'another'
          ? 'this creature and another creature'
          : 'that creature and this one'
      } and both are unpaired`;
    case 'controlsRingBearer':
      // D-196 (CR 701.54e): "if you control your Ring-bearer".
      return `you ${negate ? "don't control" : 'control'} your Ring-bearer`;
    case 'subjectControllerHasMore':
      // D-229 (CR 603.4): "if that player controls more lands than you".
      return `that player ${negate ? "doesn't control" : 'controls'} more ${condition.stat === 'lands' ? 'lands' : condition.stat === 'creatures' ? 'creatures' : 'cards'} than you`;
    case 'triggerPlayerHasMore':
      // "if that player controls more creatures than you" (CR 603.4): the player the event is about.
      return `that player ${negate ? "doesn't control" : 'controls'} more ${condition.stat === 'lands' ? 'lands' : condition.stat === 'creatures' ? 'creatures' : 'cards'} than you`;
    case 'cardsInGraveyard': {
      // D-229 (CR 404.1): "there are fewer than eight cards in your graveyard".
      const { cmp, value } = condition.compare;
      const text =
        cmp === 'atMost'
          ? `there are fewer than ${value + 1} cards in your graveyard`
          : cmp === 'atLeast'
            ? `there are ${value} or more cards in your graveyard`
            : `there are exactly ${value} cards in your graveyard`;
      return negate ? `it's not true that ${text}` : text;
    }
    case 'cardsInLibrary': {
      // D-331 (CR 401.1): "there are no cards in your library".
      const { cmp, value } = condition.compare;
      const text =
        cmp === 'atMost'
          ? value === 0
            ? 'there are no cards in your library'
            : `there are fewer than ${value + 1} cards in your library`
          : cmp === 'atLeast'
            ? `there are ${value} or more cards in your library`
            : `there are exactly ${value} cards in your library`;
      return negate ? `it's not true that ${text}` : text;
    }
    case 'yourTurn':
      // D-206 (CR 611.3a): "during your turn".
      return negate ? "it's not your turn" : "it's your turn";
    case 'yourMainPhase':
      // D-187 (CR 505.1): "if it's your main phase".
      return `it's ${negate ? 'not ' : ''}your main phase`;
    case 'dieResult': {
      // D-271 (CR 706.2, 706.3a): "if the result is 1", "if the result is 4 or more".
      const { cmp, value } = condition.compare;
      const text =
        cmp === 'atLeast'
          ? `the result is ${value} or more`
          : cmp === 'atMost'
            ? `the result is ${value} or less`
            : `the result is ${value}`;
      return negate ? `it's not true that ${text}` : text;
    }
    case 'ownsAndControlsNamed': {
      // D-278 (CR 701.42a, 603.4): "if you both own and control this creature and a creature named Bruna, the Fading Light".
      const text = `you both own and control this permanent and a ${condition.type} named ${condition.name}`;
      return negate ? `it's not true that ${text}` : text;
    }
    case 'thisInYourGraveyard':
      // D-271 (CR 113.6b, 603.4): "if this card is in your graveyard".
      return `this card is ${negate ? 'not ' : ''}in your graveyard`;
    case 'cardLeftYourGraveyard':
      // D-206 (CR 400.7): "if a card left your graveyard this turn".
      return negate
        ? 'no card left your graveyard this turn'
        : 'a card left your graveyard this turn';
    case 'manaSpentAtLeast':
      // D-206 (CR 601.2h): "if at least four mana was spent to cast it".
      return `${negate ? 'fewer than' : 'at least'} ${condition.count} mana was spent to cast it`;
    case 'castFromZone':
      // D-206 (CR 601.2a): "if this spell was cast from a graveyard".
      return `this spell was ${negate ? 'not ' : ''}cast from ${condition.zone === 'graveyard' ? 'a graveyard' : `its ${condition.zone}`}`;
    case 'not':
      return wordsOf(condition.term, !negate, ctx);
    case 'and':
    case 'or': {
      // De Morgan: "not (a and b)" is "not a or not b".
      const joiner = (condition.kind === 'and') !== negate ? ' and ' : ' or ';
      const parts = condition.terms.map((term) => wordsOf(term, negate, ctx));
      return parts.some((part) => part === null) ? null : parts.join(joiner);
    }
    default:
      return null;
  }
}

/** The condition as the words after "if": null for any shape these words do not cover. */
export function gameConditionWords(condition: Condition, ctx: AmountContext = {}): string | null {
  return wordsOf(condition, false, ctx);
}
