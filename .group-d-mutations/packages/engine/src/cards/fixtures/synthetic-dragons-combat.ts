/**
 * SYNTHETIC CARDS FOR THE COMBAT OF THE DRAGONS SLICE. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-151: an additional combat phase with "untap all attacking creatures" (`extraCombat`, `untap` of each attacker), Dethrone
 * (the keyword and the condition `attackingMostLife`), "attacks for the first time each turn" (`firstTimeEachTurn`), a creature put onto the battlefield
 * tapped and attacking (`enterAttacking`) behind the condition `attackersTotalPower`, and Myriad (inert with two players). Names start with
 * "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const UNTAP_ATTACKERS: Effect = {
  kind: 'untap',
  objects: { kind: 'each', filter: { attacking: true } },
};

export const SYNTHETIC_DRAGONS_COMBAT_LIST: readonly CardDefinition[] = [
  // "Flying, haste. Whenever this creature attacks, you may pay {2}{R}. If you do, untap all attacking creatures and after this phase, there is an
  //  additional combat phase."
  singleFace({
    name: 'SYNTHETIC Charge Wyrm',
    manaCost: ['3', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 4,
    toughness: 4,
    oracleText:
      'Flying, haste\nWhenever this creature attacks, you may pay {2}{R}. If you do, untap all attacking creatures and after this phase, there is an additional combat phase.',
    abilities: [
      kw('flying'),
      kw('haste'),
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: {
          kind: 'mayPay',
          cost: [{ kind: 'mana', symbols: ['2', 'R'] }],
          effect: { kind: 'sequence', effects: [UNTAP_ATTACKERS, { kind: 'extraCombat' }] },
        },
      },
    ],
  }),
  // "Flying. Dethrone. Whenever this creature attacks for the first time each turn, if it's attacking the player with the most life or tied for most
  //  life, untap all attacking creatures. After this phase, there is an additional combat phase."
  singleFace({
    name: 'SYNTHETIC Usurper Wyrm',
    manaCost: ['4', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 5,
    toughness: 5,
    oracleText:
      "Flying\nDethrone\nWhenever this creature attacks for the first time each turn, if it's attacking the player with the most life or tied for most life, untap all attacking creatures. After this phase, there is an additional combat phase.",
    abilities: [
      kw('flying'),
      kw('dethrone'),
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' }, firstTimeEachTurn: true },
        interveningIf: { kind: 'attackingMostLife' },
        effect: { kind: 'sequence', effects: [UNTAP_ATTACKERS, { kind: 'extraCombat' }] },
      },
    ],
  }),
  // "Whenever this creature attacks, if you attacked with creatures with total power 6 or greater this combat, you may put a Dragon creature card from
  //  your hand onto the battlefield tapped and attacking."
  singleFace({
    name: 'SYNTHETIC Pack Kobold',
    manaCost: ['R'],
    types: ['creature'],
    subtypes: ['Kobold'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 0,
    toughness: 1,
    oracleText:
      'Menace\nWhenever this creature attacks, if you attacked with creatures with total power 6 or greater this combat, you may put a Dragon creature card from your hand onto the battlefield tapped and attacking.',
    abilities: [
      kw('menace'),
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        interveningIf: { kind: 'attackersTotalPower', atLeast: 6 },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'moveToZone',
              objects: {
                kind: 'choose',
                filter: {
                  zone: 'hand',
                  controller: 'you',
                  types: ['creature'],
                  subtypes: ['Dragon'],
                },
                optional: true,
              },
              to: 'battlefield',
              tapped: true,
            },
            { kind: 'enterAttacking', objects: { kind: 'moved' } },
          ],
        },
      },
    ],
  }),
  // "Flying. Myriad. Whenever this creature deals combat damage to a player, you gain 1 life." (Myriad does nothing with two players)
  singleFace({
    name: 'SYNTHETIC Echo Drake',
    manaCost: ['4', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 4,
    toughness: 3,
    oracleText: 'Flying\nMyriad',
    abilities: [kw('flying'), kw('myriad')],
  }),
];
