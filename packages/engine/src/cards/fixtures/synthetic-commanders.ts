/**
 * SYNTHETIC CARDS FOR "TARGET COMMANDER", "WITH A COUNTER ON IT" AND "THE GREATEST MANA VALUE AMONG YOUR COMMANDERS". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-145 (the Dinosaurs slice): an artifact that gives a target commander lifelink, an Equipment whose bonus is
 * the greatest mana value among its controller's commanders, and creatures whose static ability names the creatures that have a counter on
 * them (any counter, or one named kind). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not
 * Oracle text, and none of these is the definition of a real card.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOUR_CREATURES = { types: ['creature'], controller: 'you' } as const;

const lord = (name: string, ability: Ability, words: string) =>
  singleFace({
    name,
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Elf'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: words,
    abilities: [ability],
  });

export const SYNTHETIC_COMMANDER_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Commander Clinic',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}: Target commander gains lifelink until end of turn.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { types: ['creature'], commander: true } },
          },
        ],
        effect: {
          kind: 'grantKeyword',
          objects: { kind: 'target', id: 't1' },
          keyword: { kind: 'lifelink' },
          duration: 'untilEndOfTurn',
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Commander Blade',
    manaCost: ['2'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'Equipped creature gets +X/+X, where X is the greatest mana value among your commanders. Equip {1}',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'attached' },
          power: { kind: 'commanderManaValue' },
          toughness: { kind: 'commanderManaValue' },
        },
      },
      { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['1'] }] } },
    ],
  }),
  lord(
    'SYNTHETIC Counter Lord',
    {
      kind: 'static',
      static: {
        kind: 'grantAbility',
        subject: { kind: 'filter', filter: { ...YOUR_CREATURES, hasCounter: true } },
        ability: {
          kind: 'mana',
          cost: [{ kind: 'tap' }],
          production: { kind: 'fixed', mana: ['G'] },
        },
      },
    },
    'Each creature you control with a counter on it has "{T}: Add {G}."',
  ),
  lord(
    'SYNTHETIC Growth Lord',
    {
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: { kind: 'filter', filter: { ...YOUR_CREATURES, hasCounter: '+1/+1' } },
        keyword: { kind: 'flying' },
      },
    },
    'Each creature you control with a +1/+1 counter on it has flying.',
  ),
];
