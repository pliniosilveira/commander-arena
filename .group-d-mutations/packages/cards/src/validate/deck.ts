/**
 * Commander deck validation (CR 903.3 commander designation, 903.4 color identity, 903.5 deck
 * construction, 702.124 partner abilities). Pure and synchronous: it works on stored Scryfall data
 * only. The main deck EXCLUDES the commanders; the 100-card total includes them (CR 903.5a).
 */
import type { DeckValidation, StoredCard, ValidationIssue } from '../types';
import {
  colorIdentityOf,
  isBackground,
  isBasicLand,
  isEligibleCommander,
  offIdentityColors,
  oracleTextOf,
} from './card-facts';
import { canPair, describePairFailure } from './partner';

export interface DeckMainEntry {
  readonly card: StoredCard;
  readonly count: number;
}

export interface DeckValidationInput {
  readonly commanders: readonly StoredCard[];
  readonly main: readonly DeckMainEntry[];
}

export const COMMANDER_DECK_SIZE = 100;

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

/**
 * How many copies of a card a deck may hold, read from its Oracle text. CR 903.5b allows one copy
 * (basic lands: any number); a few cards override that with "A deck can have any number of cards
 * named ..." or "A deck can have up to N cards named ...". `unknown` means the text states a
 * limit whose number this code cannot read.
 */
export type CopyLimit = number | 'unlimited' | 'unknown';

export function copyLimitOf(card: StoredCard): CopyLimit {
  if (isBasicLand(card)) return 'unlimited';
  const text = oracleTextOf(card);
  if (/a deck can have any number of cards named/i.test(text)) return 'unlimited';
  const upTo = /a deck can have up to (\S+) cards named/i.exec(text);
  if (upTo?.[1]) {
    const word = upTo[1].toLowerCase();
    const value = /^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[word];
    return value === undefined ? 'unknown' : value;
  }
  return 1;
}

function error(code: string, message: string, cards: readonly string[] = []): ValidationIssue {
  return { severity: 'error', code, message, cards };
}

function names(cards: readonly string[]): string {
  return cards.join(', ');
}

