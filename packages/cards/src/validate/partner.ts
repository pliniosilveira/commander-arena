/**
 * Partner abilities (CR 702.124 Partner): which two cards may be designated as commanders together.
 * Abilities are read from the front face's Oracle text with reminder text removed; Scryfall's
 * `keywords` list backs up the unambiguous variants. Different partner abilities cannot be
 * combined (CR 702.124f) and a card with several may use one of them (CR 702.124g).
 */
import type { StoredCard } from '../types';
import { frontFace, frontType, isBackground, isEligibleCommander, isLegendary } from './card-facts';

export type PartnerAbility =
  /** CR 702.124h (partner): both cards have plain partner. */
  | { readonly kind: 'partner' }
  /** CR 702.124j (partner with [name]): each names the other. */
  | { readonly kind: 'partner-with'; readonly name: string }
  /** CR 702.124i (partner--[text]): both have the same text, for example `friends forever`. */
  | { readonly kind: 'partner-text'; readonly text: string }
  /** CR 702.124k (choose a Background). */
  | { readonly kind: 'background' }
  /** CR 702.124m (Doctor's companion). */
  | { readonly kind: 'doctors-companion' };

function stripReminder(line: string): string {
  return line.replace(/\([^)]*\)/g, '').trim();
}

/** The partner abilities printed on a card's front face. */
export function partnerAbilitiesOf(card: StoredCard): PartnerAbility[] {
  const face = frontFace(card);
  const found: PartnerAbility[] = [];
  const lines = (face?.oracleText ?? '').split('\n').map(stripReminder);
  for (const line of lines) {
    const withName = /^partner with\s+(.+)$/i.exec(line);
    const withText = /^partner\s*[—–-]\s*(.+)$/i.exec(line);
    if (withName?.[1]) found.push({ kind: 'partner-with', name: withName[1].trim() });
    else if (withText?.[1]) {
      found.push({ kind: 'partner-text', text: withText[1].trim().toLowerCase() });
    } else if (/^partner$/i.test(line)) found.push({ kind: 'partner' });
    else if (/^choose a background$/i.test(line)) found.push({ kind: 'background' });
    else if (/^doctor['’]s companion$/i.test(line)) found.push({ kind: 'doctors-companion' });
    else if (/^friends forever$/i.test(line)) {
      found.push({ kind: 'partner-text', text: 'friends forever' });
    }
  }
  const has = (predicate: (ability: PartnerAbility) => boolean): boolean => found.some(predicate);
  const keywords = card.keywords.map((keyword) => keyword.toLowerCase());
  if (keywords.includes('choose a background') && !has((a) => a.kind === 'background')) {
    found.push({ kind: 'background' });
  }
  if (keywords.includes("doctor's companion") && !has((a) => a.kind === 'doctors-companion')) {
    found.push({ kind: 'doctors-companion' });
  }
  if (keywords.includes('friends forever') && !has((a) => a.kind === 'partner-text')) {
    found.push({ kind: 'partner-text', text: 'friends forever' });
  }
  return found;
}

function namesCard(name: string, card: StoredCard): boolean {
  const wanted = name.toLowerCase();
  return (
    card.name.toLowerCase() === wanted ||
    card.faces.some((face) => face.name.toLowerCase() === wanted)
  );
}

/** CR 702.124m: a legendary Time Lord Doctor creature card that has no other creature types. */
function isTimeLordDoctor(card: StoredCard): boolean {
  const { types, subtypes } = frontType(card);
  return (
    types.includes('Legendary') &&
    types.includes('Creature') &&
    subtypes.length === 3 && // `Time Lord` is one subtype, `Doctor` another; no others
    subtypes.includes('Time') &&
    subtypes.includes('Lord') &&
    subtypes.includes('Doctor')
  );
}

/** Does this one ability of `a` accept `b`? Directional for Background and Doctor's companion. */
function abilityAccepts(
  ability: PartnerAbility,
  a: StoredCard,
  b: StoredCard,
  abilitiesB: readonly PartnerAbility[],
): boolean {
  switch (ability.kind) {
    case 'partner':
      return abilitiesB.some((y) => y.kind === 'partner');
    case 'partner-with':
      return (
        namesCard(ability.name, b) &&
        abilitiesB.some((y) => y.kind === 'partner-with' && namesCard(y.name, a))
      );
    case 'partner-text':
      return abilitiesB.some((y) => y.kind === 'partner-text' && y.text === ability.text);
    case 'background':
      return isBackground(b);
    case 'doctors-companion':
      return isTimeLordDoctor(b);
  }
}

function pairsWith(a: StoredCard, b: StoredCard): boolean {
  const abilitiesB = partnerAbilitiesOf(b);
  return partnerAbilitiesOf(a).some((ability) => abilityAccepts(ability, a, b, abilitiesB));
}

/**
 * Can these two cards be designated as the two commanders (CR 702.124a)? Both must be legendary;
 * a non-Background card must also be eligible by itself (CR 903.3). A card never pairs with
 * another copy of itself (CR 903.5b singleton).
 */
export function canPair(a: StoredCard, b: StoredCard): boolean {
  if (a.name === b.name) return false;
  // A Background is only ever a commander next to a "choose a Background" card (CR 702.124k):
  // that is the only ability whose partner test accepts a Background, so no extra rule is needed.
  const mayBeCommander = (card: StoredCard): boolean =>
    isLegendary(card) && (isEligibleCommander(card) || isBackground(card));
  if (!mayBeCommander(a) || !mayBeCommander(b)) return false;
  return pairsWith(a, b) || pairsWith(b, a);
}

/** Every unordered pair among `cards` that may be commanders together (CR 702.124). */
export function legalPartnerPairs(
  cards: readonly StoredCard[],
): readonly (readonly [StoredCard, StoredCard])[] {
  const pairs: (readonly [StoredCard, StoredCard])[] = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i];
      const b = cards[j];
      if (a && b && canPair(a, b)) pairs.push([a, b]);
    }
  }
  return pairs;
}

/** A short reason why two otherwise eligible cards cannot be paired, for error messages. */
export function describePairFailure(a: StoredCard, b: StoredCard): string {
  const kinds = (card: StoredCard): string => {
    const list = partnerAbilitiesOf(card).map((ability) =>
      ability.kind === 'partner-with'
        ? `partner with ${ability.name}`
        : ability.kind === 'partner-text'
          ? `partner--${ability.text}`
          : ability.kind === 'doctors-companion'
            ? "Doctor's companion"
            : ability.kind === 'background'
              ? 'choose a Background'
              : 'partner',
    );
    if (isBackground(card)) list.push('is a Background');
    return list.length > 0 ? list.join(', ') : 'no partner ability';
  };
  return `${a.name} (${kinds(a)}) and ${b.name} (${kinds(b)}) are not a legal commander pair`;
}
