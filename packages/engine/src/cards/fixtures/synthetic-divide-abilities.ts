/**
 * SYNTHETIC CARDS FOR DIVIDED DAMAGE IN ABILITIES AND FOR READING THE TRIGGERING SPELL. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of damage divided as an ability is put on the stack (CR 601.2d, 602.2b, 603.3d: `TargetSpec.divide` of a triggered or an activated
 * ability), of a target filter that reads the mana value of the spell that caused a cast trigger (`ObjectFilter.manaValueAtMost` with `manaValueOf` of the
 * `triggerSubject`) and of the condition `objectMatches` of that spell (its power, toughness or mana value). Names start with "SYNTHETIC "; oracleId is null.
 * The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Effect, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const THIS = { kind: 'this' } as const;
const CREATURE_OR_WALKER: ObjectFilter = {
  anyOf: [{ types: ['creature'] }, { types: ['planeswalker'] }],
  controller: 'opponent',
};
const DEAL: Effect = { kind: 'dealDividedDamage', to: T1 };

export const SYNTHETIC_DIVIDE_ABILITIES_LIST: readonly CardDefinition[] = [
  // "When this creature enters, it deals 5 damage divided as you choose among any number of target creatures and/or planeswalkers your opponents control."
  singleFace({
    name: 'SYNTHETIC Divided Enterer',
    manaCost: ['5', 'R'],
    types: ['creature'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 6,
    toughness: 6,
    oracleText:
      'When this creature enters, it deals 5 damage divided as you choose among any number of target creatures and/or planeswalkers your opponents control.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        targets: [
          { id: 't1', what: { kind: 'object', filter: CREATURE_OR_WALKER }, divide: { total: 5 } },
        ],
        effect: DEAL,
      },
    ],
  }),
  // "{3}{R}: This creature deals 2 damage divided as you choose among one or two targets. Activate only if this creature has a +1/+1 counter on it."
  singleFace({
    name: 'SYNTHETIC Divided Pinger',
    manaCost: ['3', 'R'],
    types: ['creature'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 3,
    oracleText:
      '{3}{R}: This creature deals 2 damage divided as you choose among one or two targets. Activate only if this creature has a +1/+1 counter on it.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['3', 'R'] }],
        targets: [{ id: 't1', what: { kind: 'anyTarget' }, min: 1, max: 2, divide: { total: 2 } }],
        effect: DEAL,
        activateOnlyIf: { kind: 'sourceHasCounter', counter: '+1/+1' },
      },
    ],
  }),
  // "Whenever you cast a spell, return up to one target nonland permanent an opponent controls with mana value less than or equal to that spell's mana value to its
  // owner's hand."
  singleFace({
    name: 'SYNTHETIC Spell Bouncer',
    manaCost: ['4', 'U'],
    types: ['creature'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 4,
    toughness: 4,
    oracleText:
      "Whenever you cast a spell, return up to one target nonland permanent an opponent controls with mana value less than or equal to that spell's mana value to its owner's hand.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', by: 'you', filter: { stackKind: 'spell' } },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: {
                notTypes: ['land'],
                controller: 'opponent',
                manaValueAtMost: { kind: 'manaValueOf', of: { kind: 'triggerSubject' } },
              },
            },
            min: 0,
            max: 1,
          },
        ],
        effect: { kind: 'moveToZone', objects: T1, to: 'hand' },
      },
    ],
  }),
  // "Whenever you cast a creature spell, put a +1/+1 counter on this creature. If that spell's power is 4 or greater, draw a card. If that spell's power is 6 or
  // greater, this creature deals damage equal to its power to each opponent."
  singleFace({
    name: 'SYNTHETIC Cast Counter',
    manaCost: ['G', 'U', 'R'],
    types: ['creature'],
    colors: ['U', 'R', 'G'],
    colorIdentity: ['U', 'R', 'G'],
    power: 2,
    toughness: 2,
    oracleText:
      "Whenever you cast a creature spell, put a +1/+1 counter on this creature. If that spell's power is 4 or greater, draw a card. If that spell's power is 6 or greater, this creature deals damage equal to its power to each opponent.",
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          by: 'you',
          filter: { types: ['creature'], stackKind: 'spell' },
        },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'addCounters', objects: THIS, counter: '+1/+1', count: 1 },
            {
              kind: 'conditional',
              condition: {
                kind: 'objectMatches',
                of: { kind: 'triggerSubject' },
                filter: { power: { cmp: 'atLeast', value: 4 } },
              },
              effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
            },
            {
              kind: 'conditional',
              condition: {
                kind: 'objectMatches',
                of: { kind: 'triggerSubject' },
                filter: { power: { cmp: 'atLeast', value: 6 } },
              },
              effect: {
                kind: 'dealDamage',
                amount: { kind: 'powerOf', of: THIS },
                from: THIS,
                to: { kind: 'eachOpponent' },
              },
            },
          ],
        },
      },
    ],
  }),
];