function commanderIssues(commanders: readonly StoredCard[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (commanders.length === 0) {
    issues.push(error('commander', 'The deck has no commander (CR 903.3).'));
    return issues;
  }
  if (commanders.length > 2) {
    issues.push(
      error(
        'commander',
        `A deck has one commander, or two with a partner ability, not ${commanders.length} (CR 702.124g).`,
        commanders.map((card) => card.name),
      ),
    );
    return issues;
  }
  // A legendary Background is only a commander next to a "choose a Background" card (CR 702.124k).
  const usable = (card: StoredCard): boolean =>
    isEligibleCommander(card) || (commanders.length === 2 && isBackground(card));
  const ineligible = commanders.filter((card) => !usable(card));
  for (const card of ineligible) {
    const background = isBackground(card);
    issues.push(
      error(
        'commander',
        background
          ? `${card.name} is a Background and can be a commander only with a card that has "choose a Background" (CR 702.124k).`
          : `${card.name} cannot be a commander: it must be a legendary creature, a legendary Vehicle, a legendary Spacecraft with power/toughness, or say it can be your commander (CR 903.3).`,
        [card.name],
      ),
    );
  }
  const [first, second] = commanders;
  if (first && second && ineligible.length === 0 && !canPair(first, second)) {
    issues.push(
      error('partner', `${describePairFailure(first, second)} (CR 702.124).`, [
        first.name,
        second.name,
      ]),
    );
  }
  return issues;
}

function legalityIssues(cards: readonly StoredCard[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const by = (legality: StoredCard['commanderLegality']): string[] =>
    cards.filter((card) => card.commanderLegality === legality).map((card) => card.name);
  const banned = by('banned');
  if (banned.length > 0) {
    issues.push(error('banned', `Banned in Commander: ${names(banned)}.`, banned));
  }
  const notLegal = by('not_legal');
  if (notLegal.length > 0) {
    issues.push(error('not-legal', `Not legal in Commander: ${names(notLegal)}.`, notLegal));
  }
  const restricted = by('restricted');
  if (restricted.length > 0) {
    issues.push({
      severity: 'warning',
      code: 'restricted',
      message: `Restricted in Commander: ${names(restricted)}.`,
      cards: restricted,
    });
  }
  return issues;
}

/** Validate a Commander deck. Errors make `ok` false; warnings and info do not. */
export function validateDeck(input: DeckValidationInput): DeckValidation {
  const { commanders, main } = input;
  const issues: ValidationIssue[] = [];
  const entries = main.filter((entry) => entry.count > 0);

  // CR 903.5a: exactly 100 cards, including the commander(s).
  const total = commanders.length + entries.reduce((sum, entry) => sum + entry.count, 0);
  if (total !== COMMANDER_DECK_SIZE) {
    issues.push(
      error(
        'deck-size',
        `The deck has ${total} cards including its commander${commanders.length === 1 ? '' : 's'}; a Commander deck has exactly ${COMMANDER_DECK_SIZE} (CR 903.5a).`,
      ),
    );
  }

  issues.push(...commanderIssues(commanders));

  // CR 903.5b: singleton by English name. Commanders are deck cards, so a commander that is also
  // in the main deck is a second copy.
  const copies = new Map<string, { card: StoredCard; count: number }>();
  for (const { card, count } of [...commanders.map((card) => ({ card, count: 1 })), ...entries]) {
    const known = copies.get(card.name);
    if (known) known.count += count;
    else copies.set(card.name, { card, count });
  }
  const tooMany: string[] = [];
  const tooManyNames: string[] = [];
  const unknownLimit: string[] = [];
  for (const { card, count } of copies.values()) {
    const limit = copyLimitOf(card);
    if (limit === 'unlimited') continue;
    if (limit === 'unknown') {
      if (count > 1) unknownLimit.push(card.name);
    } else if (count > limit) {
      tooMany.push(`${card.name} (${count}, at most ${limit})`);
      tooManyNames.push(card.name);
    }
  }
  if (tooMany.length > 0) {
    issues.push(
      error(
        'singleton',
        `A Commander deck may have only one card of each name except basic lands and cards that say otherwise (CR 903.5b): ${names(tooMany)}.`,
        tooManyNames,
      ),
    );
  }
  if (unknownLimit.length > 0) {
    issues.push({
      severity: 'warning',
      code: 'singleton-unverified',
      message: `${names(unknownLimit)} state a copy limit that could not be read, so the number of copies was not checked.`,
      cards: unknownLimit,
    });
  }

  // CR 903.4, 903.5c, 903.5d: every card fits inside the commanders' combined color identity.
  const identity = colorIdentityOf(commanders);
  const offIdentity: string[] = [];
  const detail: string[] = [];
  for (const { card } of copies.values()) {
    const off = offIdentityColors(card, identity);
    if (off.length > 0) {
      offIdentity.push(card.name);
      detail.push(`${card.name} (${off.join('')})`);
    }
  }
  if (commanders.length > 0 && offIdentity.length > 0) {
    issues.push(
      error(
        'color-identity',
        `Outside the commander's color identity (${identity.join('') || 'colorless'}): ${names(detail)} (CR 903.5c, 903.5d).`,
        offIdentity,
      ),
    );
  }

  const allCards = [...copies.values()].map((entry) => entry.card);
  issues.push(...legalityIssues(allCards));

  const gameChangers = allCards.filter((card) => card.gameChanger === true).map((c) => c.name);
  if (gameChangers.length > 0) {
    issues.push({
      severity: 'info',
      code: 'game-changers',
      message: `${gameChangers.length} Game Changer${gameChangers.length === 1 ? '' : 's'}: ${names(gameChangers)}. Pods use this count as a hint when agreeing on a bracket.`,
      cards: gameChangers,
    });
  }

  return { ok: !issues.some((issue) => issue.severity === 'error'), issues };
}

/**
 * The cards among `cards` that may be a commander on their own (CR 903.3), for the "pick your
 * commander" list. Backgrounds are left out: they need a "choose a Background" partner.
 */
export function eligibleCommanders(cards: readonly StoredCard[]): StoredCard[] {
  return cards.filter((card) => isEligibleCommander(card));
}
