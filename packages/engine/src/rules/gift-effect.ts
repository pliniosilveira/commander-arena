/**
 * What each kind of gift gives (CR 702.174d to 702.174i), shared by the resolution of an instant or sorcery (`rules/stack.ts`) and the enters trigger of a
 * permanent (`rules/derive-keywords.ts`). "The chosen player" is `giftRecipient`.
 */
import type { Effect, Keyword, TokenDefinition } from '../ast/types';

export type GiftKind = Extract<Keyword, { kind: 'gift' }>['gift'];

const RECIPIENT = { kind: 'giftRecipient' } as const;

/** A vanilla blue creature token of one creature type, named after its type (CR 111.4). */
function blueCreatureToken(subtype: string, power: number, toughness: number): TokenDefinition {
  return {
    name: subtype,
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: [subtype],
    colors: ['U'],
    power,
    toughness,
    loyalty: null,
    defense: null,
    oracleText: '',
    abilities: [],
  };
}

/** Effect for a promised gift, shared by spell resolution and permanent enters triggers. */
export function effectForGift(gift: GiftKind): Effect {
  switch (gift) {
    case 'card':
      // CR 702.174e: "The chosen player draws a card."
      return { kind: 'draw', player: RECIPIENT, count: 1 };
    case 'tappedFish':
      // CR 702.174f: "The chosen player creates a tapped 1/1 blue Fish creature token."
      return {
        kind: 'createToken',
        token: { kind: 'custom', definition: blueCreatureToken('Fish', 1, 1) },
        count: 1,
        controller: RECIPIENT,
        tapped: true,
      };
    case 'octopus':
      // CR 702.174i: "The chosen player creates an 8/8 blue Octopus creature token."
      return {
        kind: 'createToken',
        token: { kind: 'custom', definition: blueCreatureToken('Octopus', 8, 8) },
        count: 1,
        controller: RECIPIENT,
      };
    case 'extraTurn':
      // CR 702.174g: "The chosen player takes an extra turn after this one."
      return { kind: 'extraTurn', player: RECIPIENT };
    default: {
      const unreachable: never = gift;
      return unreachable;
    }
  }
}
