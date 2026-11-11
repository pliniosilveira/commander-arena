/**
 * SYNTHETIC CARDS FOR "IF YOU CONTROL THE <FILTER> WITH THE GREATEST <STAT> OR TIED". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-139 (the Artifacts slice): an upkeep trigger whose intervening "if" is the condition
 * `controlsGreatest`, over several filters and stats (the artifact with the greatest mana value, the creature with the greatest power,
 * the creature with the greatest toughness, the Goblin with the greatest power), plus plain artifacts of a chosen mana value and
 * creatures of a chosen power and toughness for the boards of the tests. Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Condition, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const keeper = (
  name: string,
  filter: ObjectFilter,
  stat: 'power' | 'toughness' | 'manaValue',
  words: string,
): CardDefinition => {
  const condition: Condition = { kind: 'controlsGreatest', filter, stat };
  return singleFace({
    name,
    manaCost: ['1', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: `At the beginning of your upkeep, if you control ${words}, draw a card.`,
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        interveningIf: condition,
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ],
  });
};

/** An artifact whose mana value is `value`: its cost is that much generic mana. */
const trinket = (value: number): CardDefinition =>
  singleFace({
    name: `SYNTHETIC Trinket ${value}`,
    manaCost: [String(value)],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
  });

/** A creature with the given power and toughness and creature type. */
const brute = (power: number, toughness: number, type: string): CardDefinition =>
  singleFace({
    name: `SYNTHETIC ${type} ${power}/${toughness}`,
    manaCost: ['1'],
    types: ['creature'],
    subtypes: [type],
    colors: [],
    colorIdentity: [],
    power,
    toughness,
    oracleText: '',
  });

export const SYNTHETIC_GREATEST_LIST: readonly CardDefinition[] = [
  keeper(
    'SYNTHETIC Artifact Keeper',
    { types: ['artifact'] },
    'manaValue',
    'the artifact with the greatest mana value or tied for the greatest mana value',
  ),
  keeper(
    'SYNTHETIC Power Keeper',
    { types: ['creature'] },
    'power',
    'the creature with the greatest power or tied for the greatest power',
  ),
  keeper(
    'SYNTHETIC Toughness Keeper',
    { types: ['creature'] },
    'toughness',
    'the creature with the greatest toughness or tied for the greatest toughness',
  ),
  keeper(
    'SYNTHETIC Goblin Keeper',
    { types: ['creature'], subtypes: ['Goblin'] },
    'power',
    'the Goblin with the greatest power or tied for the greatest power',
  ),
  trinket(1),
  trinket(2),
  trinket(4),
  brute(1, 1, 'Goblin'),
  brute(2, 5, 'Goblin'),
  brute(4, 1, 'Goblin'),
  brute(3, 3, 'Elf'),
  brute(5, 2, 'Elf'),
];
