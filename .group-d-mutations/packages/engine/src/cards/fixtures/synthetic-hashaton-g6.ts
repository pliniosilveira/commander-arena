/**
 * SYNTHETIC CARDS FOR PROTECTION FROM A CARD TYPE. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the Hashaton deck program, group 6 (D-376, D-377): "As this creature enters, choose a card type." (`asEntersChoose`
 * of `cardType`) and "You and creatures you control have protection from the chosen card type." (`playerProtection` and a `grantKeyword` of `protection` from
 * `chosenCardType`, CR 702.16), with sources of several card types to run it against. Names start with "SYNTHETIC "; oracleId is null. The text describes what the
 * AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const ANY_TARGET = [{ id: 't1', what: { kind: 'anyTarget' } }] as const;
const damage = (amount: number): Effect => ({
  kind: 'dealDamage',
  amount,
  to: { kind: 'target', id: 't1' },
});

/** "As this creature enters, choose a card type." */
const CHOOSE_CARD_TYPE: Ability = {
  kind: 'replacement',
  replacement: { kind: 'asEntersChoose', what: 'cardType' },
};

/** "You and creatures you control have protection from the chosen card type." */
const PROTECT_YOU: Ability = {
  kind: 'static',
  static: { kind: 'playerProtection', from: 'chosenCardType' },
};
const PROTECT_CREATURES: Ability = {
  kind: 'static',
  static: {
    kind: 'grantKeyword',
    subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
    keyword: { kind: 'protection', from: 'chosenCardType' },
  },
};

export const SYNTHETIC_HASHATON_G6_LIST: readonly CardDefinition[] = [
  // "Flying. As this creature enters, choose a card type. You and creatures you control have protection from the chosen card type." (the shape of the real card)
  singleFace({
    name: 'SYNTHETIC Warding Seraph',
    manaCost: ['3', 'W', 'W'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 4,
    toughness: 4,
    oracleText:
      'Flying. As this creature enters, choose a card type. You and creatures you control have protection from the chosen card type.',
    abilities: [kw('flying'), CHOOSE_CARD_TYPE, PROTECT_YOU, PROTECT_CREATURES],
  }),
  // "{T}: This creature deals 1 damage to any target." (a creature that is the source of an ability)
  singleFace({
    name: 'SYNTHETIC Needle Imp',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Imp'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText: '{T}: This creature deals 1 damage to any target.',
    abilities: [
      { kind: 'activated', cost: [{ kind: 'tap' }], targets: ANY_TARGET, effect: damage(1) },
    ],
  }),
  // "When this creature dies, it deals 2 damage to any target." (a source that has left the battlefield: last-known information)
  singleFace({
    name: 'SYNTHETIC Spite Imp',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Imp'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 1,
    oracleText: 'When this creature dies, it deals 2 damage to any target.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'this' } },
        targets: ANY_TARGET,
        effect: damage(2),
      },
    ],
  }),
  // An artifact creature: a source of two card types, 3/3.
  singleFace({
    name: 'SYNTHETIC Brass Golem',
    manaCost: ['4'],
    types: ['artifact', 'creature'],
    subtypes: ['Golem'],
    colors: [],
    colorIdentity: [],
    power: 3,
    toughness: 3,
    oracleText: '',
  }),
  // "{T}: This artifact deals 1 damage to any target." (an artifact that is not a creature, the source of an ability)
  singleFace({
    name: 'SYNTHETIC Brass Pinger',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}: This artifact deals 1 damage to any target.',
    abilities: [
      { kind: 'activated', cost: [{ kind: 'tap' }], targets: ANY_TARGET, effect: damage(1) },
    ],
  }),
  // "This spell deals 3 damage to any target." (a sorcery, to tell it from an instant)
  singleFace({
    name: 'SYNTHETIC Slow Burn',
    manaCost: ['2', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'This spell deals 3 damage to any target.',
    spell: { targets: ANY_TARGET, effect: damage(3) },
  }),
];
