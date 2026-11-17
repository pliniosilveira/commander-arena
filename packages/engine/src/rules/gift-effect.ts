import type { Effect, Keyword } from '../ast/types';

export type GiftKind = Extract<Keyword, { kind: 'gift' }>['gift'];

/** Effect for a promised gift, shared by spell resolution and permanent enters triggers. */
export function effectForGift(gift: GiftKind): Effect {
  if (gift === 'card') {
    return { kind: 'draw', player: { kind: 'giftRecipient' }, count: 1 };
  }

  return {
    kind: 'createToken',
    token: {
      kind: 'custom',
      definition: {
        name: 'Fish',
        manaCost: null,
        supertypes: [],
        types: ['creature'],
        subtypes: ['Fish'],
        colors: ['U'],
        power: 1,
        toughness: 1,
        loyalty: null,
        defense: null,
        oracleText: '',
        abilities: [],
      },
    },
    count: 1,
    controller: { kind: 'giftRecipient' },
    tapped: true,
  };
}
