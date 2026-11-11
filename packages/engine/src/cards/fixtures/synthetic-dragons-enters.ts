/**
 * SYNTHETIC CARDS FOR WHAT A PERMANENT DOES AS IT ENTERS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-151 (the Dragons slice): "As this enchantment enters, choose Khans or Dragons. Khans - At the beginning of your upkeep, exile
 * the top card of your library. Until end of turn, you may play that card. Dragons - Whenever a creature you control leaves the battlefield, this
 * enchantment deals 1 damage to any target." (`asEntersChoose` of `option` and the linked abilities with `chosenOption`). Names start with "SYNTHETIC ";
 * oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;

export const SYNTHETIC_DRAGONS_ENTERS_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Siege of Choices',
    manaCost: ['3', 'R'],
    types: ['enchantment'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'As this enchantment enters, choose Khans or Dragons. Khans - At the beginning of your upkeep, exile the top card of your library. Until end of turn, you may play that card. Dragons - Whenever a creature you control leaves the battlefield, this enchantment deals 1 damage to any target.',
    abilities: [
      {
        kind: 'replacement',
        replacement: { kind: 'asEntersChoose', what: 'option', options: ['Khans', 'Dragons'] },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        triggerCondition: { kind: 'chosenOption', option: 'Khans' },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exileTop', count: 1 },
            { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
          ],
        },
      },
      {
        kind: 'triggered',
        trigger: {
          kind: 'leavesBattlefield',
          what: { types: ['creature'], controller: 'you' },
        },
        triggerCondition: { kind: 'chosenOption', option: 'Dragons' },
        targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
        effect: { kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 't1' } },
      },
    ],
  }),
  // "As this artifact enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has haste."
  singleFace({
    name: 'SYNTHETIC Cursed Looking Glass',
    manaCost: ['2', 'R', 'R'],
    types: ['artifact'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'As this artifact enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has haste.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'entersAsCopy',
          what: { types: ['creature'] },
          optional: true,
          duration: 'untilEndOfTurn',
          gains: [{ kind: 'haste' }],
        },
      },
    ],
  }),
  // "When this creature enters, you gain 3 life." (what a copy of it does as it enters)
  singleFace({
    name: 'SYNTHETIC Gleeful Ogre',
    manaCost: ['3', 'G'],
    types: ['creature'],
    subtypes: ['Ogre'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 4,
    toughness: 4,
    oracleText: 'When this creature enters, you gain 3 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'gainLife', player: YOU, amount: 3 },
      },
    ],
  }),
];
