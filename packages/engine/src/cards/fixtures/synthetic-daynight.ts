/**
 * SYNTHETIC double-faced cards for day and night (CR 731, 702.145): Daybound on the front face and Nightbound on the back, in two sizes.
 */
import type { CardDefinition, CardFace } from '../definition';

const face = (
  name: string,
  manaCost: readonly string[] | null,
  keyword: 'daybound' | 'nightbound',
  power: number,
  oracleText: string,
): CardFace => ({
  name,
  manaCost,
  supertypes: [],
  types: ['creature'],
  subtypes: keyword === 'daybound' ? ['Human', 'Werewolf'] : ['Werewolf'],
  colors: ['G'],
  power,
  toughness: power,
  loyalty: null,
  defense: null,
  oracleText,
  abilities: [{ kind: 'keyword', keyword: { kind: keyword } }],
  spell: null,
});

export const SYNTHETIC_DAYNIGHT_LIST: readonly CardDefinition[] = [
  {
    oracleId: null,
    name: 'SYNTHETIC Dayfang Cub // Nightfang Wolf',
    layout: 'transform',
    colorIdentity: ['G'],
    support: 'supported',
    faces: [
      face('Dayfang Cub', ['1', 'G'], 'daybound', 2, 'Daybound'),
      face('Nightfang Wolf', null, 'nightbound', 4, 'Nightbound'),
    ],
  },
  {
    oracleId: null,
    name: 'SYNTHETIC Dayfang Pup // Nightfang Hound',
    layout: 'transform',
    colorIdentity: ['G'],
    support: 'supported',
    faces: [
      face('Dayfang Pup', ['G'], 'daybound', 1, 'Daybound'),
      face('Nightfang Hound', null, 'nightbound', 3, 'Nightbound'),
    ],
  },
];
