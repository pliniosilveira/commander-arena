/**
 * The companion deck check (SPEC 5.8, CR 702.139): may this card be the companion of this deck? Pure and synchronous, on stored Scryfall data only, like `validateDeck`.
 *
 * - CR 702.139a: only a card with a companion ability whose condition is fulfilled by the starting deck can be revealed as a companion.
 * - CR 702.139b: in a Commander game the starting deck is the deck before the commander(s) are set aside, so the commanders count as cards of it.
 * - House rules (SPEC 5.8, not in the CR): the companion must be within the commanders' combined color identity, and a card banned as a companion in Commander is refused.
 * - At most one companion (the decklist may name only one, SPEC 6.1).
 *
 * The mana symbols of a card are those of its mana cost (CR 202.1), read from the stored mana cost string of the faces that count, as follows (CR 709.4b, 712.8a, 715.4):
 * - A split card (layout `split`: split, fuse, aftermath, Room) has the combined mana costs of its two halves, and an effect that looks at the symbols sees the separate symbols
 *   (CR 709.4b: Fire // Ice has {1} twice).
 * - Every other layout counts the FRONT face only: a double-faced card outside the battlefield and the stack has only its front face (CR 712.8a, modal or not), and an adventurer
 *   card has only its normal characteristics (CR 715.4). A flip card, a prepare card and the like are read the same way; the CR text of those layouts was not checked for this
 *   (a limit: a layout this code does not know is read by its front face).
 * - A symbol is compared as printed ({X}{X} and {R/G}{R/G} are repeats, the ruling of Jegantha), except that a hybrid or Phyrexian symbol is the same symbol whichever way its
 *   parts are written ({R/G} and {G/R}).
 */
import type { CompanionCondition } from '@commander-arena/engine';
import type { ColorLetter, StoredCard, ValidationIssue } from '../types';
import { colorIdentityOf, offIdentityColors } from './card-facts';
import { isBannedCompanion } from './companion-banned';
import { companionConditionOf, hasCompanionAbility } from './companion-conditions';

export interface CompanionCheckInput {
  /** The card chosen as the companion (from outside the game, not one of the 100 cards). */
  readonly companion: StoredCard;
  /** The commander(s) of the deck. */
  readonly commanders: readonly StoredCard[];
  /** The main deck WITHOUT the commanders, with counts. */
  readonly main: readonly { readonly card: StoredCard; readonly count: number }[];
}

function error(code: string, message: string, cards: readonly string[] = []): ValidationIssue {
  return { severity: 'error', code, message, cards };
}

/** A symbol as printed, upper case: `{r/g}` is `{R/G}`. */
function printedSymbol(symbol: string): string {
  return symbol.toUpperCase();
}

/** The key two symbols are compared by: a hybrid or Phyrexian symbol is the same symbol whichever way its parts are written, so `{G/R}` and `{R/G}` share a key. */
function symbolKey(symbol: string): string {
  return symbol.slice(1, -1).split('/').sort().join('/');
}

/** The mana symbols of a card's mana cost, one entry per printed symbol (CR 202.1, 709.4b); see the file comment for the faces that count. */
export function manaSymbolsOf(card: StoredCard): string[] {
  const faces = card.layout === 'split' ? card.faces : card.faces.slice(0, 1);
  return faces.flatMap((face) => (face.manaCost.match(/\{[^{}]+\}/g) ?? []).map(printedSymbol));
}

/** The symbols a card's mana cost has more than once (empty when it has none twice), as first printed, in the order they first repeat. */
export function repeatedManaSymbols(card: StoredCard): string[] {
  const firstPrinted = new Map<string, string>();
  const repeated: string[] = [];
  for (const symbol of manaSymbolsOf(card)) {
    const key = symbolKey(symbol);
    const first = firstPrinted.get(key);
    if (first === undefined) firstPrinted.set(key, symbol);
    else if (!repeated.includes(first)) repeated.push(first);
  }
  return repeated;
}

/** The cards of the starting deck that break the condition, each with what breaks it. */
function violations(
  condition: CompanionCondition,
  startingDeck: readonly StoredCard[],
): { name: string; detail: string }[] {
  switch (condition.kind) {
    case 'noRepeatedManaSymbol':
      return startingDeck.flatMap((card) => {
        const repeated = repeatedManaSymbols(card);
        return repeated.length === 0 ? [] : [{ name: card.name, detail: repeated.join('') }];
      });
  }
}

/** The reason a card is not an allowed companion of the deck; empty when it is. */
export function companionIssues(input: CompanionCheckInput): ValidationIssue[] {
  const { companion, commanders, main } = input;
  const issues: ValidationIssue[] = [];

  if (!hasCompanionAbility(companion)) {
    issues.push(
      error(
        'companion-ability',
        `${companion.name} cannot be the companion: it has no companion ability (CR 702.139a).`,
        [companion.name],
      ),
    );
    return issues;
  }

  if (isBannedCompanion(companion.name) || companion.commanderLegality === 'banned') {
    issues.push(
      error('companion-banned', `${companion.name} is banned as a companion in Commander.`, [
        companion.name,
      ]),
    );
  } else if (companion.commanderLegality === 'not_legal') {
    issues.push(
      error('companion-banned', `${companion.name} is not legal in Commander.`, [companion.name]),
    );
  }

  // House rule (SPEC 5.8): within the commanders' combined color identity.
  if (commanders.length > 0) {
    const identity = colorIdentityOf(commanders);
    const off: ColorLetter[] = offIdentityColors(companion, identity);
    if (off.length > 0) {
      issues.push(
        error(
          'companion-color-identity',
          `${companion.name} is outside the commander's color identity (${identity.join('') || 'colorless'}): ${off.join('')}. A companion must fit it.`,
          [companion.name],
        ),
      );
    }
  }

  const condition = companionConditionOf(companion);
  if (condition === null) {
    issues.push(
      error(
        'companion-condition-unsupported',
        `${companion.name} has a companion condition this game cannot check yet, so it cannot be chosen as a companion.`,
        [companion.name],
      ),
    );
    return issues;
  }

  // CR 702.139b: the starting deck includes the commander(s).
  const startingDeck = [...commanders, ...main.filter((e) => e.count > 0).map((e) => e.card)];
  const broken = violations(condition, startingDeck);
  if (broken.length > 0) {
    issues.push(
      error(
        'companion-condition',
        `The deck does not fulfill the companion condition of ${companion.name} (CR 702.139a, 702.139b): ${broken.map((b) => `${b.name} (${b.detail})`).join(', ')}. The commander${commanders.length === 1 ? ' counts' : 's count'} as part of the deck.`,
        broken.map((b) => b.name),
      ),
    );
  }
  return issues;
}

/** The companions named by a decklist, checked for the one-companion limit and then each against the deck. */
export function companionsIssues(
  companions: readonly StoredCard[],
  deck: Omit<CompanionCheckInput, 'companion'>,
): ValidationIssue[] {
  if (companions.length > 1) {
    return [
      error(
        'companion-count',
        `A deck can have only one companion, not ${companions.length}.`,
        companions.map((c) => c.name),
      ),
    ];
  }
  const [only] = companions;
  return only === undefined ? [] : companionIssues({ ...deck, companion: only });
}
