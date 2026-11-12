/**
 * SYNTHETIC CARDS FOR SOULBOND AND PAIRING. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-286 (CR 702.95, soulbond): the keyword on its own, the shape of the second line of the Bruna deck's creature (a static ability, "as
 * long as this creature is paired with another creature, each of those creatures has ..."), and the other things a pair can give through the same subject and
 * condition (a keyword, power and toughness, a condition on one creature). The names start with "SYNTHETIC "; oracleId is null. The texts describe what the
 * AST does; they are not Oracle text, and these are not the definitions of real cards.
 */
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';
import { DIES_RETURN_ABILITY } from './synthetic-dies-return';

export const SYNTHETIC_SOULBOND_LIST: readonly CardDefinition[] = [
  // "Soulbond"
  singleFace({
    name: 'SYNTHETIC Soulbound Squire',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Soldier'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText: 'Soulbond',
    abilities: [kw('soulbond')],
  }),
  // "Flying, soulbond. As long as this creature is paired with another creature, each of those creatures has 'When this creature dies, you may return it to
  //  the battlefield under its owner's control at the beginning of your next upkeep.'"
  singleFace({
    name: 'SYNTHETIC Soulbound Seraph',
    manaCost: ['4', 'W', 'W'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 4,
    toughness: 4,
    oracleText:
      'Flying, soulbond\nAs long as this creature is paired with another creature, each of those creatures has "When this creature dies, you may return it to the battlefield under its owner\'s control at the beginning of your next upkeep."',
    abilities: [
      kw('flying'),
      kw('soulbond'),
      {
        kind: 'static',
        static: { kind: 'grantAbility', subject: { kind: 'pair' }, ability: DIES_RETURN_ABILITY },
        condition: { kind: 'paired' },
      },
    ],
  }),
  // "Soulbond. As long as this creature is paired with another creature, both creatures get +2/+2." (a layer 7 effect through the pair subject)
  singleFace({
    name: 'SYNTHETIC Soulbound Giant',
    manaCost: ['3', 'G'],
    types: ['creature'],
    subtypes: ['Giant'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 3,
    toughness: 3,
    oracleText:
      'Soulbond\nAs long as this creature is paired with another creature, each of those creatures gets +2/+2.',
    abilities: [
      kw('soulbond'),
      {
        kind: 'static',
        static: { kind: 'modifyPt', subject: { kind: 'pair' }, power: 2, toughness: 2 },
        condition: { kind: 'paired' },
      },
    ],
  }),
  // "Soulbond. As long as this creature is paired with another creature, each of those creatures has flying." (a granted keyword through the pair subject)
  singleFace({
    name: 'SYNTHETIC Soulbound Glider',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Bird'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 1,
    oracleText:
      'Soulbond\nAs long as this creature is paired with another creature, each of those creatures has flying.',
    abilities: [
      kw('soulbond'),
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: { kind: 'pair' }, keyword: { kind: 'flying' } },
        condition: { kind: 'paired' },
      },
    ],
  }),
  // "As long as this creature is paired with another creature, it has lifelink." (the condition on one creature: the pair is made by another creature's soulbond)
  singleFace({
    name: 'SYNTHETIC Bonded Hound',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Dog'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText: 'As long as this creature is paired with another creature, it has lifelink.',
    abilities: [
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: { kind: 'this' }, keyword: { kind: 'lifelink' } },
        condition: { kind: 'paired' },
      },
    ],
  }),
];
