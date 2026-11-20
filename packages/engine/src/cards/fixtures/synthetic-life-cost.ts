/**
 * SYNTHETIC card for "Rather than pay the mana cost of the next spell you cast this turn, you may pay life equal to that spell's mana value" (`nextSpellPayLife`, Marshland Bloodcaster,
 * issue 190). Name starts with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and it is not the definition of the real card (the real one is
 * read from the golden corpus by the grammar and has the same ability).
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_LIFE_COST_LIST: readonly CardDefinition[] = [
  // "{T}: Rather than pay the mana cost of the next spell you cast this turn, you may pay life equal to that spell's mana value." (a 1/1)
  singleFace({
    name: 'SYNTHETIC Life Caster',
    manaCost: ['B'],
    types: ['creature'],
    subtypes: ['Vampire'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText:
      "{T}: Rather than pay the mana cost of the next spell you cast this turn, you may pay life equal to that spell's mana value.",
    abilities: [
      { kind: 'activated', cost: [{ kind: 'tap' }], effect: { kind: 'nextSpellPayLife' } },
    ],
  }),
];
