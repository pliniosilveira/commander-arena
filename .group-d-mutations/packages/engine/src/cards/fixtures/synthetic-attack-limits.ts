/**
 * SYNTHETIC CARDS FOR "CAN'T ATTACK" AND "CAN'T ATTACK OR BLOCK UNLESS ...". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-145 (the Dinosaurs slice): creatures that can't attack or block (or only attack, or only block) unless a
 * condition holds (the static `restrictionUnless`), an Aura that stops its creature attacking and a spell that stops one creature
 * attacking this turn (the restriction `cantAttack`). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST
 * does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Condition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const unlessCreature = (
  name: string,
  restrictions: readonly ('cantAttack' | 'cantBlock')[],
  unless: Condition,
  words: string,
): CardDefinition =>
  singleFace({
    name,
    manaCost: ['3', 'G'],
    types: ['creature'],
    subtypes: ['Elemental'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 3,
    toughness: 3,
    oracleText: words,
    abilities: [
      {
        kind: 'static',
        static: { kind: 'restrictionUnless', subject: { kind: 'this' }, restrictions, unless },
      },
    ],
  });

export const SYNTHETIC_ATTACK_LIMIT_LIST: readonly CardDefinition[] = [
  unlessCreature(
    'SYNTHETIC Shy Colossus',
    ['cantAttack', 'cantBlock'],
    {
      kind: 'controlsAtLeast',
      filter: { types: ['creature'], other: true, power: { cmp: 'atLeast', value: 4 } },
      count: 1,
    },
    "This creature can't attack or block unless you control another creature with power 4 or greater.",
  ),
  unlessCreature(
    'SYNTHETIC Landbound Guard',
    ['cantBlock'],
    { kind: 'controlsAtLeast', filter: { types: ['land'] }, count: 2 },
    "This creature can't block unless you control two or more lands.",
  ),
  unlessCreature(
    'SYNTHETIC Healthy Charger',
    ['cantAttack'],
    { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 30 } },
    "This creature can't attack unless you have 30 or more life.",
  ),
  singleFace({
    name: 'SYNTHETIC Grounding Aura',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: "Enchant creature. Enchanted creature can't attack.",
    abilities: [
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      {
        kind: 'static',
        static: { kind: 'restriction', subject: { kind: 'attached' }, restriction: 'cantAttack' },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Calm Down',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: "Target creature can't attack this turn.",
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
      effect: {
        kind: 'restrict',
        objects: { kind: 'target', id: 't1' },
        restriction: 'cantAttack',
        duration: 'untilEndOfTurn',
      },
    },
  }),
];
