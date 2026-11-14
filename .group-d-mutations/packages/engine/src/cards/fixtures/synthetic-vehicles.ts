/**
 * SYNTHETIC VEHICLES. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of Vehicles and Crew (CR 301.7, 702.122). Names start with "SYNTHETIC ";
 * oracleId is null. The text describes what the AST does; it is not Oracle text, and none of
 * these copies a real card. A Vehicle prints a power and toughness but has them only while it is a
 * creature (CR 301.7a), which is the one thing a crew ability changes.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const crew = (power: number): Ability => ({ kind: 'keyword', keyword: { kind: 'crew', power } });

export const SYNTHETIC_VEHICLE_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Rattle Wagon',
    manaCost: ['3'],
    types: ['artifact'],
    subtypes: ['Vehicle'],
    colors: [],
    colorIdentity: [],
    power: 4,
    toughness: 4,
    oracleText: 'Crew 3',
    abilities: [crew(3)],
  }),
  singleFace({
    name: 'SYNTHETIC Scout Skiff',
    manaCost: ['1'],
    types: ['artifact'],
    subtypes: ['Vehicle'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: 'Flying. Crew 1',
    abilities: [kw('flying'), crew(1)],
  }),
  singleFace({
    name: 'SYNTHETIC Dread Barge',
    manaCost: ['5'],
    types: ['artifact'],
    subtypes: ['Vehicle'],
    colors: [],
    colorIdentity: [],
    power: 6,
    toughness: 5,
    oracleText: 'Trample. Crew 4',
    abilities: [kw('trample'), crew(4)],
  }),
];
