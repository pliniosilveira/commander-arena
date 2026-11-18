/**
 * SYNTHETIC EXERT CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of Exert (CR 701.43): "You may exert ~ as it attacks" (the `exertOnAttack` static ability, an optional cost to attack, CR 701.43d, 508.1g)
 * and the abilities linked to it, "When you do, ..." (the `exerted` trigger, CR 607.2h, 603.12). Names start with "SYNTHETIC "; oracleId is null. The text describes
 * what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const NON_DRAGON_OPPONENT_CREATURE = {
  id: 't1',
  what: {
    kind: 'object',
    filter: {
      zone: 'battlefield',
      types: ['creature'],
      controller: 'opponent',
      notSubtypes: ['Dragon'],
    },
  },
} as const;

export const SYNTHETIC_EXERT_LIST: readonly CardDefinition[] = [
  // "Flying, haste. You may exert this creature as it attacks. When you do, it deals 4 damage to target non-Dragon creature an opponent controls."
  singleFace({
    name: 'SYNTHETIC Exert Wyrm',
    manaCost: ['3', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 4,
    toughness: 4,
    oracleText:
      'Flying, haste\nYou may exert this creature as it attacks. When you do, it deals 4 damage to target non-Dragon creature an opponent controls.',
    abilities: [
      kw('flying'),
      kw('haste'),
      { kind: 'static', static: { kind: 'exertOnAttack' } },
      {
        kind: 'triggered',
        trigger: { kind: 'exerted' },
        targets: [NON_DRAGON_OPPONENT_CREATURE],
        effect: {
          kind: 'dealDamage',
          amount: 4,
          to: { kind: 'target', id: 't1' },
        },
      },
    ],
  }),
  // "Vigilance. You may exert this creature as it attacks. When you do, you gain 3 life." A creature with vigilance is not tapped by attacking, but exerting it
  // still keeps it from untapping, which only matters once it is tapped by something else.
  singleFace({
    name: 'SYNTHETIC Exert Guard',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Soldier'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 3,
    oracleText:
      'Vigilance\nYou may exert this creature as it attacks. When you do, you gain 3 life.',
    abilities: [
      kw('vigilance'),
      { kind: 'static', static: { kind: 'exertOnAttack' } },
      {
        kind: 'triggered',
        trigger: { kind: 'exerted' },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
      },
    ],
  }),
];
