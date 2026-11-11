/**
 * Real instant and sorcery fixtures. Hand-written from the cards' Oracle text; UNVERIFIED
 * against Scryfall until the M4 import or the A20 spike matches them (oracleId is null).
 *
 * Healing Salve (A27) is replaced by Angel's Mercy because Healing Salve's prevention mode
 * needs the M5 prevention library (D-036). Colors come from the mana cost (CR 105.2).
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SPELL_FIXTURES: readonly CardDefinition[] = [
  singleFace({
    name: 'Lightning Bolt',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Lightning Bolt deals 3 damage to any target.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
      effect: { kind: 'dealDamage', amount: 3, to: { kind: 'target', id: 't1' } },
    },
  }),
  singleFace({
    name: 'Murder',
    manaCost: ['1', 'B', 'B'],
    types: ['instant'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Destroy target creature.',
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
    },
  }),
  singleFace({
    name: 'Unsummon',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: "Return target creature to its owner's hand.",
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'hand' },
    },
  }),
  singleFace({
    name: 'Counterspell',
    manaCost: ['U', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Counter target spell.',
    spell: {
      targets: [
        { id: 't1', what: { kind: 'object', filter: { zone: 'stack', stackKind: 'spell' } } },
      ],
      effect: { kind: 'counter', objects: { kind: 'target', id: 't1' } },
    },
  }),
  singleFace({
    name: 'Divination',
    manaCost: ['2', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw two cards.',
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 2 } },
  }),
  singleFace({
    name: "Angel's Mercy",
    manaCost: ['2', 'W', 'W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'You gain 7 life.',
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 7 } },
  }),
];
