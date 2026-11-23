/**
 * SYNTHETIC CARDS FOR MANA THAT CAN'T PAY GENERIC MANA COSTS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of `ManaAbility.spendOnly.notGeneric` (CR 106.6): a rock with "{T}: Add {W}{U}{B}{R}{G}. This mana can't be spent to pay generic mana costs." and
 * sorceries whose costs are all colored, all generic, mixed, hybrid with a generic side, or have an {X}. Names start with "SYNTHETIC "; oracleId is null. The text describes
 * what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const gain = (amount: number) => ({
  effect: { kind: 'gainLife' as const, player: { kind: 'you' as const }, amount },
});

export const SYNTHETIC_MANA_NOT_GENERIC_LIST: readonly CardDefinition[] = [
  // "{T}: Add {W}{U}{B}{R}{G}. This mana can't be spent to pay generic mana costs."
  singleFace({
    name: 'SYNTHETIC Prism Rock',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: ['W', 'U', 'B', 'R', 'G'],
    oracleText: "{T}: Add {W}{U}{B}{R}{G}. This mana can't be spent to pay generic mana costs.",
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['W', 'U', 'B', 'R', 'G'] },
        spendOnly: { notGeneric: true },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Rainbow Sorcery',
    manaCost: ['W', 'U', 'B', 'R', 'G'],
    types: ['sorcery'],
    colors: ['W', 'U', 'B', 'R', 'G'],
    colorIdentity: ['W', 'U', 'B', 'R', 'G'],
    oracleText: 'You gain 5 life.',
    spell: gain(5),
  }),
  singleFace({
    name: 'SYNTHETIC Colorless Sorcery',
    manaCost: ['5'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: 'You gain 2 life.',
    spell: gain(2),
  }),
  singleFace({
    name: 'SYNTHETIC Mixed Sorcery',
    manaCost: ['2', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'You gain 3 life.',
    spell: gain(3),
  }),
  singleFace({
    name: 'SYNTHETIC Twobrid Sorcery',
    manaCost: ['2/W', '2/U', '2/B', '2/R', '2/G'],
    types: ['sorcery'],
    colors: ['W', 'U', 'B', 'R', 'G'],
    colorIdentity: ['W', 'U', 'B', 'R', 'G'],
    oracleText: 'You gain 4 life.',
    spell: gain(4),
  }),
];
