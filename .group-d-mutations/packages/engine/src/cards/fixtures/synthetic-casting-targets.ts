/**
 * SYNTHETIC CARDS FOR CASTING AND TARGETS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-181 (the Korvold slice 3): a target chosen only if the spell was kicked and one chosen only if it was not (CR 702.33g,
 * 601.2c), an additional cost the caster pays in one of two ways (CR 118.8, 601.2b), a spell's own cost reduction with a condition (CR 601.2f), and
 * the change of the target of a spell or ability with a single target (CR 115.7a). Names start with "SYNTHETIC "; oracleId is null. The text has the
 * wording of the real cards the shapes come from (the owner's request file of 2026-10-29, the name replaced by ~); it is not their definition.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const KICKED = { kind: 'kicked' } as const;
const exile = (id: string) => ({ kind: 'exile', objects: { kind: 'target', id } }) as const;

export const SYNTHETIC_CASTING_TARGETS_LIST: readonly CardDefinition[] = [
  // "Kicker {1}{B}. Exile target artifact or enchantment. If this spell was kicked, exile target nonland permanent instead."
  singleFace({
    name: 'SYNTHETIC Rend Asunder',
    manaCost: ['1', 'G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['B', 'G'],
    oracleText:
      'Kicker {1}{B} (You may pay an additional {1}{B} as you cast this spell.)\nExile target artifact or enchantment. If this spell was kicked, exile target nonland permanent instead.',
    abilities: [
      {
        kind: 'keyword',
        keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['1', 'B'] }] },
      },
    ],
    spell: {
      targets: [
        {
          id: 't1',
          unlessKicked: true,
          what: {
            kind: 'object',
            filter: {
              zone: 'battlefield',
              anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
            },
          },
        },
        {
          id: 't2',
          ifKicked: true,
          what: { kind: 'object', filter: { zone: 'battlefield', notTypes: ['land'] } },
        },
      ],
      effect: { kind: 'conditional', condition: KICKED, effect: exile('t2'), else: exile('t1') },
    },
  }),
  // "Kicker {2}. Draw a card. If this spell was kicked, destroy target creature." The only target is the kicked spell's.
  singleFace({
    name: 'SYNTHETIC Kicked Hex',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Kicker {2}\nDraw a card. If this spell was kicked, destroy target creature.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['2'] }] } },
    ],
    spell: {
      targets: [
        {
          id: 't1',
          ifKicked: true,
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: { kind: 'you' }, count: 1 },
          {
            kind: 'conditional',
            condition: KICKED,
            effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
          },
        ],
      },
    },
  }),
  // "As an additional cost to cast this spell, sacrifice an artifact or creature or pay {4}. Destroy target creature."
  singleFace({
    name: 'SYNTHETIC Stir Trouble',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'As an additional cost to cast this spell, sacrifice an artifact or creature or pay {4}.\nDestroy target creature.',
    additionalCostChoice: [
      [
        {
          kind: 'sacrifice',
          what: { anyOf: [{ types: ['artifact'] }, { types: ['creature'] }] },
        },
      ],
      [{ kind: 'mana', symbols: ['4'] }],
    ],
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
  // "This spell costs {3} less to cast if you control a creature with power 4 or greater.
  //  Change the target of target spell or ability with a single target."
  singleFace({
    name: 'SYNTHETIC Bent Bolt',
    manaCost: ['3', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'This spell costs {3} less to cast if you control a creature with power 4 or greater.\nChange the target of target spell or ability with a single target.',
    abilities: [
      {
        kind: 'static',
        static: { kind: 'costReduction', spells: { kind: 'this' }, amount: 3 },
        condition: {
          kind: 'controlsAtLeast',
          filter: { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
          count: 1,
        },
      },
    ],
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'stack', singleTarget: true } },
        },
      ],
      effect: { kind: 'changeTarget', object: { kind: 'target', id: 't1' } },
    },
  }),
];
